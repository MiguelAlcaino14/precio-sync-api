const express = require('express');
const prisma  = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/notificaciones?todas=1
router.get('/', async (req, res) => {
  try {
    const where = req.query.todas === '1' ? {} : { leida: false };
    const notificaciones = await prisma.notificacion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(notificaciones);
  } catch (err) {
    console.error('GET /notificaciones error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PATCH /api/notificaciones/leer-todas
router.patch('/leer-todas', requireAdmin, async (req, res) => {
  try {
    await prisma.notificacion.updateMany({
      where: { leida: false },
      data:  { leida: true },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /notificaciones/leer-todas error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PATCH /api/notificaciones/:id/leer
router.patch('/:id/leer', async (req, res) => {
  try {
    const { id } = req.params;
    // Validar formato cuid para evitar queries basura
    if (!/^c[a-z0-9]{24}$/.test(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    await prisma.notificacion.update({
      where: { id },
      data:  { leida: true },
    });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Notificación no encontrada' });
    console.error('PATCH /notificaciones/:id/leer error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
