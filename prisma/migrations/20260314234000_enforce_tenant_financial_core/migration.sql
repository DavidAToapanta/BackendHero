DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Cliente"
    WHERE "tenantId" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "Plan"
    WHERE "tenantId" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "ClientePlan"
    WHERE "tenantId" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "Pago"
    WHERE "tenantId" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "Deuda"
    WHERE "tenantId" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "Factura"
    WHERE "tenantId" IS NULL
  ) THEN
    RAISE EXCEPTION 'No se puede volver tenantId obligatorio mientras existan registros sin tenant';
  END IF;
END
$$;

ALTER TABLE "Cliente"
ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "Plan"
ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "ClientePlan"
ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "Pago"
ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "Deuda"
ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "Factura"
ALTER COLUMN "tenantId" SET NOT NULL;
