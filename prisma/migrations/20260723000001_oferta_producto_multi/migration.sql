-- CreateTable
CREATE TABLE "OfertaProducto" (
    "id" TEXT NOT NULL,
    "ofertaId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfertaProducto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OfertaProducto_ofertaId_productoId_key" ON "OfertaProducto"("ofertaId", "productoId");

-- AddForeignKey
ALTER TABLE "OfertaProducto" ADD CONSTRAINT "OfertaProducto_ofertaId_fkey"
    FOREIGN KEY ("ofertaId") REFERENCES "Oferta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfertaProducto" ADD CONSTRAINT "OfertaProducto_productoId_fkey"
    FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Migrar ofertas tipo 'producto' existentes con productoId individual
INSERT INTO "OfertaProducto" ("id", "ofertaId", "productoId", "createdAt")
SELECT gen_random_uuid()::text, o."id", o."productoId", NOW()
FROM "Oferta" o
WHERE o."productoId" IS NOT NULL AND o."tipo" = 'producto'
ON CONFLICT DO NOTHING;
