const express = require('express');
const prisma  = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { aplicarPrecioOferta, revertirPrecioOferta } = require('../services/jumpseller.service');
const { normSku } = require('../services/mapeo.service');

const router = express.Router();

const TIPOS_VALIDOS   = ['proveedor', 'marca', 'categoria', 'producto'];
const CATEGORIAS_VALIDAS = ['libreria', 'aseo', 'alimentos'];

function validar(body) {
  const { nombre, tipo, descuentoPct, proveedorId, marca, categoria, productoId, fechaInicio, fechaFin } = body;

  if (!nombre?.trim())                         return 'nombre es requerido';
  if (nombre.trim().length > 100)              return 'nombre máximo 100 caracteres';
  if (!TIPOS_VALIDOS.includes(tipo))           return `tipo inválido. Valores: ${TIPOS_VALIDOS.join(', ')}`;

  const pct = Number(descuentoPct);
  if (isNaN(pct) || pct <= 0 || pct > 100)    return 'descuentoPct debe ser entre 1 y 100';

  if (tipo === 'proveedor' && !proveedorId)    return 'proveedorId requerido para tipo proveedor';
  if (tipo === 'marca'     && !marca?.trim())  return 'marca requerida para tipo marca';
  if (tipo === 'categoria') {
    if (!CATEGORIAS_VALIDAS.includes(categoria)) return `categoria inválida. Valores: ${CATEGORIAS_VALIDAS.join(', ')}`;
  }
  if (tipo === 'producto'  && !productoId)     return 'productoId requerido para tipo producto';

  if (fechaInicio && isNaN(Date.parse(fechaInicio))) return 'fechaInicio inválida';
  if (fechaFin    && isNaN(Date.parse(fechaFin)))    return 'fechaFin inválida';
  if (fechaInicio && fechaFin && new Date(fechaFin) <= new Date(fechaInicio)) {
    return 'fechaFin debe ser posterior a fechaInicio';
  }
  return null;
}

