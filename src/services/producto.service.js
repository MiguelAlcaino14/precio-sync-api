const prisma = require('../db');

const ESTADO_PESO = { confirmado: 0, pendiente: 1, ambiguo: 2 };

async function sincronizarProducto(sku) {
  const mapeos = await prisma.mapeoSku.findMany({
    where:  { skuProveedor: sku, estado: { not: 'ignorado' } },
    select: { proveedorId: true, nombreProducto: true, estado: true },
  });

  if (!mapeos.length) {
    await prisma.producto.updateMany({ where: { sku }, data: { activo: false } });
    return false;
  }

  // Prioridad: estado (confirmado > pendiente > ambiguo), desempate: tiene nombreProducto
  mapeos.sort((a, b) => {
    const aScore = (ESTADO_PESO[a.estado] ?? 3) * 2 + (a.nombreProducto ? 0 : 1);
    const bScore = (ESTADO_PESO[b.estado] ?? 3) * 2 + (b.nombreProducto ? 0 : 1);
    return aScore - bScore;
  });

  const mejor = mapeos[0];
  const data  = { activo: true, proveedorId: mejor.proveedorId };
  if (mejor.nombreProducto) data.nombre = mejor.nombreProducto;

  await prisma.producto.updateMany({ where: { sku }, data });
  return true;
}

async function sincronizarProductosBulk(skus) {
  if (!skus.length) return;
  await prisma.$executeRaw`
    UPDATE "Producto" p
    SET
      "activo" = EXISTS (
        SELECT 1 FROM "MapeoSku" m
        WHERE m."skuProveedor" = p.sku AND m.estado != 'ignorado'
      ),
      "proveedorId" = COALESCE(
        (
          SELECT m."proveedorId" FROM "MapeoSku" m
          WHERE m."skuProveedor" = p.sku AND m.estado != 'ignorado'
          ORDER BY
            CASE m.estado WHEN 'confirmado' THEN 0 WHEN 'pendiente' THEN 2 ELSE 4 END +
            CASE WHEN m."nombreProducto" IS NOT NULL THEN 0 ELSE 1 END
          LIMIT 1
        ),
        p."proveedorId"
      ),
      "nombre" = COALESCE(
        (
          SELECT m."nombreProducto" FROM "MapeoSku" m
          WHERE m."skuProveedor" = p.sku AND m.estado != 'ignorado'
            AND m."nombreProducto" IS NOT NULL
          ORDER BY
            CASE m.estado WHEN 'confirmado' THEN 0 WHEN 'pendiente' THEN 2 ELSE 4 END
          LIMIT 1
        ),
        p."nombre"
      )
    WHERE p.sku = ANY(${skus})
  `;
}

module.exports = { sincronizarProducto, sincronizarProductosBulk };
