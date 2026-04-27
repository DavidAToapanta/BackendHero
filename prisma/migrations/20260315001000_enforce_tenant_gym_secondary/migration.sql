DO $$
DECLARE
  has_null_tenant BOOLEAN := FALSE;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Asistencia"
    WHERE "tenantId" IS NULL
  ) THEN
    has_null_tenant := TRUE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Rutina"
    WHERE "tenantId" IS NULL
  ) THEN
    has_null_tenant := TRUE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Entrenamiento"
    WHERE "tenantId" IS NULL
  ) THEN
    has_null_tenant := TRUE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Semana"
    WHERE "tenantId" IS NULL
  ) THEN
    has_null_tenant := TRUE;
  END IF;

  IF to_regclass('"MusculoSemana"') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM "MusculoSemana"
      WHERE "tenantId" IS NULL
    ) THEN
      has_null_tenant := TRUE;
    END IF;
  END IF;

  IF to_regclass('"EjercicioMusculo"') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM "EjercicioMusculo"
      WHERE "tenantId" IS NULL
    ) THEN
      has_null_tenant := TRUE;
    END IF;
  END IF;

  IF has_null_tenant THEN
    RAISE EXCEPTION 'No se puede volver tenantId obligatorio mientras existan registros secundarios sin tenant';
  END IF;
END
$$;

ALTER TABLE "Asistencia"
ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "Rutina"
ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "Entrenamiento"
ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "Semana"
ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE IF EXISTS "MusculoSemana"
ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE IF EXISTS "EjercicioMusculo"
ALTER COLUMN "tenantId" SET NOT NULL;