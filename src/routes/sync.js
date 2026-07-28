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

// POST /api/sync/revertir-recalculo
// Elimina CambioPendiente aprobados y PrecioVenta creados incorrectamente para
// productos que nunca fueron publicados a JumpSeller (sin historial 'publicado').
router.post('/revertir-recalculo', requireAdmin, async (req, res) => {
  try {
    // Productos con al menos un cambio publicado → tenían precio legítimo
    const publicados = await prisma.cambioPendiente.findMany({
      where:  { estado: 'publicado' },
      select: { productoId: true },
      distinct: ['productoId'],
    });
    const idsLegitimos = publicados.map(c => c.productoId);

    // Eliminar aprobados de productos que NUNCA fueron publicados
    const { count: cambiosEliminados } = await prisma.cambioPendiente.deleteMany({
      where: {
        estado:     'aprobado',
        productoId: { notIn: idsLegitimos },
      },
    });

    // Eliminar PrecioVenta creados incorrectamente para esos mismos productos
    const { count: preciosEliminados } = await prisma.precioVenta.deleteMany({
      where: { productoId: { notIn: idsLegitimos } },
    });

    console.log(`[sync/revertir-recalculo] cambios=${cambiosEliminados} precios=${preciosEliminados} intactos=${idsLegitimos.length}`);
    res.json({ cambiosEliminados, preciosEliminados, productosIntactos: idsLegitimos.length });
  } catch (err) {
    console.error('[sync/revertir-recalculo] error:', err.message);
    res.status(500).json({ error: 'Error al revertir recálculo' });
  }
});

// POST /api/sync/limpiar-duplicados
// Deja solo el CambioPendiente más reciente por producto en estado 'aprobado'.
// Usar para limpiar duplicados generados por llamadas múltiples a recalcular-precios.
router.post('/limpiar-duplicados', requireAdmin, async (req, res) => {
  try {
    const aprobados = await prisma.cambioPendiente.findMany({
      where:   { estado: 'aprobado' },
      orderBy: { createdAt: 'desc' },
      select:  { id: true, productoId: true },
    });

    const vistos  = new Set();
    const eliminar = [];
    for (const c of aprobados) {
      if (vistos.has(c.productoId)) {
        eliminar.push(c.id);
      } else {
        vistos.add(c.productoId);
      }
    }

    if (eliminar.length) {
      await prisma.cambioPendiente.deleteMany({ where: { id: { in: eliminar } } });
    }

    console.log(`[sync/limpiar-duplicados] eliminados=${eliminar.length} restantes=${vistos.size}`);
    res.json({ eliminados: eliminar.length, aprobadosRestantes: vistos.size });
  } catch (err) {
    console.error('[sync/limpiar-duplicados] error:', err.message);
    res.status(500).json({ error: 'Error al limpiar duplicados' });
  }
});

// POST /api/sync/recalcular-precios
// Recalcula precios de productos que YA TIENEN precio publicado en JumpSeller.
// Optimizado: carga productos + reglas en 2 queries, calcula en memoria, escribe en bulk.
router.post('/recalcular-precios', requireAdmin, async (req, res) => {
  try {
    const [productos, reglas] = await Promise.all([
      prisma.producto.findMany({
        where: { precioVenta: { isNot: null } }, // solo productos ya publicados
        include: {
          costos:      { orderBy: { createdAt: 'desc' }, take: 1 },
          precioVenta: true,
        },
      }),
      prisma.reglaMarkup.findMany({
        where: { activa: true },
        orderBy: { prioridad: 'desc' },
      }),
    ]);

    // Mismo orden que markup.service.js: SKU específico primero, luego prioridad
    reglas.sort((a, b) => {
      const aHasSku = a.sku ? 1 : 0;
      const bHasSku = b.sku ? 1 : 0;
      if (bHasSku !== aHasSku) return bHasSku - aHasSku;
      return b.prioridad - a.prioridad;
    });

    function calcularPrecio(producto, costo) {
      for (const r of reglas) {
        if (r.proveedorId && r.proveedorId !== producto.proveedorId) continue;
        if (r.sku         && r.sku         !== producto.sku)          continue;
        if (r.marca       && r.marca       !== producto.marca)        continue;
        if (r.categoria   && r.categoria   !== producto.categoria)    continue;
        if (r.nombreContiene && !producto.nombre?.toLowerCase().includes(r.nombreContiene.toLowerCase())) continue;
        if (r.costoMin != null && costo < r.costoMin) continue;
        if (r.costoMax != null && costo > r.costoMax) continue;
        return Math.ceil((costo * (1 + r.markupPct / 100)) / 10) * 10;
      }
      return Math.ceil((costo * 1.31) / 10) * 10;
    }

    const ahora     = new Date();
    const conCambio = [];
    let sinCambio   = 0, sinCosto = 0;

    for (const producto of productos) {
      const ultimoCosto = producto.costos[0];
      if (!ultimoCosto) { sinCosto++; continue; }

      const precioNuevo  = calcularPrecio(producto, ultimoCosto.costo);
      const precioActual = producto.precioVenta?.precio ?? null;
      if (precioActual === precioNuevo) { sinCambio++; continue; }

      conCambio.push({ producto, ultimoCosto, precioNuevo, precioActual });
    }

    if (conCambio.length) {
      const ids = conCambio.map(x => x.producto.id);

      // Marcar pendientes y aprobados anteriores como reemplazados (1 query)
      await prisma.cambioPendiente.updateMany({
        where: { productoId: { in: ids }, estado: { in: ['pendiente', 'aprobado'] } },
        data:  { estado: 'reemplazado' },
      });

      // Insertar nuevos cambios en bulk (1 query)
      await prisma.cambioPendiente.createMany({
        data: conCambio.map(({ producto, ultimoCosto, precioNuevo, precioActual }) => ({
          productoId:    producto.id,
          costoAnterior: ultimoCosto.costo,
          costoNuevo:    ultimoCosto.costo,
          precioActual,
          precioSugerido: precioNuevo,
          estado:         'aprobado',
          aprobadoAt:     ahora,
          archivoId:      ultimoCosto.archivoId ?? null,
        })),
      });

      // Upsert PrecioVenta en transacción (1 roundtrip)
      await prisma.$transaction(
        conCambio.map(({ producto, precioNuevo }) =>
          prisma.precioVenta.upsert({
            where:  { productoId: producto.id },
            update: { precio: precioNuevo, updatedAt: ahora },
            create: { productoId: producto.id, precio: precioNuevo },
          }),
        ),
      );
    }

    const recalculados = conCambio.length;
    console.log(`[sync/recalcular-precios] total=${productos.length} recalculados=${recalculados} sinCambio=${sinCambio} sinCosto=${sinCosto}`);
    res.json({ total: productos.length, recalculados, sinCambio, sinCosto });
  } catch (err) {
    console.error('[sync/recalcular-precios] error:', err.message);
    res.status(500).json({ error: 'Error al recalcular precios' });
  }
});

module.exports = router;
