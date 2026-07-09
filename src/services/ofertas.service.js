const prisma = require('../db');

const PRIORIDAD = { producto: 4, marca: 3, proveedor: 2, categoria: 1 };

/**
 * Retorna la oferta activa de mayor prioridad para un producto dado.
 * producto debe tener: { id, proveedorId, marca, categoria }
 */
async function obtenerOfertaActiva(producto) {
  const ahora = new Date();

  const ofertas = await prisma.oferta.findMany({
    where: {
      activa: true,
      OR: [{ fechaInicio: null }, { fechaInicio: { lte: ahora } }],
      AND: [{
        OR: [{ fechaFin: null }, { fechaFin: { gte: ahora } }],
      }, {
        OR: [
          { tipo: 'producto',   productoId:  producto.id },
          ...(producto.marca        ? [{ tipo: 'marca',     marca:       producto.marca }]        : []),
          ...(producto.proveedorId  ? [{ tipo: 'proveedor', proveedorId: producto.proveedorId }]  : []),
          ...(producto.categoria    ? [{ tipo: 'categoria', categoria:   producto.categoria }]    : []),
        ],
      }],
    },
  });

  if (!ofertas.length) return null;

  return ofertas.sort((a, b) => (PRIORIDAD[b.tipo] || 0) - (PRIORIDAD[a.tipo] || 0))[0];
}

/**
 * Aplica descuento de oferta al precio base.
 * Retorna { precioFinal, oferta } — oferta es null si no aplica ninguna.
 */
async function aplicarOferta(producto, precioBase) {
  const oferta = await obtenerOfertaActiva(producto);
  if (!oferta) return { precioFinal: precioBase, oferta: null };

  const precioFinal = Math.round(precioBase * (1 - oferta.descuentoPct / 100));
  return { precioFinal, oferta };
}

module.exports = { obtenerOfertaActiva, aplicarOferta };
