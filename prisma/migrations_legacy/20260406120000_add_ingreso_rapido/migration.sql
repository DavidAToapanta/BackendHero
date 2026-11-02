CREATE TABLE "IngresoRapido" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "concepto" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngresoRapido_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IngresoRapido_tenantId_idx" ON "IngresoRapido"("tenantId");
CREATE INDEX "IngresoRapido_fecha_idx" ON "IngresoRapido"("fecha");

ALTER TABLE "IngresoRapido"
ADD CONSTRAINT "IngresoRapido_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
