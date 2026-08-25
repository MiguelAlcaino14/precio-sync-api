const express = require('express');
const prisma  = require('../db');
const { calcularPrecioConReglas, sortReglas } = require('../services/markup.service');

const router = express.Router();

const normStr = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Detecta una sola vez si unaccent está disponible en la BD
let _unaccentOk = null;
async function unaccentDisponible() {
  if (_unaccentOk !== null) return _unaccentOk;
  try {
    await prisma.$queryRaw`SELECT unaccent('test')`;
    _unaccentOk = true;
  } catch {
    _unaccentOk = false;
  }
  return _unaccentOk;
}

function mapProducto(p, reglasSorted) {
  const costo = p.costos[0]?.costo ?? null;
  const { precio: precioSugerido, markupPct } = costo != null
    ? calcularPrecioConReglas(costo, p, reglasSorted)
    : { precio: null, markupPct: null };
  return {
    id:             p.id,
    sku:            p.sku,
    nombre:         p.nombre,
    categoria:      p.categoria,
    unidadesCaja:   p.unidadesCaja,
    unidadesPallet: p.unidadesPallet,
    marca:          p.marca,
    proveedor:      p.proveedor,
    ultimoCosto:    costo,
    precioJS:       p.precioVenta?.precio ?? null,
    precioSugerido,
    markupPct,
  };
}

const INCLUDE = {
  proveedor:   { select: { id: true, nombre: true, tema: true } },
  costos:      { orderBy: { createdAt: 'desc' }, take: 1, select: { costo: true } },
  precioVenta: { select: { precio: true, markupPct: true } },
};

// GET /api/productos?q=&tema=&proveedorId=&page=1&limit=50
router.get('/', async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const q      = String(req.query.q           || '').trim();
    const tema   = String(req.query.tema        || '').trim();
    const provId = String(req.query.proveedorId || '').trim();

    if (q) {
      // Paso 1: obtener IDs que coinciden (insensible a tildes si unaccent disponible)
      let matchIds;
      if (await unaccentDisponible()) {
        const pattern = `%${q}%`;
        const hits = await prisma.$queryRaw`
          SELECT id FROM "Producto"
          WHERE unaccent(nombre) ILIKE unaccent(${pattern})
             OR unaccent(sku)    ILIKE unaccent(${pattern})
        `;
        matchIds = hits.map(r => r.id);
      } else {
        const hits = await prisma.producto.findMany({
          where: { OR: [
            { sku:    { contains: q, mode: 'insensitive' } },
            { nombre: { contains: q, mode: 'insensitive' } },
          ]},
          select: { id: true },
        });
        matchIds = hits.map(r => r.id);
      }

      // Paso 2: aplicar filtros de proveedor/tema sobre los IDs que coinciden
      const filterWhere = { id: { in: matchIds } };
      if (provId) filterWhere.proveedorId = provId;
      if (tema)   filterWhere.proveedor   = { tema };

      const candidates = await prisma.producto.findMany({
        where:  filterWhere,
        select: { id: true, sku: true, nombre: true },
      });

      // Paso 3: score de relevancia (exacto → inicia con → límite de palabra → substring)
      const nq = normStr(q);
      const re = new RegExp(`\\b${nq.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');

      const scored = candidates
        .map(p => {
          const n = normStr(p.nombre);
          const s = normStr(p.sku);
          const score =
            n === nq || s === nq                       ? 0 :
            n.startsWith(nq) || s.startsWith(nq)      ? 1 :
            re.test(n) || re.test(s)                   ? 2 : 3;
          return { id: p.id, score };
        })
        .sort((a, b) => a.score - b.score);

      // Paso 4: paginar sobre IDs ya ordenados por relevancia
      const total   = scored.length;
      const pageIds = scored.slice((page - 1) * limit, page * limit).map(x => x.id);

      // Paso 5: traer datos completos y reordenar según relevancia
      const [rows, reglas] = await Promise.all([
        prisma.producto.findMany({ where: { id: { in: pageIds } }, include: INCLUDE }),
        prisma.reglaMarkup.findMany({ where: { activa: true }, orderBy: { prioridad: 'desc' } }),
      ]);

      const rowMap       = Object.fromEntries(rows.map(p => [p.id, p]));
      const reglasSorted = sortReglas(reglas);
      const productos    = pageIds.map(id => rowMap[id]).filter(Boolean).map(p => mapProducto(p, reglasSorted));

      return res.json({ productos, total, totalPaginas: Math.ceil(total / limit) || 1 });
    }

    // Sin búsqueda: orden alfabético normal
    const where = {};
    if (provId) where.proveedorId = provId;
    if (tema)   where.proveedor   = { tema };

    const [total, rows, reglas] = await Promise.all([
      prisma.producto.count({ where }),
      prisma.producto.findMany({
        where,
        include:  INCLUDE,
        orderBy:  { nombre: 'asc' },
        skip:     (page - 1) * limit,
        take:     limit,
      }),
      prisma.reglaMarkup.findMany({ where: { activa: true }, orderBy: { prioridad: 'desc' } }),
    ]);

    const reglasSorted = sortReglas(reglas);
    const productos    = rows.map(p => mapProducto(p, reglasSorted));

    res.json({ productos, total, totalPaginas: Math.ceil(total / limit) || 1 });
  } catch (err) {
    console.error('GET /productos error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
