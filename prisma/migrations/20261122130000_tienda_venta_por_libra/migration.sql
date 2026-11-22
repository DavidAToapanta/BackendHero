ALTER TYPE "UnidadVenta" ADD VALUE 'LIBRA';

ALTER TABLE "DetallePedido" ADD COLUMN "unidadVenta" "UnidadVenta" NOT NULL DEFAULT 'UNIDAD';
ALTER TABLE "DetalleVenta" ADD COLUMN "unidadVenta" "UnidadVenta" NOT NULL DEFAULT 'UNIDAD';
ALTER TABLE "DetalleComprobanteVenta" ADD COLUMN "unidadVenta" "UnidadVenta" NOT NULL DEFAULT 'UNIDAD';

ALTER TABLE "LoteInventario" ALTER COLUMN "costoUnitario" TYPE DECIMAL(21, 7);
ALTER TABLE "MovimientoInventario"
  ALTER COLUMN "costoUnitario" TYPE DECIMAL(21, 7),
  ALTER COLUMN "costoTotal" TYPE DECIMAL(21, 7);
ALTER TABLE "AsignacionLoteVenta"
  ALTER COLUMN "costoUnitario" TYPE DECIMAL(21, 7),
  ALTER COLUMN "costoTotal" TYPE DECIMAL(21, 7);
ALTER TABLE "DetalleDevolucionVenta"
  ALTER COLUMN "costoUnitario" TYPE DECIMAL(21, 7),
  ALTER COLUMN "costoTotal" TYPE DECIMAL(21, 7);
