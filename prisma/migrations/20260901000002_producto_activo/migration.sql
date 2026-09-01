ALTER TABLE "Producto" ADD COLUMN IF NOT EXISTS "activo" BOOLEAN NOT NULL DEFAULT true;

-- Marcar como inactivos los productos que ya tienen todos sus mapeos ignorados
UPDATE "Producto" p SET "activo" = false
WHERE EXISTS (
  SELECT 1 FROM "MapeoSku" m WHERE m."skuProveedor" = p.sku
)
AND NOT EXISTS (
  SELECT 1 FROM "MapeoSku" m WHERE m."skuProveedor" = p.sku AND m.estado != 'ignorado'
);
