CREATE TABLE "MapeoSku" (
    "id" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "skuProveedor" TEXT NOT NULL,
    "jumpsellerProductId" INTEGER,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "similitud" DOUBLE PRECISION,
    "ultimaVezVisto" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MapeoSku_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MapeoSku" ADD CONSTRAINT "MapeoSku_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "MapeoSku_proveedorId_skuProveedor_key" ON "MapeoSku"("proveedorId", "skuProveedor");
