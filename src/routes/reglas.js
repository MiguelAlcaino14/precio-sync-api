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

// POST /api/reglas
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { nombre, proveedorId, categoria, costoMin, costoMax, markupPct, prioridad } = req.body;
    if (!nombre || markupPct == null) return res.status(400).json({ error: 'nombre y markupPct son requeridos' });

    const regla = await prisma.reglaMarkup.create({
      data: { nombre, proveedorId, categoria, costoMin, costoMax, markupPct, prioridad: prioridad ?? 0 },
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
    const regla = await prisma.reglaMarkup.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(regla);
  } catch (err) {
    console.error('PUT /reglas error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /api/reglas/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await prisma.reglaMarkup.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /reglas error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
