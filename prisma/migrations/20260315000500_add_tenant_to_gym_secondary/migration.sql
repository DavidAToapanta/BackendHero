ALTER TABLE "Asistencia"
ADD COLUMN IF NOT EXISTS "tenantId" INTEGER;

ALTER TABLE "Rutina"
ADD COLUMN IF NOT EXISTS "tenantId" INTEGER;

ALTER TABLE "Entrenamiento"
ADD COLUMN IF NOT EXISTS "tenantId" INTEGER;

ALTER TABLE "Semana"
ADD COLUMN IF NOT EXISTS "tenantId" INTEGER;

ALTER TABLE IF EXISTS "MusculoSemana"
ADD COLUMN IF NOT EXISTS "tenantId" INTEGER;

ALTER TABLE IF EXISTS "EjercicioMusculo"
ADD COLUMN IF NOT EXISTS "tenantId" INTEGER;

CREATE INDEX IF NOT EXISTS "Asistencia_tenantId_idx" ON "Asistencia"("tenantId");
CREATE INDEX IF NOT EXISTS "Rutina_tenantId_idx" ON "Rutina"("tenantId");
CREATE INDEX IF NOT EXISTS "Entrenamiento_tenantId_idx" ON "Entrenamiento"("tenantId");
CREATE INDEX IF NOT EXISTS "Semana_tenantId_idx" ON "Semana"("tenantId");

DO $$
BEGIN
  IF to_regclass('"MusculoSemana"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "MusculoSemana_tenantId_idx" ON "MusculoSemana"("tenantId");
  END IF;

  IF to_regclass('"EjercicioMusculo"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "EjercicioMusculo_tenantId_idx" ON "EjercicioMusculo"("tenantId");
  END IF;
END $$;

ALTER TABLE "Asistencia"
DROP CONSTRAINT IF EXISTS "Asistencia_tenantId_fkey";

ALTER TABLE "Asistencia"
ADD CONSTRAINT "Asistencia_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Rutina"
DROP CONSTRAINT IF EXISTS "Rutina_tenantId_fkey";

ALTER TABLE "Rutina"
ADD CONSTRAINT "Rutina_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Entrenamiento"
DROP CONSTRAINT IF EXISTS "Entrenamiento_tenantId_fkey";

ALTER TABLE "Entrenamiento"
ADD CONSTRAINT "Entrenamiento_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Semana"
DROP CONSTRAINT IF EXISTS "Semana_tenantId_fkey";

ALTER TABLE "Semana"
ADD CONSTRAINT "Semana_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
BEGIN
  IF to_regclass('"MusculoSemana"') IS NOT NULL THEN
    ALTER TABLE "MusculoSemana"
    DROP CONSTRAINT IF EXISTS "MusculoSemana_tenantId_fkey";

    ALTER TABLE "MusculoSemana"
    ADD CONSTRAINT "MusculoSemana_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF to_regclass('"EjercicioMusculo"') IS NOT NULL THEN
    ALTER TABLE "EjercicioMusculo"
    DROP CONSTRAINT IF EXISTS "EjercicioMusculo_tenantId_fkey";

    ALTER TABLE "EjercicioMusculo"
    ADD CONSTRAINT "EjercicioMusculo_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

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

  UPDATE "Asistencia" AS asistencia
  SET "tenantId" = COALESCE(cliente."tenantId", legacy_tenant_id)
  FROM "Cliente" AS cliente
  WHERE asistencia."clienteId" = cliente."id"
    AND asistencia."tenantId" IS NULL;

  UPDATE "Asistencia"
  SET "tenantId" = legacy_tenant_id
  WHERE "tenantId" IS NULL;

  UPDATE "Rutina" AS rutina
  SET "tenantId" = COALESCE(cliente."tenantId", legacy_tenant_id)
  FROM "Cliente" AS cliente
  WHERE rutina."clienteId" = cliente."id"
    AND rutina."tenantId" IS NULL;

  UPDATE "Rutina"
  SET "tenantId" = legacy_tenant_id
  WHERE "tenantId" IS NULL;

  UPDATE "Entrenamiento" AS entrenamiento
  SET "tenantId" = COALESCE(rutina."tenantId", legacy_tenant_id)
  FROM "Rutina" AS rutina
  WHERE entrenamiento."rutinaId" = rutina."id"
    AND entrenamiento."tenantId" IS NULL;

  UPDATE "Entrenamiento"
  SET "tenantId" = legacy_tenant_id
  WHERE "tenantId" IS NULL;

  UPDATE "Semana" AS semana
  SET "tenantId" = COALESCE(entrenamiento."tenantId", legacy_tenant_id)
  FROM "Entrenamiento" AS entrenamiento
  WHERE semana."entrenamientoId" = entrenamiento."id"
    AND semana."tenantId" IS NULL;

  UPDATE "Semana"
  SET "tenantId" = legacy_tenant_id
  WHERE "tenantId" IS NULL;

  IF to_regclass('"MusculoSemana"') IS NOT NULL THEN
  UPDATE "MusculoSemana" AS musculo_semana
  SET "tenantId" = COALESCE(semana."tenantId", legacy_tenant_id)
  FROM "Semana" AS semana
  WHERE musculo_semana."semanaId" = semana."id"
    AND musculo_semana."tenantId" IS NULL;

  UPDATE "MusculoSemana"
  SET "tenantId" = legacy_tenant_id
  WHERE "tenantId" IS NULL;
END IF;

  IF to_regclass('"MusculoSemana"') IS NOT NULL
   AND to_regclass('"EjercicioMusculo"') IS NOT NULL THEN
  UPDATE "EjercicioMusculo" AS ejercicio_musculo
  SET "tenantId" = COALESCE(musculo_semana."tenantId", legacy_tenant_id)
  FROM "MusculoSemana" AS musculo_semana
  WHERE ejercicio_musculo."musculoSemanaId" = musculo_semana."id"
    AND ejercicio_musculo."tenantId" IS NULL;
END IF;

  IF to_regclass('"EjercicioMusculo"') IS NOT NULL THEN
  UPDATE "EjercicioMusculo"
  SET "tenantId" = legacy_tenant_id
  WHERE "tenantId" IS NULL;
END IF;
END
$$;
