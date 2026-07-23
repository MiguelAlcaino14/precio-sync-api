const express = require('express');
const prisma  = require('../db');

const router = express.Router();

// GET /api/productos?q=&tema=&proveedorId=&page=1&limit=50
router.get('/', async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)       || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const q      = String(req.query.q           || '').trim();
    const tema   = String(req.query.tema        || '').trim();
    const provId = String(req.query.proveedorId || '').trim();

    const where = {};
    if (q) {
      where.OR = [
        { sku:    { contains: q, mode: 'insensitive' } },
        { nombre: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (provId) where.proveedorId = provId;
    if (tema)   where.proveedor   = { tema };

    const [total, rows] = await Promise.all([
      prisma.producto.count({ where }),
      prisma.producto.findMany({
        where,
        include: {
          proveedor:   { select: { id: true, nombre: true, tema: true } },
          costos:      { orderBy: { createdAt: 'desc' }, take: 1, select: { costo: true } },
          precioVenta: { select: { precio: true, markupPct: true } },
          cambios: {
            where:   { estado: 'pendiente' },
            orderBy: { createdAt: 'desc' },
            take:    1,
            select:  { precioSugerido: true },
          },
        },
        orderBy: { nombre: 'asc' },
        skip:    (page - 1) * limit,
        take:    limit,
      }),
    ]);

    const productos = rows.map(p => ({
      id:             p.id,
      sku:            p.sku,
      nombre:         p.nombre,
      categoria:      p.categoria,
      unidadesCaja:   p.unidadesCaja,
      unidadesPallet: p.unidadesPallet,
      marca:          p.marca,
      proveedor:      p.proveedor,
      ultimoCosto:    p.costos[0]?.costo          ?? null,
      precioJS:       p.precioVenta?.precio        ?? null,
      precioSugerido: p.cambios[0]?.precioSugerido ?? null,
      markupPct:      p.precioVenta?.markupPct     ?? null,
    }));

    res.json({ productos, total, totalPaginas: Math.ceil(total / limit) || 1 });
  } catch (err) {
    console.error('GET /productos error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
