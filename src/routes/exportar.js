const express = require('express');
const { generarCSVImport, marcarPublicados } = require('../services/jumpseller.service');
const prisma = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/exportar?proveedorId=xxx  — descarga CSV para JumpSeller
router.get('/', async (req, res) => {
  try {
    const { proveedorId } = req.query;
    const csv = await generarCSVImport(proveedorId);

    const fecha = new Date().toISOString().split('T')[0];
    const nombre = `precios-jumpseller-${fecha}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.send(csv);
  } catch (err) {
    console.error('GET /exportar error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/exportar/confirmar  — marca los aprobados como publicados
router.post('/confirmar', requireAdmin, async (req, res) => {
  try {
    const { proveedorId } = req.body;

    const cambios = await prisma.cambioPendiente.findMany({
      where: {
        estado: 'aprobado',
        ...(proveedorId ? { producto: { proveedorId } } : {}),
      },
    });

    await marcarPublicados(cambios.map(c => c.id));

    res.json({ publicados: cambios.length });
  } catch (err) {
    console.error('POST /exportar/confirmar error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/exportar/historial  — archivos importados
router.get('/historial', async (req, res) => {
  try {
    const historial = await prisma.archivoImportado.findMany({
      include: { proveedor: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(historial);
  } catch (err) {
    console.error('GET /exportar/historial error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
