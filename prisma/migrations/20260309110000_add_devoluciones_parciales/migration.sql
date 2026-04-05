-- Ensure historical base exists before applying partial refund changes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EstadoDevolucion') THEN
    CREATE TYPE "EstadoDevolucion" AS ENUM ('PENDIENTE', 'COMPLETADO', 'NO_APLICA');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "CambioPlan" (
  "id" SERIAL NOT NULL,
  "clienteId" INTEGER NOT NULL,
  "clientePlanAnteriorId" INTEGER NOT NULL,
  "clientePlanNuevoId" INTEGER NOT NULL,
  "montoPagadoTransferido" DOUBLE PRECISION NOT NULL,
  "montoDevuelto" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "estadoDevolucion" "EstadoDevolucion" NOT NULL DEFAULT 'PENDIENTE',
  "motivo" TEXT,
  CONSTRAINT "CambioPlan_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CambioPlan"
ADD COLUMN IF NOT EXISTS "montoDevuelto" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "estadoDevolucion" "EstadoDevolucion" NOT NULL DEFAULT 'PENDIENTE',
ADD COLUMN IF NOT EXISTS "motivo" TEXT,
ADD COLUMN IF NOT EXISTS "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS "montoPagadoTransferido" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "clienteId" INTEGER,
ADD COLUMN IF NOT EXISTS "clientePlanAnteriorId" INTEGER,
ADD COLUMN IF NOT EXISTS "clientePlanNuevoId" INTEGER;

ALTER TABLE "CambioPlan"
ALTER COLUMN "clienteId" SET NOT NULL,
ALTER COLUMN "clientePlanAnteriorId" SET NOT NULL,
ALTER COLUMN "clientePlanNuevoId" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CambioPlan_clienteId_fkey'
  ) THEN
    ALTER TABLE "CambioPlan"
    ADD CONSTRAINT "CambioPlan_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CambioPlan_clientePlanAnteriorId_fkey'
  ) THEN
    ALTER TABLE "CambioPlan"
    ADD CONSTRAINT "CambioPlan_clientePlanAnteriorId_fkey"
    FOREIGN KEY ("clientePlanAnteriorId") REFERENCES "ClientePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CambioPlan_clientePlanNuevoId_fkey'
  ) THEN
    ALTER TABLE "CambioPlan"
    ADD CONSTRAINT "CambioPlan_clientePlanNuevoId_fkey"
    FOREIGN KEY ("clientePlanNuevoId") REFERENCES "ClientePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

-- Add PARCIAL to EstadoDevolucion enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'EstadoDevolucion'
      AND e.enumlabel = 'PARCIAL'
  ) THEN
    ALTER TYPE "EstadoDevolucion" ADD VALUE 'PARCIAL';
  END IF;
END
$$;

-- Add new refund tracking fields
ALTER TABLE "CambioPlan"
ADD COLUMN IF NOT EXISTS "devolucionPendiente" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "devolucionDevueltaAcumulada" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill existing data from legacy montoDevuelto field
UPDATE "CambioPlan"
SET
  "devolucionPendiente" = COALESCE("montoDevuelto", 0),
  "devolucionDevueltaAcumulada" = 0,
  "estadoDevolucion" = CASE
    WHEN COALESCE("montoDevuelto", 0) > 0 THEN 'PENDIENTE'::"EstadoDevolucion"
    ELSE 'NO_APLICA'::"EstadoDevolucion"
  END;

-- Create audit table for partial refunds
CREATE TABLE "DevolucionMovimiento" (
  "id" SERIAL NOT NULL,
  "cambioPlanId" INTEGER NOT NULL,
  "facturaId" INTEGER NOT NULL,
  "monto" DOUBLE PRECISION NOT NULL,
  "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "motivo" TEXT,
  "usuarioId" INTEGER,
  CONSTRAINT "DevolucionMovimiento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DevolucionMovimiento_cambioPlanId_idx" ON "DevolucionMovimiento"("cambioPlanId");
CREATE INDEX "DevolucionMovimiento_facturaId_idx" ON "DevolucionMovimiento"("facturaId");
CREATE INDEX "DevolucionMovimiento_fecha_idx" ON "DevolucionMovimiento"("fecha");

ALTER TABLE "DevolucionMovimiento"
ADD CONSTRAINT "DevolucionMovimiento_cambioPlanId_fkey"
FOREIGN KEY ("cambioPlanId") REFERENCES "CambioPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DevolucionMovimiento"
ADD CONSTRAINT "DevolucionMovimiento_facturaId_fkey"
FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DevolucionMovimiento"
ADD CONSTRAINT "DevolucionMovimiento_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
