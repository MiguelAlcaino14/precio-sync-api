const express  = require('express');
const router   = express.Router();
const prisma   = require('../db');
const { construirMapas } = require('../services/jumpseller.service');
const { normSku } = require('../services/mapeo.service');

// Cache JumpSeller (TTL 5 min, promise lock anti-race)
let _mapaCache = null, _mapaCacheAt = 0, _mapaPromise = null;
const CACHE_TTL = 5 * 60 * 1000;

async function getMapaJS() {
  if (_mapaCache && Date.now() - _mapaCacheAt < CACHE_TTL) return _mapaCache;
  if (_mapaPromise) return _mapaPromise;
  _mapaPromise = construirMapas().then(mapa => {
    _mapaCache = mapa; _mapaCacheAt = Date.now(); _mapaPromise = null; return mapa;
  }).catch(err => { _mapaPromise = null; throw err; });
  return _mapaPromise;
}

const INCLUDE_BASE = {
  proveedor: { select: { nombre: true, tema: true } },
  links:     { select: { id: true, jumpsellerProductId: true, jumpsellerNombre: true, creadoEn: true }, orderBy: { creadoEn: 'asc' } },
};
const INCLUDE_PROVEEDOR = INCLUDE_BASE;

function buildWhere({ proveedorId, estado, categoria, q }) {
  const where = {};
  if (estado && estado !== 'todos') where.estado = estado;
  if (proveedorId) where.proveedorId = proveedorId;
  if (categoria)   where.proveedor = { tema: categoria };
  if (q) {
    where.OR = [
      { skuProveedor:   { contains: q, mode: 'insensitive' } },
      { skuOriginal:    { contains: q, mode: 'insensitive' } },
      { nombreProducto: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}

// GET /api/mapeo/items
router.get('/items', async (req, res) => {
  try {
    const page        = Math.max(1, parseInt(req.query.page)  || 1);
    const limit       = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const skip        = (page - 1) * limit;
    const estado      = req.query.estado      || 'pendiente';
    const proveedorId = req.query.proveedorId || undefined;
    const categoria   = req.query.categoria   || undefined;
    const q           = String(req.query.q || '').trim().slice(0, 100) || undefined;

    const where = buildWhere({ proveedorId, estado, categoria, q });

    const [total, items] = await Promise.all([
      prisma.mapeoSku.count({ where }),
      prisma.mapeoSku.findMany({ where, skip, take: limit, orderBy: { creadoEn: 'desc' }, include: INCLUDE_PROVEEDOR }),
    ]);

    // Enriquecer con marca del Producto local
    if (items.length) {
      const productos = await prisma.producto.findMany({
        where: { OR: items.map(it => ({ proveedorId: it.proveedorId, sku: it.skuProveedor })) },
        select: { proveedorId: true, sku: true, marca: true },
      });
      const marcaMap = {};
      productos.forEach(p => { marcaMap[`${p.proveedorId}:${p.sku}`] = p.marca; });
      items.forEach(it => { it.marca = marcaMap[`${it.proveedorId}:${it.skuProveedor}`] ?? null; });
    }

    res.json({ total, page, limit, totalPaginas: Math.ceil(total / limit), items });
  } catch (err) {
    console.error('GET /mapeo/items error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/mapeo/pendientes (alias legacy)
router.get('/pendientes', async (req, res) => {
  const page        = Math.max(1, parseInt(req.query.page)  || 1);
  const limit       = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
  const skip        = (page - 1) * limit;
  const proveedorId = req.query.proveedorId || undefined;
  const where       = { estado: 'pendiente', ...(proveedorId ? { proveedorId } : {}) };
  try {
    const [total, items] = await Promise.all([
      prisma.mapeoSku.count({ where }),
      prisma.mapeoSku.findMany({ where, skip, take: limit, orderBy: { creadoEn: 'desc' }, include: INCLUDE_PROVEEDOR }),
    ]);
    res.json({ total, page, limit, totalPaginas: Math.ceil(total / limit), items });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/mapeo/buscar-jumpseller?q=
router.get('/buscar-jumpseller', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (q.length < 3) return res.json([]);
    const mapa    = await getMapaJS();
    const qLower  = q.toLowerCase();
    const result  = [];
    for (const [nombre, { productId }] of Object.entries(mapa.mapaNombre)) {
      if (nombre.includes(qLower)) {
        result.push({ productId, nombre });
        if (result.length >= 20) break;
      }
    }
    res.json(result);
  } catch (err) {
    console.error('GET /mapeo/buscar-jumpseller error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/mapeo/stats
router.get('/stats', async (req, res) => {
  try {
    const [total, confirmados, pendientes, ignorados, ambiguos, pendientesSinMatch] = await Promise.all([
      prisma.mapeoSku.count(),
      prisma.mapeoSku.count({ where: { estado: 'confirmado' } }),
      prisma.mapeoSku.count({ where: { estado: 'pendiente'  } }),
      prisma.mapeoSku.count({ where: { estado: 'ignorado'   } }),
      prisma.mapeoSku.count({ where: { estado: 'ambiguo'    } }),
      prisma.mapeoSku.count({ where: { estado: 'pendiente', similitud: null, jumpsellerProductId: null } }),
    ]);
    res.json({ total, confirmados, pendientes, ignorados, ambiguos, pendientesSinMatch });
  } catch (err) {
    console.error('GET /mapeo/stats error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/mapeo/comparar/:sku — todos los items con ese SKU en todos los proveedores
router.get('/comparar/:sku', async (req, res) => {
  try {
    const sku   = normSku(req.params.sku);
    const items = await prisma.mapeoSku.findMany({
      where:   { skuProveedor: sku },
      include: INCLUDE_PROVEEDOR,
      orderBy: { creadoEn: 'asc' },
    });
    res.json(items);
  } catch (err) {
    console.error('GET /mapeo/comparar/:sku error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/mapeo/detectar-conflictos — marca pendientes con SKU duplicado como ambiguo
router.post('/detectar-conflictos', async (req, res) => {
  try {
    const duplicados = await prisma.$queryRaw`
      SELECT "skuProveedor"
      FROM "MapeoSku"
      GROUP BY "skuProveedor"
      HAVING COUNT(DISTINCT "proveedorId") > 1
    `;
    const skus = duplicados.map(r => r.skuProveedor);
    if (!skus.length) return res.json({ marcados: 0, skusConflicto: 0 });
    const { count } = await prisma.mapeoSku.updateMany({
      where: { skuProveedor: { in: skus }, estado: 'pendiente' },
      data:  { estado: 'ambiguo' },
    });
    res.json({ marcados: count, skusConflicto: skus.length });
  } catch (err) {
    console.error('POST /mapeo/detectar-conflictos error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/mapeo/bulk/ignorar
router.post('/bulk/ignorar', async (req, res) => {
  try {
    const ids = req.body.ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 500)
      return res.status(400).json({ error: 'ids debe ser un array de 1 a 500 elementos' });
    const { count } = await prisma.mapeoSku.updateMany({ where: { id: { in: ids } }, data: { estado: 'ignorado' } });
    res.json({ actualizados: count });
  } catch (err) {
    console.error('POST /mapeo/bulk/ignorar error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/mapeo/bulk/restaurar
router.post('/bulk/restaurar', async (req, res) => {
  try {
    const ids = req.body.ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 500)
      return res.status(400).json({ error: 'ids debe ser un array de 1 a 500 elementos' });
    const { count } = await prisma.mapeoSku.updateMany({ where: { id: { in: ids } }, data: { estado: 'pendiente' } });
    res.json({ actualizados: count });
  } catch (err) {
    console.error('POST /mapeo/bulk/restaurar error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/mapeo/bulk/confirmar
router.post('/bulk/confirmar', async (req, res) => {
  try {
    const { ids, jumpsellerProductId } = req.body;
    if (!Array.isArray(ids) || !ids.length || ids.length > 500)
      return res.status(400).json({ error: 'ids debe ser un array de 1 a 500 elementos' });
    if (!jumpsellerProductId || !Number.isInteger(jumpsellerProductId) || jumpsellerProductId <= 0)
      return res.status(400).json({ error: 'jumpsellerProductId debe ser un entero positivo' });
    const { count } = await prisma.mapeoSku.updateMany({
      where: { id: { in: ids } },
      data:  { estado: 'confirmado', jumpsellerProductId, similitud: null },
    });
    res.json({ actualizados: count });
  } catch (err) {
    console.error('POST /mapeo/bulk/confirmar error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/mapeo/:id/confirmar
router.post('/:id/confirmar', async (req, res) => {
  try {
    const { jumpsellerProductId, nombreProducto } = req.body;
    if (!jumpsellerProductId || !Number.isInteger(jumpsellerProductId) || jumpsellerProductId <= 0)
      return res.status(400).json({ error: 'jumpsellerProductId debe ser un entero positivo' });
    const data = { estado: 'confirmado', jumpsellerProductId, similitud: null };
    if (nombreProducto && typeof nombreProducto === 'string')
      data.nombreProducto = nombreProducto.trim().slice(0, 500);
    res.json(await prisma.mapeoSku.update({ where: { id: req.params.id }, data, include: INCLUDE_PROVEEDOR }));
  } catch (err) {
    console.error('POST /mapeo/:id/confirmar error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/mapeo/:id/ignorar
router.post('/:id/ignorar', async (req, res) => {
  try {
    res.json(await prisma.mapeoSku.update({ where: { id: req.params.id }, data: { estado: 'ignorado' } }));
  } catch (err) {
    console.error('POST /mapeo/:id/ignorar error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/mapeo/:id/restaurar
router.post('/:id/restaurar', async (req, res) => {
  try {
    res.json(await prisma.mapeoSku.update({ where: { id: req.params.id }, data: { estado: 'pendiente' } }));
  } catch (err) {
    console.error('POST /mapeo/:id/restaurar error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/mapeo/:id/links — agregar vínculo JumpSeller extra
router.post('/:id/links', async (req, res) => {
  try {
    const { jumpsellerProductId, jumpsellerNombre } = req.body;
    if (!jumpsellerProductId || !Number.isInteger(jumpsellerProductId) || jumpsellerProductId <= 0)
      return res.status(400).json({ error: 'jumpsellerProductId debe ser un entero positivo' });
    const mapeo = await prisma.mapeoSku.findUnique({ where: { id: req.params.id } });
    if (!mapeo) return res.status(404).json({ error: 'Item no encontrado' });
    // No duplicar el vínculo principal
    if (mapeo.jumpsellerProductId === jumpsellerProductId)
      return res.status(409).json({ error: 'Ese producto ya es el vínculo principal de este item' });
    const link = await prisma.mapeoSkuLink.upsert({
      where:  { mapeoSkuId_jumpsellerProductId: { mapeoSkuId: req.params.id, jumpsellerProductId } },
      update: { jumpsellerNombre: jumpsellerNombre?.trim().slice(0, 500) ?? null },
      create: { mapeoSkuId: req.params.id, jumpsellerProductId, jumpsellerNombre: jumpsellerNombre?.trim().slice(0, 500) ?? null },
    });
    res.json(link);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ese vínculo ya existe' });
    console.error('POST /mapeo/:id/links error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /api/mapeo/:id/links/:linkId — eliminar vínculo extra
router.delete('/:id/links/:linkId', async (req, res) => {
  try {
    await prisma.mapeoSkuLink.delete({
      where: { id: req.params.linkId, mapeoSkuId: req.params.id },
    });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Vínculo no encontrado' });
    console.error('DELETE /mapeo/:id/links/:linkId error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /api/mapeo/:id — editar SKU y/o nombre
router.put('/:id', async (req, res) => {
  try {
    const { skuProveedor: nuevoSku, nombreProducto } = req.body;
    if (nuevoSku === undefined && nombreProducto === undefined)
      return res.status(400).json({ error: 'Se requiere skuProveedor y/o nombreProducto' });

    const actual = await prisma.mapeoSku.findUnique({ where: { id: req.params.id } });
    if (!actual) return res.status(404).json({ error: 'Item no encontrado' });

    const data = {};

    if (nuevoSku !== undefined) {
      const sku = normSku(nuevoSku);
      if (!sku) return res.status(400).json({ error: 'SKU no puede estar vacío' });
      if (sku !== actual.skuProveedor) {
        const conflicto = await prisma.mapeoSku.findUnique({
          where: { proveedorId_skuProveedor: { proveedorId: actual.proveedorId, skuProveedor: sku } },
        });
        if (conflicto) return res.status(409).json({ error: `Ya existe un item con SKU "${sku}" para este proveedor` });
        data.skuProveedor = sku;
        if (!actual.skuOriginal) data.skuOriginal = actual.skuProveedor;
      }
    }

    if (nombreProducto !== undefined) {
      data.nombreProducto = nombreProducto
        ? String(nombreProducto).trim().slice(0, 500)
        : null;
    }

    if (!Object.keys(data).length) return res.json(actual);

    res.json(await prisma.mapeoSku.update({ where: { id: req.params.id }, data, include: INCLUDE_PROVEEDOR }));
  } catch (err) {
    console.error('PUT /mapeo/:id error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
