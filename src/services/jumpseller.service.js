const prisma = require('../db');

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

/**
 * Pagina los productos de JumpSeller y construye un mapa sku → {productId, variantId}.
 * Se detiene cuando encuentra todos los SKUs buscados o agota las páginas.
 */
async function construirMapaSku(skuSet) {
  const mapa  = {};
  let   page  = 1;
  const limit = 100;

  while (skuSet.size > 0) {
    const products = await jsGet('/products.json', `limit=${limit}&page=${page}`);
    if (!Array.isArray(products) || products.length === 0) break;

    for (const p of products) {
      for (const v of (p.variants || [])) {
        if (v.sku && skuSet.has(v.sku)) {
          mapa[v.sku] = { productId: p.id, variantId: v.id };
          skuSet.delete(v.sku);
        }
      }
    }

    if (products.length < limit) break;
    page++;
    await sleep(DELAY);
  }

  return mapa;
}

/**
 * Publica precios en JumpSeller vía API.
 * @param {Array<{id, sku, precioVenta}>} cambios
 * @returns {Array<{id, sku, ok, error?}>}
 */
async function publicarPrecios(cambios) {
  const skuSet = new Set(cambios.map(c => c.sku));
  const mapa   = await construirMapaSku(new Set(skuSet));

  const resultados = [];

  for (const c of cambios) {
    const info = mapa[c.sku];

    if (!info) {
      resultados.push({ id: c.id, sku: c.sku, ok: false, error: 'SKU no encontrado en JumpSeller' });
      continue;
    }

    try {
      await jsPut(`/products/${info.productId}/variants/${info.variantId}.json`, {
        variant: { price: c.precioVenta },
      });
      resultados.push({ id: c.id, sku: c.sku, ok: true });
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

module.exports = { publicarPrecios, generarCSVImport, marcarPublicados };
