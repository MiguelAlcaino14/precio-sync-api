const prisma = require('../db');

const normSku = s => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');

async function buscarMapeo(proveedorId, skuProveedor) {
  return prisma.mapeoSku.findUnique({
    where: { proveedorId_skuProveedor: { proveedorId, skuProveedor: normSku(skuProveedor) } },
  });
}

async function guardarMapeo(proveedorId, skuProveedor, jumpsellerProductId, estado, similitud, nombreProducto) {
  const sku    = normSku(skuProveedor);
  const nombre = nombreProducto ? String(nombreProducto).slice(0, 500) : undefined;
  return prisma.mapeoSku.upsert({
    where:  { proveedorId_skuProveedor: { proveedorId, skuProveedor: sku } },
    update: { jumpsellerProductId, estado, similitud, ultimaVezVisto: new Date(), ...(nombre ? { nombreProducto: nombre } : {}) },
    create: { proveedorId, skuProveedor: sku, jumpsellerProductId, estado, similitud, nombreProducto: nombre ?? null },
  });
}

async function marcarVisto(proveedorId, skuProveedor) {
  const sku = normSku(skuProveedor);
  try {
    await prisma.mapeoSku.update({
      where:  { proveedorId_skuProveedor: { proveedorId, skuProveedor: sku } },
      data:   { ultimaVezVisto: new Date() },
    });
  } catch { /* no existe aún, ignorar */ }
}

module.exports = { normSku, buscarMapeo, guardarMapeo, marcarVisto };
