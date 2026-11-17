ALTER TABLE "MovimientoInventario" ALTER COLUMN "responsableId" DROP NOT NULL;
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_responsable_ck"
  CHECK ("responsableId" IS NOT NULL OR "tipo" IN ('RESERVA', 'LIBERACION_RESERVA'));

CREATE INDEX "Pedido_activo_reservaHasta_idx" ON "Pedido" ("reservaHasta", "id")
  WHERE "estado" IN ('CONFIRMADO', 'EN_PREPARACION');

CREATE UNIQUE INDEX "AuditoriaOperacion_prueba_portal_uq"
  ON "AuditoriaOperacion" ("tenantId", "correlacionId")
  WHERE "accion" = 'portal.vincular';
