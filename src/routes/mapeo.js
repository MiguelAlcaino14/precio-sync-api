const express  = require('express');
const router   = express.Router();
const prisma   = require('../db');
const { construirMapas } = require('../services/jumpseller.service');

// Cache en memoria para mapa JumpSeller (TTL 5 min)
let _mapaCache    = null;
let _mapaCacheAt  = 0;
let _mapaPromise  = null;
const CACHE_TTL   = 5 * 60 * 1000;

async function getMapaJS() {
  if (_mapaCache && Date.now() - _mapaCacheAt < CACHE_TTL) return _mapaCache;
  if (_mapaPromise) return _mapaPromise;
  _mapaPromise = construirMapas().then(mapa => {
    _mapaCache   = mapa;
    _mapaCacheAt = Date.now();
    _mapaPromise = null;
    return mapa;
  }).catch(err => {
    _mapaPromise = null;
    throw err;
  });
  return _mapaPromise;
}

// GET /api/mapeo/pendientes?proveedorId=&page=1&limit=50
router.get('/pendientes', async (req, res) => {
  try {
    const page       = Math.max(1, parseInt(req.query.page)  || 1);
    const limit      = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const skip       = (page - 1) * limit;
    const proveedorId = req.query.proveedorId || undefined;

    const where = {
      estado: 'pendiente',
      ...(proveedorId ? { proveedorId } : {}),
    };

    const [total, items] = await Promise.all([
      prisma.mapeoSku.count({ where }),
      prisma.mapeoSku.findMany({
        where,
        skip,
        take: limit,
        orderBy: { creadoEn: 'desc' },
        include: { proveedor: { select: { nombre: true } } },
      }),
    ]);

    res.json({ total, page, limit, items });
  } catch (err) {
    console.error('GET /mapeo/pendientes error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/mapeo/buscar-jumpseller?q=
router.get('/buscar-jumpseller', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (q.length < 3) return res.json([]);

    const mapa   = await getMapaJS();
    const qLower = q.toLowerCase();

    // mapaNombre keys son nombres normalizados; también buscamos en el nombre original
    // Tenemos que reconstruir con productId desde mapaNombre
    const resultados = [];
    for (const [nombre, { productId }] of Object.entries(mapa.mapaNombre)) {
      if (nombre.includes(qLower)) {
        resultados.push({ productId, nombre });
        if (resultados.length >= 20) break;
      }
    }

    res.json(resultados);
  } catch (err) {
    console.error('GET /mapeo/buscar-jumpseller error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/mapeo/stats
router.get('/stats', async (req, res) => {
  try {
    const [total, confirmados, pendientes, ignorados, obsoletos] = await Promise.all([
      prisma.mapeoSku.count(),
      prisma.mapeoSku.count({ where: { estado: 'confirmado' } }),
      prisma.mapeoSku.count({ where: { estado: 'pendiente' } }),
      prisma.mapeoSku.count({ where: { estado: 'ignorado' } }),
      prisma.mapeoSku.count({ where: { estado: 'obsoleto' } }),
    ]);

    res.json({ total, confirmados, pendientes, ignorados, obsoletos });
  } catch (err) {
    console.error('GET /mapeo/stats error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/mapeo/:id/confirmar
router.post('/:id/confirmar', async (req, res) => {
  try {
    const { id } = req.params;
    const { jumpsellerProductId } = req.body;

    if (!jumpsellerProductId || typeof jumpsellerProductId !== 'number' || jumpsellerProductId <= 0 || !Number.isInteger(jumpsellerProductId)) {
      return res.status(400).json({ error: 'jumpsellerProductId debe ser un número entero positivo' });
    }

    const mapeo = await prisma.mapeoSku.update({
      where: { id },
      data:  { estado: 'confirmado', jumpsellerProductId, similitud: null },
    });

    res.json(mapeo);
  } catch (err) {
    console.error('POST /mapeo/:id/confirmar error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/mapeo/:id/ignorar
router.post('/:id/ignorar', async (req, res) => {
  try {
    const { id } = req.params;

    const mapeo = await prisma.mapeoSku.update({
      where: { id },
      data:  { estado: 'ignorado' },
    });

    res.json(mapeo);
  } catch (err) {
    console.error('POST /mapeo/:id/ignorar error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
