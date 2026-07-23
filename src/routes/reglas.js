const express = require('express');
const prisma  = require('../db');
const { recalcularCambiosPendientes } = require('../services/markup.service');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/reglas
router.get('/', async (req, res) => {
  try {
    const reglas = await prisma.reglaMarkup.findMany({
      include: { proveedor: true },
      orderBy: [{ prioridad: 'desc' }, { createdAt: 'asc' }],
    });
    res.json(reglas);
  } catch (err) {
    console.error('GET /reglas error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/reglas/skus?q=  — autocomplete de SKU para el formulario
router.get('/skus', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const productos = await prisma.producto.findMany({
      where: {
        OR: [
          { sku:    { contains: q, mode: 'insensitive' } },
          { nombre: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, sku: true, nombre: true, marca: true },
      take: 10,
    });
    res.json(productos);
  } catch (err) {
    console.error('GET /reglas/skus error:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/reglas
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { nombre, proveedorId, sku, marca, categoria, costoMin, costoMax, markupPct, prioridad } = req.body;
    if (!nombre || markupPct == null) return res.status(400).json({ error: 'nombre y markupPct son requeridos' });

    const regla = await prisma.reglaMarkup.create({
      data: { nombre, proveedorId, sku: sku || null, marca: marca || null, categoria, costoMin, costoMax, markupPct, prioridad: prioridad ?? 0 },
    });

    // Recalcular cambios pendientes afectados
    if (proveedorId) await recalcularCambiosPendientes(proveedorId);

    res.status(201).json(regla);
  } catch (err) {
    console.error('POST /reglas error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /api/reglas/:id
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { nombre, proveedorId, sku, marca, categoria, costoMin, costoMax,
            markupPct, prioridad, activa, nombreContiene } = req.body;
    const data = {};
    if (nombre        !== undefined) data.nombre        = String(nombre).trim().slice(0, 100);
    if (markupPct     !== undefined) data.markupPct     = Number(markupPct);
    if (prioridad     !== undefined) data.prioridad     = Number(prioridad);
    if (activa        !== undefined) data.activa        = Boolean(activa);
    if (costoMin      !== undefined) data.costoMin      = costoMin  != null ? Number(costoMin)  : null;
    if (costoMax      !== undefined) data.costoMax      = costoMax  != null ? Number(costoMax)  : null;
    if (sku           !== undefined) data.sku           = sku       || null;
    if (marca         !== undefined) data.marca         = marca     || null;
    if (categoria     !== undefined) data.categoria     = categoria || null;
    if (proveedorId   !== undefined) data.proveedorId   = proveedorId || null;
    if (nombreContiene !== undefined) data.nombreContiene = nombreContiene || null;

    const regla = await prisma.reglaMarkup.update({ where: { id: req.params.id }, data });
    await recalcularCambiosPendientes(regla.proveedorId ?? null);
    res.json(regla);
  } catch (err) {
    console.error('PUT /reglas error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /api/reglas/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const regla = await prisma.reglaMarkup.findUnique({ where: { id: req.params.id } });
    await prisma.reglaMarkup.delete({ where: { id: req.params.id } });
    await recalcularCambiosPendientes(regla?.proveedorId ?? null);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /reglas error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
