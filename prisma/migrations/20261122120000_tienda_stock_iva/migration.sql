ALTER TABLE "Producto"
  ADD COLUMN "stockMinimo" INTEGER CHECK ("stockMinimo" >= 0),
  ADD COLUMN "ivaTarifaCero" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "TarifaIvaTienda" (
  "id" SERIAL PRIMARY KEY,
  "tenantId" INTEGER NOT NULL REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "porcentaje" DECIMAL(5, 2) NOT NULL CHECK ("porcentaje" BETWEEN 0 AND 100),
  "vigenteDesde" TIMESTAMPTZ(3) NOT NULL
);

CREATE UNIQUE INDEX "TarifaIvaTienda_tenantId_vigenteDesde_key"
  ON "TarifaIvaTienda" ("tenantId", "vigenteDesde");