// GET /api/ofertas/marcas — marcas distintas registradas en Producto
router.get('/marcas', async (req, res) => {
  try {
    const rows = await prisma.producto.findMany({
      where:    { marca: { not: null } },
      select:   { marca: true },
      distinct: ['marca'],
      orderBy:  { marca: 'asc' },
    });
    res.json(rows.map(r => r.marca).filter(Boolean));
  } catch (err) {
    console.error('GET /ofertas/marcas error:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/ofertas
router.get('/', async (req, res) => {
  try {
    const ofertas = await prisma.oferta.findMany({
      include: {
        proveedor: { select: { id: true, nombre: true } },
        producto:  { select: { id: true, sku: true, nombre: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(ofertas);
  } catch (err) {
    console.error('GET /ofertas error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/ofertas
router.post('/', async (req, res) => {
  try {
    const error = validar(req.body);
    if (error) return res.status(400).json({ error });

    const { nombre, tipo, descuentoPct, proveedorId, marca, categoria, productoId, fechaInicio, fechaFin } = req.body;

    const oferta = await prisma.oferta.create({
      data: {
        nombre:      nombre.trim().slice(0, 100),
        tipo,
        descuentoPct: Number(descuentoPct),
        proveedorId:  tipo === 'proveedor' ? proveedorId : null,
        marca:        tipo === 'marca'     ? marca.trim().slice(0, 100) : null,
        categoria:    tipo === 'categoria' ? categoria : null,
        productoId:   tipo === 'producto'  ? productoId : null,
        fechaInicio:  fechaInicio ? new Date(fechaInicio) : null,
        fechaFin:     fechaFin    ? new Date(fechaFin)    : null,
        activa:       true,
      },
      include: {
        proveedor: { select: { id: true, nombre: true } },
        producto:  { select: { id: true, sku: true, nombre: true } },
      },
    });

    res.status(201).json(oferta);
  } catch (err) {
    console.error('POST /ofertas error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /api/ofertas/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id?.trim()) return res.status(400).json({ error: 'id inválido' });

    const existe = await prisma.oferta.findUnique({ where: { id } });
    if (!existe) return res.status(404).json({ error: 'Oferta no encontrada' });

    const error = validar(req.body);
    if (error) return res.status(400).json({ error });

    const { nombre, tipo, descuentoPct, proveedorId, marca, categoria, productoId, fechaInicio, fechaFin, activa } = req.body;

    const oferta = await prisma.oferta.update({
      where: { id },
      data: {
        nombre:      nombre.trim().slice(0, 100),
        tipo,
        descuentoPct: Number(descuentoPct),
        proveedorId:  tipo === 'proveedor' ? proveedorId : null,
        marca:        tipo === 'marca'     ? marca.trim().slice(0, 100) : null,
        categoria:    tipo === 'categoria' ? categoria : null,
        productoId:   tipo === 'producto'  ? productoId : null,
        fechaInicio:  fechaInicio ? new Date(fechaInicio) : null,
        fechaFin:     fechaFin    ? new Date(fechaFin)    : null,
        activa:       activa !== undefined ? Boolean(activa) : existe.activa,
      },
      include: {
        proveedor: { select: { id: true, nombre: true } },
        producto:  { select: { id: true, sku: true, nombre: true } },
      },
    });

    res.json(oferta);
  } catch (err) {
    console.error('PUT /ofertas/:id error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PATCH /api/ofertas/:id/toggle
router.patch('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id?.trim()) return res.status(400).json({ error: 'id inválido' });

    const existe = await prisma.oferta.findUnique({ where: { id } });
    if (!existe) return res.status(404).json({ error: 'Oferta no encontrada' });

    const oferta = await prisma.oferta.update({
      where: { id },
      data:  { activa: !existe.activa },
    });

    res.json({ id: oferta.id, activa: oferta.activa });
  } catch (err) {
    console.error('PATCH /ofertas/:id/toggle error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/ofertas/:id/publicar — aplica descuento en JumpSeller con compare_at_price
router.post('/:id/publicar', requireAdmin, async (req, res) => {
  try {
    const oferta = await prisma.oferta.findUnique({ where: { id: req.params.id } });
    if (!oferta) return res.status(404).json({ error: 'Oferta no encontrada' });
    if (oferta.publicada) return res.status(400).json({ error: 'Oferta ya publicada. Revertir primero.' });

    // Construir filtro de productos según tipo de oferta
    const productoWhere = {};
    if (oferta.tipo === 'proveedor') productoWhere.proveedorId = oferta.proveedorId;
    if (oferta.tipo === 'marca')     productoWhere.marca        = oferta.marca;
    if (oferta.tipo === 'categoria') productoWhere.categoria    = oferta.categoria;
    if (oferta.tipo === 'producto')  productoWhere.id           = oferta.productoId;

    const productos = await prisma.producto.findMany({
      where: productoWhere,
      include: { precioVenta: true },
    });

    const aplicaciones = [];
    const errores      = [];

    for (const prod of productos) {
      if (!prod.precioVenta?.precio) continue;

      const mapeo = await prisma.mapeoSku.findUnique({
        where:   { proveedorId_skuProveedor: { proveedorId: prod.proveedorId, skuProveedor: normSku(prod.sku) } },
        include: { links: { select: { jumpsellerProductId: true } } },
      });
      if (!mapeo || mapeo.estado !== 'confirmado') continue;

      const jsIds = new Set();
      if (mapeo.jumpsellerProductId) jsIds.add(mapeo.jumpsellerProductId);
      for (const l of mapeo.links ?? []) jsIds.add(l.jumpsellerProductId);
      if (!jsIds.size) continue;

      const precioOriginal = Math.round(prod.precioVenta.precio);
      const precioOferta   = Math.round(precioOriginal * (1 - oferta.descuentoPct / 100));

      for (const jsId of jsIds) {
        try {
          await aplicarPrecioOferta(jsId, precioOferta, precioOriginal);
          aplicaciones.push({ ofertaId: oferta.id, jumpsellerProductId: jsId, precioOriginal });
        } catch (e) {
          console.error(`[oferta.publicar] sku=${prod.sku} jsId=${jsId} err=${e.message}`);
          errores.push({ sku: prod.sku, error: e.message });
        }
      }
    }

    await prisma.$transaction([
      prisma.ofertaAplicacion.createMany({ data: aplicaciones, skipDuplicates: true }),
      prisma.oferta.update({ where: { id: oferta.id }, data: { publicada: true } }),
    ]);

    console.log(`[oferta.publicar] ofertaId=${oferta.id} aplicados=${aplicaciones.length} errores=${errores.length}`);
    res.json({ aplicados: aplicaciones.length, errores });
  } catch (err) {
    console.error('POST /ofertas/:id/publicar error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/ofertas/:id/revertir — restaura precios originales en JumpSeller
router.post('/:id/revertir', requireAdmin, async (req, res) => {
  try {
    const oferta = await prisma.oferta.findUnique({
      where:   { id: req.params.id },
      include: { aplicaciones: true },
    });
    if (!oferta) return res.status(404).json({ error: 'Oferta no encontrada' });
    if (!oferta.publicada) return res.status(400).json({ error: 'Oferta no está publicada' });

    let revertidos = 0;
    const errores  = [];

    for (const ap of oferta.aplicaciones) {
      try {
        await revertirPrecioOferta(ap.jumpsellerProductId, ap.precioOriginal);
        revertidos++;
      } catch (e) {
        console.error(`[oferta.revertir] jsId=${ap.jumpsellerProductId} err=${e.message}`);
        errores.push({ jumpsellerProductId: ap.jumpsellerProductId, error: e.message });
      }
    }

    await prisma.$transaction([
      prisma.ofertaAplicacion.deleteMany({ where: { ofertaId: oferta.id } }),
      prisma.oferta.update({ where: { id: oferta.id }, data: { publicada: false } }),
    ]);

    console.log(`[oferta.revertir] ofertaId=${oferta.id} revertidos=${revertidos} errores=${errores.length}`);
    res.json({ revertidos, errores });
  } catch (err) {
    console.error('POST /ofertas/:id/revertir error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /api/ofertas/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id?.trim()) return res.status(400).json({ error: 'id inválido' });

    const existe = await prisma.oferta.findUnique({ where: { id } });
    if (!existe) return res.status(404).json({ error: 'Oferta no encontrada' });

    await prisma.oferta.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /ofertas/:id error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
