const prisma = require('../db');
const { buscarMapeo, normSku } = require('./mapeo.service');

const BASE  = 'https://api.jumpseller.com/v1';
const DELAY = 600; // JumpSeller rate limit: 2 req/seg (60/min)

function authQuery() {
  const login = process.env.JUMPSELLER_LOGIN;
  const token = process.env.JUMPSELLER_TOKEN;
  if (!login || !token) throw new Error('JUMPSELLER_LOGIN y JUMPSELLER_TOKEN no están configurados');
  return `login=${encodeURIComponent(login)}&authtoken=${encodeURIComponent(token)}`;
}

async function jsGet(path, params = '') {
  const url = `${BASE}${path}?${authQuery()}${params ? '&' + params : ''}`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`JumpSeller ${res.status} GET ${path}`);
  return res.json();
}

async function jsPut(path, body) {
  const url = `${BASE}${path}?${authQuery()}`;
  const res  = await fetch(url, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`JumpSeller ${res.status} PUT ${path}: ${txt}`);
  }
  return res.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const normNombre = s => String(s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\w\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * Pagina todos los productos de JumpSeller y construye dos mapas:
 *   mapaSku:    sku exacto   → { productId, nombre, sku }
 *   mapaNombre: nombre norm. → { productId, nombre, sku }
 */
async function construirMapas() {
  const mapaSku    = {};
  const mapaNombre = {};
  let   page  = 1;
  const limit = 100;

  while (true) {
    const products = await jsGet('/products.json', `limit=${limit}&page=${page}`);
    if (!Array.isArray(products) || products.length === 0) break;

    for (const p of products) {
      const prod   = p.product ?? p;
      const sku    = String(prod.sku || prod.variants?.[0]?.sku || '').trim();
      const nombre = prod.name ? String(prod.name).trim() : '';
      const entry  = { productId: prod.id, nombre, sku };
      if (sku)    mapaSku[sku]                = entry;
      if (nombre) mapaNombre[normNombre(nombre)] = entry;
    }

    if (products.length < limit) break;
    page++;
    await sleep(DELAY);
  }

  return { mapaSku, mapaNombre };
}

/**
 * Publica precios en JumpSeller vía API.
 * @param {Array<{id, sku, precioVenta}>} cambios
 * @returns {Array<{id, sku, ok, error?}>}
 */
async function publicarPrecios(cambios) {
  const { mapaSku, mapaNombre } = await construirMapas();
  const resultados = [];

  for (const c of cambios) {
    let info           = null;
    let matchPorNombre = false;

    // Consultar MapeoSku y sus vínculos extra
    const productIds = new Set();
    if (c.proveedorId) {
      const mapeo = await prisma.mapeoSku.findUnique({
        where:   { proveedorId_skuProveedor: { proveedorId: c.proveedorId, skuProveedor: normSku(c.sku) } },
        include: { links: { select: { jumpsellerProductId: true } } },
      });
      if (mapeo && mapeo.estado === 'confirmado') {
        if (mapeo.jumpsellerProductId) productIds.add(mapeo.jumpsellerProductId);
        for (const l of mapeo.links ?? []) productIds.add(l.jumpsellerProductId);
      }
    }

    if (!productIds.size) {
      const bysku = mapaSku[c.sku];
      if (bysku) productIds.add(bysku.productId);
    }

    if (!productIds.size && c.nombre) {
      const byNombre = mapaNombre[normNombre(c.nombre)];
      if (byNombre) { productIds.add(byNombre.productId); matchPorNombre = true; }
    }

    if (!productIds.size) {
      resultados.push({ id: c.id, sku: c.sku, ok: false, error: 'No encontrado en JumpSeller (SKU ni nombre)' });
      continue;
    }

    let okCount = 0; let lastErr = null;
    for (const productId of productIds) {
      try {
        await jsPut(`/products/${productId}.json`, { product: { price: c.precioVenta } });
        okCount++;
        await sleep(DELAY);
      } catch (e) { lastErr = e.message; }
    }
    if (okCount > 0) {
      resultados.push({ id: c.id, sku: c.sku, ok: true, matchPorNombre, actualizados: okCount });
    } else {
      resultados.push({ id: c.id, sku: c.sku, ok: false, error: lastErr });
    }
  }

  return resultados;
}

/**
 * Genera CSV de importación para JumpSeller (formato legado, mantener como respaldo).
 */
async function generarCSVImport(proveedorId) {
  const where = {
    estado: 'aprobado',
    ...(proveedorId ? { producto: { proveedorId } } : {}),
  };

  const cambios = await prisma.cambioPendiente.findMany({
    where,
    include: { producto: true },
  });

  const lineas = ['SKU,Price'];
  for (const c of cambios) {
    const precio = c.precioSugerido ?? c.precioActual;
    if (precio) lineas.push(`${c.producto.sku},${precio}`);
  }

  return lineas.join('\n');
}

async function marcarPublicados(ids) {
  await prisma.cambioPendiente.updateMany({
    where: { id: { in: ids } },
    data:  { estado: 'publicado' },
  });
}

/**
 * Aplica precio de oferta con compare_at_price en JumpSeller.
 */
async function aplicarPrecioOferta(jsProductId, precioOferta, precioOriginal) {
  await jsPut(`/products/${jsProductId}.json`, {
    product: { price: precioOferta, original_price: precioOriginal },
  });
  await sleep(DELAY);
}

/**
 * Revierte precio de oferta: restaura precio original y quita compare_at_price.
 */
async function revertirPrecioOferta(jsProductId, precioOriginal) {
  await jsPut(`/products/${jsProductId}.json`, {
    product: { price: precioOriginal, original_price: null },
  });
  await sleep(DELAY);
}

module.exports = { publicarPrecios, generarCSVImport, marcarPublicados, construirMapas, normNombre, aplicarPrecioOferta, revertirPrecioOferta };
