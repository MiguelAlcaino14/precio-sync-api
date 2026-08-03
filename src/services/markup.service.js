const prisma = require('../db');

const DEFAULT_MARGEN = 31; // margen sobre precio de venta

function sortReglas(reglas) {
  return [...reglas].sort((a, b) => {
    const aHasSku = a.sku ? 1 : 0;
    const bHasSku = b.sku ? 1 : 0;
    if (bHasSku !== aHasSku) return bHasSku - aHasSku;
    return b.prioridad - a.prioridad;
  });
}

/**
 * Calcula precio de venta dado costo, producto y reglas ya cargadas (sin queries).
 * Útil para procesos batch donde reglas se pre-cargan una sola vez.
 */
function calcularPrecioConReglas(costo, producto, reglas) {
  for (const regla of reglas) {
    if (regla.proveedorId && regla.proveedorId !== producto?.proveedorId) continue;
    if (regla.sku         && regla.sku         !== producto?.sku)         continue;
    if (regla.marca       && regla.marca       !== producto?.marca)       continue;
    if (regla.categoria   && regla.categoria   !== producto?.categoria)   continue;
    if (regla.nombreContiene && !producto?.nombre?.toLowerCase().includes(regla.nombreContiene.toLowerCase())) continue;
    if (regla.costoMin != null && costo < regla.costoMin) continue;
    if (regla.costoMax != null && costo > regla.costoMax) continue;

    return {
      precio:    Math.ceil((costo / (1 - regla.markupPct / 100)) / 10) * 10,
      markupPct: regla.markupPct,
      reglaId:   regla.id,
    };
  }

  // Sin regla: margen 31% sobre precio de venta → costo / 0.69
  return {
    precio:    Math.ceil((costo / (1 - DEFAULT_MARGEN / 100)) / 10) * 10,
    markupPct: DEFAULT_MARGEN,
    reglaId:   null,
  };
}

/**
 * Calcula el precio de venta sugerido para un producto (carga reglas desde DB).
 */
async function calcularPrecioVenta(sku, costo, proveedorId) {
  const [producto, reglas] = await Promise.all([
    prisma.producto.findUnique({ where: { sku } }),
    prisma.reglaMarkup.findMany({ where: { activa: true }, orderBy: { prioridad: 'desc' } }),
  ]);

  return calcularPrecioConReglas(costo, producto ?? { sku, proveedorId }, sortReglas(reglas));
}

/**
 * Recalcula los costos de los productos de un proveedor cuando cambia su descuento base.
 */
async function recalcularDescuento(proveedorId, oldDescuento, newDescuento) {
  console.log(`[recalcularDescuento] proveedorId=${proveedorId} old=${oldDescuento}% new=${newDescuento}%`);
  const productos = await prisma.producto.findMany({
    where: { proveedorId },
    include: {
      costos:      { orderBy: { createdAt: 'desc' }, take: 1 },
      precioVenta: true,
    },
  });

  let recalculados = 0;
  for (const producto of productos) {
    const ultimoCosto = producto.costos[0];
    if (!ultimoCosto) continue;

    const costoOriginal = ultimoCosto.costoOriginal != null
      ? ultimoCosto.costoOriginal
      : (oldDescuento > 0
          ? Math.round(ultimoCosto.costo / (1 - oldDescuento / 100))
          : ultimoCosto.costo);

    const costoNuevo = Math.round(costoOriginal * (1 - newDescuento / 100));
    const { precio: precioSugerido } = await calcularPrecioVenta(producto.sku, costoNuevo, proveedorId);

    const cambioSignificativo = !producto.precioVenta || precioSugerido !== producto.precioVenta.precio;
    if (cambioSignificativo) {
      await prisma.cambioPendiente.updateMany({
        where: { productoId: producto.id, estado: 'pendiente' },
        data:  { estado: 'reemplazado' },
      });
      await prisma.cambioPendiente.create({
        data: {
          productoId:    producto.id,
          costoAnterior: ultimoCosto.costo,
          costoNuevo,
          precioActual:  producto.precioVenta?.precio ?? null,
          precioSugerido,
          archivoId:     ultimoCosto.archivoId,
        },
      });
      recalculados++;
    }
  }
  console.log(`[recalcularDescuento] completado: ${recalculados} cambios creados`);
  return recalculados;
}

/**
 * Recalcula precios sugeridos para todos los cambios pendientes de un proveedor.
 */
async function recalcularCambiosPendientes(proveedorId) {
  const where = { estado: 'pendiente' };
  if (proveedorId) where.producto = { proveedorId };

  const cambios = await prisma.cambioPendiente.findMany({
    where,
    include: { producto: true },
  });

  console.log(`[recalcularCambiosPendientes] proveedorId=${proveedorId ?? 'global'} cambios=${cambios.length}`);

  for (const cambio of cambios) {
    const { precio } = await calcularPrecioVenta(
      cambio.producto.sku,
      cambio.costoNuevo,
      cambio.producto.proveedorId,
    );
    await prisma.cambioPendiente.update({
      where: { id: cambio.id },
      data: { precioSugerido: precio },
    });
  }
}

module.exports = {
  calcularPrecioVenta,
  calcularPrecioConReglas,
  sortReglas,
  recalcularDescuento,
  recalcularCambiosPendientes,
};
