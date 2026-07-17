const express = require('express');
const router  = express.Router();
const prisma  = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { publicarPrecios } = require('../services/jumpseller.service');
const { aplicarOferta }   = require('../services/ofertas.service');

// POST /api/publicar  — publica cambios aprobados en JumpSeller
router.post('/', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ error: 'ids requerido' });
  }

  const cambios = await prisma.cambioPendiente.findMany({
    where:   { id: { in: ids }, estado: 'aprobado' },
    include: { producto: { include: { proveedor: true } } },
  });

  if (!cambios.length) {
    return res.status(400).json({ error: 'No hay cambios aprobados con esos IDs' });
  }

  const preciosVenta = await prisma.precioVenta.findMany({
    where: { productoId: { in: cambios.map(c => c.productoId) } },
  });
  const precioMap = Object.fromEntries(preciosVenta.map(p => [p.productoId, p.precio]));

  // Aplicar ofertas activas sobre el precio de venta
  const payload = [];
  for (const c of cambios) {
    const precioBase = precioMap[c.productoId] ?? c.precioSugerido;
    if (precioBase == null) continue;

    const { precioFinal, oferta } = await aplicarOferta(c.producto, precioBase);

    payload.push({
      id:          c.id,
      sku:         c.producto.sku,
      nombre:      c.producto.nombre,
      precioVenta: precioFinal,
      proveedorId: c.producto.proveedorId,
      ...(oferta ? { ofertaAplicada: oferta.nombre, descuentoPct: oferta.descuentoPct } : {}),
    });
  }

  if (!payload.length) {
    return res.status(400).json({ error: 'Los cambios seleccionados no tienen precio de venta asignado' });
  }

  const resultados = await publicarPrecios(payload);

  const idsOk = resultados.filter(r => r.ok).map(r => r.id);
  if (idsOk.length) {
    await prisma.cambioPendiente.updateMany({
      where: { id: { in: idsOk } },
      data:  { estado: 'publicado', aprobadoAt: new Date() },
    });
  }

  res.json({
    publicados: idsOk.length,
    errores:    resultados.filter(r => !r.ok).length,
    resultados,
  });
});

// GET /api/publicar/status  — verifica que las credenciales JumpSeller estén configuradas
router.get('/status', (req, res) => {
  const ok = !!(process.env.JUMPSELLER_LOGIN && process.env.JUMPSELLER_TOKEN);
  res.json({ configurado: ok });
});

module.exports = router;
