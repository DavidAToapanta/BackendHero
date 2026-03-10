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
