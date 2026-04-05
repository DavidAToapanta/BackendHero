DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Asistencia"
    WHERE "tenantId" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "Rutina"
    WHERE "tenantId" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "Entrenamiento"
    WHERE "tenantId" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "Semana"
    WHERE "tenantId" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "MusculoSemana"
    WHERE "tenantId" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "EjercicioMusculo"
    WHERE "tenantId" IS NULL
  ) THEN
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

ALTER TABLE "MusculoSemana"
ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "EjercicioMusculo"
ALTER COLUMN "tenantId" SET NOT NULL;
