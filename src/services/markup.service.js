const prisma = require('../db');

/**
 * Calcula el precio de venta sugerido para un producto.
 * Reglas especiales tienen prioridad sobre las de la tabla.
 * Las reglas de la tabla se evalúan en orden de prioridad (mayor = más específico).
 */
async function calcularPrecioVenta(sku, costo, proveedorId) {
  const producto = await prisma.producto.findUnique({ where: { sku } });

  // Regla especial RESMA: precio = costo / 0.8 (≡ markup 25%)
  if (producto?.nombre && /resma/i.test(producto.nombre)) {
    const precio = Math.ceil((costo / 0.8) / 10) * 10;
    return { precio, markupPct: 25, reglaId: null };
  }

  const reglas = await prisma.reglaMarkup.findMany({
    where: { activa: true },
    orderBy: { prioridad: 'desc' },
  });

  // Reglas con SKU específico tienen prioridad implícita sobre las generales
  reglas.sort((a, b) => {
    const aHasSku = a.sku ? 1 : 0;
    const bHasSku = b.sku ? 1 : 0;
    if (bHasSku !== aHasSku) return bHasSku - aHasSku;
    return b.prioridad - a.prioridad;
  });

  for (const regla of reglas) {
    if (regla.proveedorId && regla.proveedorId !== proveedorId) continue;
    if (regla.sku       && regla.sku       !== sku)                 continue;
    if (regla.marca     && regla.marca     !== producto?.marca)     continue;
    if (regla.categoria && regla.categoria !== producto?.categoria) continue;
    if (regla.nombreContiene && !producto?.nombre?.toLowerCase().includes(regla.nombreContiene.toLowerCase())) continue;
    if (regla.costoMin != null && costo < regla.costoMin) continue;
    if (regla.costoMax != null && costo > regla.costoMax) continue;

    const precio = Math.ceil((costo * (1 + regla.markupPct / 100)) / 10) * 10;
    return { precio, markupPct: regla.markupPct, reglaId: regla.id };
  }

  // Sin regla coincidente: markup por defecto 45%
  return { precio: Math.ceil((costo * 1.45) / 10) * 10, markupPct: 45, reglaId: null };
}

/**
 * Recalcula los costos de los productos de un proveedor cuando cambia su descuento base.
 * Genera un CambioPendiente por cada producto cuyo precio sugerido cambie.
 * Usado por el panel (PUT /proveedores/:id) y por el seed (descuentos base).
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

    // costoOriginal guardado, o revertir manualmente si hay descuento anterior
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

module.exports = { calcularPrecioVenta, recalcularDescuento, recalcularCambiosPendientes };
