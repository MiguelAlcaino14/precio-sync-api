UPDATE "MapeoSku" ms
SET "nombreProducto" = p.nombre
FROM "Producto" p
WHERE ms."skuProveedor" = p.sku
  AND ms."proveedorId" = p."proveedorId"
  AND ms."nombreProducto" IS NULL
  AND p.nombre IS NOT NULL
  AND p.nombre <> '';
