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
    const precio = Math.round(costo / 0.8);
    return { precio, markupPct: 25, reglaId: null };
  }

  const reglas = await prisma.reglaMarkup.findMany({
    where: { activa: true },
    orderBy: { prioridad: 'desc' },
  });

  for (const regla of reglas) {
    if (regla.proveedorId && regla.proveedorId !== proveedorId) continue;
    if (regla.marca     && regla.marca     !== producto?.marca)     continue;
    if (regla.categoria && regla.categoria !== producto?.categoria) continue;
    if (regla.nombreContiene && !producto?.nombre?.toLowerCase().includes(regla.nombreContiene.toLowerCase())) continue;
    if (regla.costoMin != null && costo < regla.costoMin) continue;
    if (regla.costoMax != null && costo > regla.costoMax) continue;

    const precio = Math.round(costo * (1 + regla.markupPct / 100));
    return { precio, markupPct: regla.markupPct, reglaId: regla.id };
  }

  // Sin regla coincidente: markup por defecto 45%
  return { precio: Math.round(costo * 1.45), markupPct: 45, reglaId: null };
}

/**
 * Recalcula precios sugeridos para todos los cambios pendientes de un proveedor.
 */
async function recalcularCambiosPendientes(proveedorId) {
  const cambios = await prisma.cambioPendiente.findMany({
    where: { estado: 'pendiente', producto: { proveedorId } },
    include: { producto: true },
  });

  for (const cambio of cambios) {
    const { precio } = await calcularPrecioVenta(
      cambio.producto.sku,
      cambio.costoNuevo,
      proveedorId,
    );
    await prisma.cambioPendiente.update({
      where: { id: cambio.id },
      data: { precioSugerido: precio },
    });
  }
}

module.exports = { calcularPrecioVenta, recalcularCambiosPendientes };
