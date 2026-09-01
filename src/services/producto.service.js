const prisma = require('../db');

async function actualizarActivoProducto(sku) {
  const hayActivo = await prisma.mapeoSku.count({
    where: { skuProveedor: sku, estado: { not: 'ignorado' } },
  }) > 0;
  try {
    await prisma.producto.updateMany({
      where: { sku },
      data:  { activo: hayActivo },
    });
  } catch (err) {
    if (err?.code === 'P2022') return hayActivo; // columna no existe aún
    throw err;
  }
  return hayActivo;
}

module.exports = { actualizarActivoProducto };
