const express = require('express');
const prisma  = require('../db');
const { recalcularCambiosPendientes } = require('../services/markup.service');

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
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reglas
router.post('/', async (req, res) => {
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
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/reglas/:id
router.put('/:id', async (req, res) => {
  try {
    const regla = await prisma.reglaMarkup.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(regla);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/reglas/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.reglaMarkup.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
