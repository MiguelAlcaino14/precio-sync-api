const prisma = require('../db');

/**
 * Calcula el precio de venta sugerido para un producto.
 * Evalúa las reglas en orden de prioridad (mayor = más específico).
 * La primera regla que coincida se aplica.
 */
async function calcularPrecioVenta(sku, costo, proveedorId) {
  const producto = await prisma.producto.findUnique({ where: { sku } });

  const reglas = await prisma.reglaMarkup.findMany({
    where: { activa: true },
    orderBy: { prioridad: 'desc' },
  });

  for (const regla of reglas) {
    if (regla.proveedorId && regla.proveedorId !== proveedorId) continue;
    if (regla.categoria && regla.categoria !== producto?.marca) continue;
    if (regla.costoMin != null && costo < regla.costoMin) continue;
    if (regla.costoMax != null && costo > regla.costoMax) continue;

    const precio = Math.round(costo * (1 + regla.markupPct / 100));
    return { precio, markupPct: regla.markupPct, reglaId: regla.id };
  }

  // Sin regla coincidente: markup por defecto 50%
  return { precio: Math.round(costo * 1.5), markupPct: 50, reglaId: null };
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
    const { precio, markupPct } = await calcularPrecioVenta(
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
