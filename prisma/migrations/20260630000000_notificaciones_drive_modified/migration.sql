ALTER TABLE "ArchivoImportado" ADD COLUMN "driveModifiedTime" TEXT;

CREATE TABLE "Notificacion" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "datos" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notificacion_pkey" PRIMARY KEY ("id")
);
