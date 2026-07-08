const express = require('express');
const prisma  = require('../db');
const { marcarPublicados } = require('../services/jumpseller.service');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/cambios?estado=pendiente&proveedorId=xxx
router.get('/', async (req, res) => {
  try {
    const { estado = 'pendiente', proveedorId } = req.query;

    const cambios = await prisma.cambioPendiente.findMany({
      where: {
        estado,
        ...(proveedorId ? { producto: { proveedorId } } : {}),
      },
      include: {
        producto: { include: { proveedor: true } },
        archivo: { include: { proveedor: { select: { nombre: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(cambios);
  } catch (err) {
    console.error('GET /cambios error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/cambios/aprobar  body: { ids: [...], preciosVenta: { id: precio } }
router.post('/aprobar', async (req, res) => {
  try {
    const { ids, preciosVenta = {} } = req.body;
    if (!ids?.length) return res.status(400).json({ error: 'ids requerido' });

    const cambios = await prisma.cambioPendiente.findMany({
      where: { id: { in: ids } },
      include: { producto: true },
    });

    for (const cambio of cambios) {
      const precioRaw = preciosVenta[cambio.id] ?? cambio.precioSugerido;
      if (!precioRaw) continue;
      const precio = Number(precioRaw);
      if (isNaN(precio) || precio <= 0 || precio > 99_999_999) continue;

      // Guardar precio de venta
      await prisma.precioVenta.upsert({
        where: { productoId: cambio.productoId },
        update: { precio, updatedAt: new Date() },
        create: { productoId: cambio.productoId, precio },
      });

      // Marcar cambio como aprobado
      await prisma.cambioPendiente.update({
        where: { id: cambio.id },
        data: { estado: 'aprobado', precioSugerido: precio, aprobadoAt: new Date() },
      });
    }

    res.json({ aprobados: cambios.length });
  } catch (err) {
    console.error('POST /cambios/aprobar error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/cambios/rechazar  body: { ids: [...] }
router.post('/rechazar', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids?.length) return res.status(400).json({ error: 'ids requerido' });

    await prisma.cambioPendiente.updateMany({
      where: { id: { in: ids } },
      data: { estado: 'rechazado' },
    });

    res.json({ rechazados: ids.length });
  } catch (err) {
    console.error('POST /cambios/rechazar error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/cambios/limpiar  — elimina todos los cambios pendientes
router.post('/limpiar', requireAdmin, async (req, res) => {
  try {
    const { count } = await prisma.cambioPendiente.deleteMany({
      where: { estado: 'pendiente' },
    });
    res.json({ eliminados: count });
  } catch (err) {
    console.error('POST /cambios/limpiar error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/cambios/resumen  — cuántos pendientes por proveedor
router.get('/resumen', async (req, res) => {
  try {
    const resumen = await prisma.cambioPendiente.groupBy({
      by: ['estado'],
      _count: true,
    });
    res.json(resumen);
  } catch (err) {
    console.error('GET /cambios/resumen error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
