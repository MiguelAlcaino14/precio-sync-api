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
// Trae todos los productos de JumpSeller y actualiza PrecioVenta por SKU o nombre
router.post('/jumpseller', requireAdmin, syncLimiter, async (req, res) => {
  if (!process.env.JUMPSELLER_LOGIN || !process.env.JUMPSELLER_TOKEN) {
    return res.status(400).json({ error: 'JUMPSELLER_LOGIN y JUMPSELLER_TOKEN no configurados' });
  }

  try {
    // Cargar todos los Productos internos en mapas para lookup O(1)
    const productos = await prisma.producto.findMany({
      select: { id: true, sku: true, nombre: true },
    });
    const porSku    = new Map(productos.map(p => [String(p.sku).trim(), p]));
    const porNombre = new Map(productos.map(p => [normNombre(p.nombre), p]));

    let totalJS = 0, sincSku = 0, sincNombre = 0, sinMatch = 0;
    let page = 1;
    const limit = 100;

    while (true) {
      const url = `${BASE}/products.json?${authQuery()}&limit=${limit}&page=${page}`;
      const resp = await fetchWithTimeout(url);
      if (!resp.ok) throw new Error(`JumpSeller ${resp.status} GET /products.json`);
      const products = await resp.json();
      if (!Array.isArray(products) || products.length === 0) break;

      for (const p of products) {
        totalJS++;
        const precio = Number(p.price) || Number(p.variants?.[0]?.price) || 0;
        if (!precio || precio <= 0) continue;

        let producto = null;
        let matchadoPorNombre = false;

        // 1. Match por SKU (producto o variant — JumpSeller a veces pone SKU en variant)
        const skuJS = String(p.sku || p.variants?.[0]?.sku || '').trim();
        if (skuJS) {
          producto = porSku.get(skuJS) ?? null;
        }

        // 2. Match por nombre si no tiene SKU o no encontró por SKU
        if (!producto && p.name) {
          const nombreNorm = normNombre(p.name);
          producto = porNombre.get(nombreNorm) ?? null;
          if (producto) matchadoPorNombre = true;
        }

        if (!producto) { sinMatch++; continue; }

        // Upsert PrecioVenta con precio real de JumpSeller
        await prisma.precioVenta.upsert({
          where:  { productoId: producto.id },
          update: { precio, updatedAt: new Date() },
          create: { productoId: producto.id, precio },
        });

        if (matchadoPorNombre) {
          sincNombre++;
          // Persistir mapeo nombre → sku para imports futuros
          await prisma.nombreMapeo.upsert({
            where: {
              proveedorSlug_nombreProveedor: {
                proveedorSlug:    'jumpseller',
                nombreProveedor:  p.name,
              },
            },
            update: { jumpsellerProductId: p.id },
            create: {
              proveedorSlug:      'jumpseller',
              nombreProveedor:    p.name,
              sku:                producto.sku,
              jumpsellerProductId: p.id,
            },
          });
        } else {
          sincSku++;
        }
      }

      if (products.length < limit) break;
      page++;
      await sleep(DELAY);
    }

    console.log(`[sync/jumpseller] total=${totalJS} sincSku=${sincSku} sincNombre=${sincNombre} sinMatch=${sinMatch}`);
    res.json({ totalJS, sincSku, sincNombre, sinMatch });
  } catch (err) {
    console.error('[sync/jumpseller] error:', err.message);
    res.status(500).json({ error: 'Error al sincronizar con JumpSeller' });
  }
});

module.exports = router;
