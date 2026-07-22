-- CreateTable
CREATE TABLE "MapeoSkuLink" (
    "id" TEXT NOT NULL,
    "mapeoSkuId" TEXT NOT NULL,
    "jumpsellerProductId" INTEGER NOT NULL,
    "jumpsellerNombre" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MapeoSkuLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MapeoSkuLink_mapeoSkuId_jumpsellerProductId_key" ON "MapeoSkuLink"("mapeoSkuId", "jumpsellerProductId");

-- AddForeignKey
ALTER TABLE "MapeoSkuLink" ADD CONSTRAINT "MapeoSkuLink_mapeoSkuId_fkey" FOREIGN KEY ("mapeoSkuId") REFERENCES "MapeoSku"("id") ON DELETE CASCADE ON UPDATE CASCADE;
