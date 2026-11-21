CREATE TABLE "ArchivoProductoImagen" (
    "clave" UUID NOT NULL,
    "imagenId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "contenido" BYTEA NOT NULL,
    CONSTRAINT "ArchivoProductoImagen_pkey" PRIMARY KEY ("clave")
);

CREATE UNIQUE INDEX "ArchivoProductoImagen_imagenId_key" ON "ArchivoProductoImagen"("imagenId");

ALTER TABLE "ArchivoProductoImagen" ADD CONSTRAINT "ArchivoProductoImagen_imagenId_fkey"
    FOREIGN KEY ("imagenId") REFERENCES "ProductoImagen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
