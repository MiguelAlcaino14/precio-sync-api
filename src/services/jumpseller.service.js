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
 *   mapaSku:    sku exacto   → { productId }
 *   mapaNombre: nombre norm. → { productId }
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
      const prod = p.product ?? p; // JumpSeller wraps cada item en {product: {...}}
      const sku  = String(prod.sku || prod.variants?.[0]?.sku || '').trim();
      if (sku) mapaSku[sku] = { productId: prod.id };
      if (prod.name) {
        const norm = normNombre(prod.name);
        if (norm) mapaNombre[norm] = { productId: prod.id };
      }
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

    // Consultar MapeoSku primero
    if (c.proveedorId) {
      const mapeo = await buscarMapeo(c.proveedorId, normSku(c.sku));
      if (mapeo && mapeo.estado === 'confirmado' && mapeo.jumpsellerProductId) {
        info = { productId: mapeo.jumpsellerProductId };
      }
    }

    if (!info) info = mapaSku[c.sku] ?? null;

    if (!info && c.nombre) {
      info = mapaNombre[normNombre(c.nombre)] ?? null;
      if (info) matchPorNombre = true;
    }

    if (!info) {
      resultados.push({ id: c.id, sku: c.sku, ok: false, error: 'No encontrado en JumpSeller (SKU ni nombre)' });
      continue;
    }

    try {
      await jsPut(`/products/${info.productId}.json`, {
        product: { price: c.precioVenta },
      });
      resultados.push({ id: c.id, sku: c.sku, ok: true, matchPorNombre });
      await sleep(DELAY);
    } catch (e) {
      resultados.push({ id: c.id, sku: c.sku, ok: false, error: e.message });
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

module.exports = { publicarPrecios, generarCSVImport, marcarPublicados, construirMapas, normNombre };
