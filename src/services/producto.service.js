const prisma = require('../db');

async function actualizarActivoProducto(sku) {
  const hayActivo = await prisma.mapeoSku.count({
    where: { skuProveedor: sku, estado: { not: 'ignorado' } },
  }) > 0;
  await prisma.producto.updateMany({
    where: { sku },
    data:  { activo: hayActivo },
  });
  return hayActivo;
}

module.exports = { actualizarActivoProducto };
