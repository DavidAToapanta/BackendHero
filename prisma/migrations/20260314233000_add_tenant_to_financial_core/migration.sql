ALTER TABLE "Cliente"
ADD COLUMN IF NOT EXISTS "tenantId" INTEGER;

ALTER TABLE "Plan"
ADD COLUMN IF NOT EXISTS "tenantId" INTEGER;

ALTER TABLE "ClientePlan"
ADD COLUMN IF NOT EXISTS "tenantId" INTEGER;

ALTER TABLE "Pago"
ADD COLUMN IF NOT EXISTS "tenantId" INTEGER;

ALTER TABLE "Deuda"
ADD COLUMN IF NOT EXISTS "tenantId" INTEGER;

ALTER TABLE "Factura"
ADD COLUMN IF NOT EXISTS "tenantId" INTEGER;

CREATE INDEX IF NOT EXISTS "Cliente_tenantId_idx" ON "Cliente"("tenantId");
CREATE INDEX IF NOT EXISTS "Plan_tenantId_idx" ON "Plan"("tenantId");
CREATE INDEX IF NOT EXISTS "ClientePlan_tenantId_idx" ON "ClientePlan"("tenantId");
CREATE INDEX IF NOT EXISTS "Pago_tenantId_idx" ON "Pago"("tenantId");
CREATE INDEX IF NOT EXISTS "Deuda_tenantId_idx" ON "Deuda"("tenantId");
CREATE INDEX IF NOT EXISTS "Factura_tenantId_idx" ON "Factura"("tenantId");

ALTER TABLE "Cliente"
DROP CONSTRAINT IF EXISTS "Cliente_tenantId_fkey";

ALTER TABLE "Cliente"
ADD CONSTRAINT "Cliente_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Plan"
DROP CONSTRAINT IF EXISTS "Plan_tenantId_fkey";

ALTER TABLE "Plan"
ADD CONSTRAINT "Plan_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClientePlan"
DROP CONSTRAINT IF EXISTS "ClientePlan_tenantId_fkey";

ALTER TABLE "ClientePlan"
ADD CONSTRAINT "ClientePlan_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Pago"
DROP CONSTRAINT IF EXISTS "Pago_tenantId_fkey";

ALTER TABLE "Pago"
ADD CONSTRAINT "Pago_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Deuda"
DROP CONSTRAINT IF EXISTS "Deuda_tenantId_fkey";

ALTER TABLE "Deuda"
ADD CONSTRAINT "Deuda_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Factura"
DROP CONSTRAINT IF EXISTS "Factura_tenantId_fkey";

ALTER TABLE "Factura"
ADD CONSTRAINT "Factura_tenantId_fkey"
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

  UPDATE "Cliente"
  SET "tenantId" = legacy_tenant_id
  WHERE "tenantId" IS NULL;

  UPDATE "Plan"
  SET "tenantId" = legacy_tenant_id
  WHERE "tenantId" IS NULL;

  UPDATE "ClientePlan"
  SET "tenantId" = legacy_tenant_id
  WHERE "tenantId" IS NULL;

  UPDATE "Pago" AS pago
  SET "tenantId" = COALESCE(cliente_plan."tenantId", legacy_tenant_id)
  FROM "ClientePlan" AS cliente_plan
  WHERE pago."clientePlanId" = cliente_plan."id"
    AND pago."tenantId" IS NULL;

  UPDATE "Pago"
  SET "tenantId" = legacy_tenant_id
  WHERE "tenantId" IS NULL;

  UPDATE "Deuda" AS deuda
  SET "tenantId" = COALESCE(cliente_plan."tenantId", legacy_tenant_id)
  FROM "ClientePlan" AS cliente_plan
  WHERE deuda."clientePlanId" = cliente_plan."id"
    AND deuda."tenantId" IS NULL;

  UPDATE "Deuda"
  SET "tenantId" = legacy_tenant_id
  WHERE "tenantId" IS NULL;

  UPDATE "Factura" AS factura
  SET "tenantId" = COALESCE(cliente_plan."tenantId", legacy_tenant_id)
  FROM "ClientePlan" AS cliente_plan
  WHERE factura."clientePlanId" = cliente_plan."id"
    AND factura."tenantId" IS NULL;

  UPDATE "Factura"
  SET "tenantId" = legacy_tenant_id
  WHERE "tenantId" IS NULL;
END
$$;
