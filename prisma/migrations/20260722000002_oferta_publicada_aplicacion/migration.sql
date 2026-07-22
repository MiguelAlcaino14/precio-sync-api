-- AlterTable Oferta: agregar campo publicada
ALTER TABLE "Oferta" ADD COLUMN "publicada" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable OfertaAplicacion
CREATE TABLE "OfertaAplicacion" (
    "id" TEXT NOT NULL,
    "ofertaId" TEXT NOT NULL,
    "jumpsellerProductId" INTEGER NOT NULL,
    "precioOriginal" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfertaAplicacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex unique por oferta + producto JS
CREATE UNIQUE INDEX "OfertaAplicacion_ofertaId_jumpsellerProductId_key" ON "OfertaAplicacion"("ofertaId", "jumpsellerProductId");

-- AddForeignKey
ALTER TABLE "OfertaAplicacion" ADD CONSTRAINT "OfertaAplicacion_ofertaId_fkey" FOREIGN KEY ("ofertaId") REFERENCES "Oferta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
