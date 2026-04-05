DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Producto"
    WHERE "tenantId" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "Compra"
    WHERE "tenantId" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "Gasto"
    WHERE "tenantId" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "CambioPlan"
    WHERE "tenantId" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "DevolucionMovimiento"
    WHERE "tenantId" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "Novedad"
    WHERE "tenantId" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "ClienteMedida"
    WHERE "tenantId" IS NULL
  ) THEN
    RAISE EXCEPTION 'No se puede volver tenantId obligatorio mientras existan registros comerciales o de seguimiento sin tenant';
  END IF;
END
$$;

ALTER TABLE "Producto"
ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "Compra"
ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "Gasto"
ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "CambioPlan"
ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "DevolucionMovimiento"
ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "Novedad"
ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "ClienteMedida"
ALTER COLUMN "tenantId" SET NOT NULL;
