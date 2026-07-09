const express = require('express');
const prisma  = require('../db');
const { requireAdmin } = require('../middleware/auth');

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
