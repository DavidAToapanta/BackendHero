ALTER TABLE "Producto"
ADD COLUMN IF NOT EXISTS "tenantId" INTEGER;

ALTER TABLE "Compra"
ADD COLUMN IF NOT EXISTS "tenantId" INTEGER;

ALTER TABLE "Gasto"
ADD COLUMN IF NOT EXISTS "tenantId" INTEGER;

ALTER TABLE "CambioPlan"
ADD COLUMN IF NOT EXISTS "tenantId" INTEGER;

ALTER TABLE "DevolucionMovimiento"
ADD COLUMN IF NOT EXISTS "tenantId" INTEGER;

ALTER TABLE "Novedad"
ADD COLUMN IF NOT EXISTS "tenantId" INTEGER;

ALTER TABLE "ClienteMedida"
ADD COLUMN IF NOT EXISTS "tenantId" INTEGER;

CREATE INDEX IF NOT EXISTS "Producto_tenantId_idx" ON "Producto"("tenantId");
CREATE INDEX IF NOT EXISTS "Compra_tenantId_idx" ON "Compra"("tenantId");
CREATE INDEX IF NOT EXISTS "Gasto_tenantId_idx" ON "Gasto"("tenantId");
CREATE INDEX IF NOT EXISTS "CambioPlan_tenantId_idx" ON "CambioPlan"("tenantId");
CREATE INDEX IF NOT EXISTS "DevolucionMovimiento_tenantId_idx" ON "DevolucionMovimiento"("tenantId");
CREATE INDEX IF NOT EXISTS "Novedad_tenantId_idx" ON "Novedad"("tenantId");
CREATE INDEX IF NOT EXISTS "ClienteMedida_tenantId_idx" ON "ClienteMedida"("tenantId");

ALTER TABLE "Producto"
DROP CONSTRAINT IF EXISTS "Producto_tenantId_fkey";

ALTER TABLE "Producto"
ADD CONSTRAINT "Producto_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Compra"
DROP CONSTRAINT IF EXISTS "Compra_tenantId_fkey";

ALTER TABLE "Compra"
ADD CONSTRAINT "Compra_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Gasto"
DROP CONSTRAINT IF EXISTS "Gasto_tenantId_fkey";

ALTER TABLE "Gasto"
ADD CONSTRAINT "Gasto_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CambioPlan"
DROP CONSTRAINT IF EXISTS "CambioPlan_tenantId_fkey";

ALTER TABLE "CambioPlan"
ADD CONSTRAINT "CambioPlan_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DevolucionMovimiento"
DROP CONSTRAINT IF EXISTS "DevolucionMovimiento_tenantId_fkey";

ALTER TABLE "DevolucionMovimiento"
ADD CONSTRAINT "DevolucionMovimiento_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Novedad"
DROP CONSTRAINT IF EXISTS "Novedad_tenantId_fkey";

ALTER TABLE "Novedad"
ADD CONSTRAINT "Novedad_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClienteMedida"
DROP CONSTRAINT IF EXISTS "ClienteMedida_tenantId_fkey";

ALTER TABLE "ClienteMedida"
ADD CONSTRAINT "ClienteMedida_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
DECLARE
  legacy_tenant_id INTEGER;
BEGIN
  SELECT "id"
  INTO legacy_tenant_id
  FROM "Tenant"
  WHERE "slug" = 'gym-principal'
  LIMIT 1;

  IF legacy_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant legacy gym-principal no encontrado';
  END IF;

  UPDATE "Producto"
  SET "tenantId" = legacy_tenant_id
  WHERE "tenantId" IS NULL;

  UPDATE "Compra" AS compra
  SET "tenantId" = COALESCE(
    (
      SELECT cliente."tenantId"
      FROM "Cliente" AS cliente
      WHERE cliente."id" = compra."clienteId"
    ),
    (
      SELECT producto."tenantId"
      FROM "Producto" AS producto
      WHERE producto."id" = compra."productoId"
    ),
    legacy_tenant_id
  )
  WHERE compra."tenantId" IS NULL;

  UPDATE "Compra"
  SET "tenantId" = legacy_tenant_id
  WHERE "tenantId" IS NULL;

  UPDATE "Gasto" AS gasto
  SET "tenantId" = COALESCE(
    (
      SELECT membership."tenantId"
      FROM "UserTenant" AS membership
      WHERE membership."usuarioId" = gasto."usuarioId"
        AND membership."estado" = 'ACTIVO'
      ORDER BY membership."id" ASC
      LIMIT 1
    ),
    legacy_tenant_id
  )
  WHERE gasto."tenantId" IS NULL;

  UPDATE "Gasto"
  SET "tenantId" = legacy_tenant_id
  WHERE "tenantId" IS NULL;

  UPDATE "CambioPlan" AS cambio_plan
  SET "tenantId" = COALESCE(
    (
      SELECT cliente_plan_nuevo."tenantId"
      FROM "ClientePlan" AS cliente_plan_nuevo
      WHERE cliente_plan_nuevo."id" = cambio_plan."clientePlanNuevoId"
    ),
    (
      SELECT cliente_plan_anterior."tenantId"
      FROM "ClientePlan" AS cliente_plan_anterior
      WHERE cliente_plan_anterior."id" = cambio_plan."clientePlanAnteriorId"
    ),
    (
      SELECT cliente."tenantId"
      FROM "Cliente" AS cliente
      WHERE cliente."id" = cambio_plan."clienteId"
    ),
    legacy_tenant_id
  )
  WHERE cambio_plan."tenantId" IS NULL;

  UPDATE "CambioPlan"
  SET "tenantId" = legacy_tenant_id
  WHERE "tenantId" IS NULL;

  UPDATE "DevolucionMovimiento" AS devolucion
  SET "tenantId" = COALESCE(
    (
      SELECT factura."tenantId"
      FROM "Factura" AS factura
      WHERE factura."id" = devolucion."facturaId"
    ),
    (
      SELECT cambio_plan."tenantId"
      FROM "CambioPlan" AS cambio_plan
      WHERE cambio_plan."id" = devolucion."cambioPlanId"
    ),
    legacy_tenant_id
  )
  WHERE devolucion."tenantId" IS NULL;

  UPDATE "DevolucionMovimiento"
  SET "tenantId" = legacy_tenant_id
  WHERE "tenantId" IS NULL;

  UPDATE "Novedad" AS novedad
  SET "tenantId" = COALESCE(
    (
      SELECT cliente."tenantId"
      FROM "Cliente" AS cliente
      WHERE cliente."id" = novedad."clienteId"
    ),
    legacy_tenant_id
  )
  WHERE novedad."tenantId" IS NULL;

  UPDATE "Novedad"
  SET "tenantId" = legacy_tenant_id
  WHERE "tenantId" IS NULL;

  UPDATE "ClienteMedida" AS cliente_medida
  SET "tenantId" = COALESCE(
    (
      SELECT cliente."tenantId"
      FROM "Cliente" AS cliente
      WHERE cliente."id" = cliente_medida."clienteId"
    ),
    legacy_tenant_id
  )
  WHERE cliente_medida."tenantId" IS NULL;

  UPDATE "ClienteMedida"
  SET "tenantId" = legacy_tenant_id
  WHERE "tenantId" IS NULL;
END
$$;
