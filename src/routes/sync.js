const express    = require('express');
const rateLimit  = require('express-rate-limit');
const prisma     = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const BASE    = 'https://api.jumpseller.com/v1';
const DELAY   = 650;
const TIMEOUT = 30_000;

const syncLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 2,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Sincronización ejecutada recientemente, espera 5 minutos' },
});

function authQuery() {
  const login = process.env.JUMPSELLER_LOGIN;
  const token = process.env.JUMPSELLER_TOKEN;
  if (!login || !token) throw new Error('JUMPSELLER_LOGIN y JUMPSELLER_TOKEN no configurados');
  return `login=${encodeURIComponent(login)}&authtoken=${encodeURIComponent(token)}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const normNombre = s => String(s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\w\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// POST /api/sync/jumpseller
// Trae todos los productos de JumpSeller y actualiza PrecioVenta usando MapeoSku confirmado
router.post('/jumpseller', requireAdmin, syncLimiter, async (req, res) => {
  if (!process.env.JUMPSELLER_LOGIN || !process.env.JUMPSELLER_TOKEN) {
    return res.status(400).json({ error: 'JUMPSELLER_LOGIN y JUMPSELLER_TOKEN no configurados' });
  }

  try {
    // Cargar mapeos confirmados: jumpsellerProductId → productoId (via proveedor+sku)
    const mapeos = await prisma.mapeoSku.findMany({
      where:   { estado: 'confirmado', jumpsellerProductId: { not: null } },
      select:  { jumpsellerProductId: true, proveedorId: true, skuProveedor: true },
    });

    // jumpsellerProductId → productoId (buscamos el Producto local)
    const skuPairs = mapeos.map(m => ({ proveedorId: m.proveedorId, sku: m.skuProveedor }));
    const productos = skuPairs.length
      ? await prisma.producto.findMany({
          where:  { OR: skuPairs.map(p => ({ proveedorId: p.proveedorId, sku: p.sku })) },
          select: { id: true, sku: true, proveedorId: true },
        })
      : [];

    // jsProductId → productoId
    const productoMap = new Map();
    for (const m of mapeos) {
      const prod = productos.find(p => p.proveedorId === m.proveedorId && p.sku === m.skuProveedor);
      if (prod) productoMap.set(m.jumpsellerProductId, prod.id);
    }

    let totalJS = 0, sincronizados = 0, sinMatch = 0;
    let page = 1;
    const limit = 100;

    while (true) {
      const url = `${BASE}/products.json?${authQuery()}&limit=${limit}&page=${page}`;
      const resp = await fetchWithTimeout(url);
      if (!resp.ok) throw new Error(`JumpSeller ${resp.status} GET /products.json`);
      const products = await resp.json();
      if (!Array.isArray(products) || products.length === 0) break;

      for (const raw of products) {
        const p = raw.product ?? raw;
        totalJS++;
        const precio = Number(p.price) || Number(p.variants?.[0]?.price) || 0;
        if (!precio || precio <= 0) continue;

        const productoId = productoMap.get(p.id);
        if (!productoId) { sinMatch++; continue; }

        await prisma.precioVenta.upsert({
          where:  { productoId },
          update: { precio, updatedAt: new Date() },
          create: { productoId, precio },
        });
        sincronizados++;
      }

      if (products.length < limit) break;
      page++;
      await sleep(DELAY);
    }

    console.log(`[sync/jumpseller] total=${totalJS} sincronizados=${sincronizados} sinMatch=${sinMatch}`);
    res.json({ totalJS, sincronizados, sinMatch });
  } catch (err) {
    console.error('[sync/jumpseller] error:', err.message);
    res.status(500).json({ error: 'Error al sincronizar con JumpSeller' });
  }
});

module.exports = router;
