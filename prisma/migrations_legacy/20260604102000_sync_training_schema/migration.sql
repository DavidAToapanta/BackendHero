CREATE TABLE IF NOT EXISTS "MusculoSemana" (
  "id" SERIAL NOT NULL,
  "tenantId" INTEGER NOT NULL,
  "semanaId" INTEGER NOT NULL,
  "musculoId" INTEGER NOT NULL,
  "orden" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "MusculoSemana_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EjercicioMusculo" (
  "id" SERIAL NOT NULL,
  "tenantId" INTEGER NOT NULL,
  "musculoSemanaId" INTEGER NOT NULL,
  "ejercicioId" INTEGER NOT NULL,
  "orden" INTEGER NOT NULL,
  CONSTRAINT "EjercicioMusculo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MusculoSemana_tenantId_idx" ON "MusculoSemana"("tenantId");
CREATE INDEX IF NOT EXISTS "EjercicioMusculo_tenantId_idx" ON "EjercicioMusculo"("tenantId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MusculoSemana_tenantId_fkey'
  ) THEN
    ALTER TABLE "MusculoSemana"
    ADD CONSTRAINT "MusculoSemana_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MusculoSemana_semanaId_fkey'
  ) THEN
    ALTER TABLE "MusculoSemana"
    ADD CONSTRAINT "MusculoSemana_semanaId_fkey"
    FOREIGN KEY ("semanaId") REFERENCES "Semana"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MusculoSemana_musculoId_fkey'
  ) THEN
    ALTER TABLE "MusculoSemana"
    ADD CONSTRAINT "MusculoSemana_musculoId_fkey"
    FOREIGN KEY ("musculoId") REFERENCES "Musculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EjercicioMusculo_tenantId_fkey'
  ) THEN
    ALTER TABLE "EjercicioMusculo"
    ADD CONSTRAINT "EjercicioMusculo_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EjercicioMusculo_musculoSemanaId_fkey'
  ) THEN
    ALTER TABLE "EjercicioMusculo"
    ADD CONSTRAINT "EjercicioMusculo_musculoSemanaId_fkey"
    FOREIGN KEY ("musculoSemanaId") REFERENCES "MusculoSemana"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EjercicioMusculo_ejercicioId_fkey'
  ) THEN
    ALTER TABLE "EjercicioMusculo"
    ADD CONSTRAINT "EjercicioMusculo_ejercicioId_fkey"
    FOREIGN KEY ("ejercicioId") REFERENCES "Ejercicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Semana'
      AND column_name = 'musculoId'
  ) THEN
    INSERT INTO "MusculoSemana" ("tenantId", "semanaId", "musculoId", "orden")
    SELECT semana."tenantId", semana."id", semana."musculoId", 1
    FROM "Semana" AS semana
    WHERE NOT EXISTS (
      SELECT 1
      FROM "MusculoSemana" AS musculo_semana
      WHERE musculo_semana."semanaId" = semana."id"
        AND musculo_semana."musculoId" = semana."musculoId"
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('"SemanaEjercicio"') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Semana'
        AND column_name = 'musculoId'
    ) THEN
      INSERT INTO "EjercicioMusculo" (
        "id",
        "tenantId",
        "musculoSemanaId",
        "ejercicioId",
        "orden"
      )
      SELECT
        semana_ejercicio."id",
        musculo_semana."tenantId",
        musculo_semana."id",
        semana_ejercicio."ejercicioId",
        semana_ejercicio."orden"
      FROM "SemanaEjercicio" AS semana_ejercicio
      INNER JOIN "Semana" AS semana
        ON semana."id" = semana_ejercicio."semanaId"
      INNER JOIN "MusculoSemana" AS musculo_semana
        ON musculo_semana."semanaId" = semana."id"
       AND musculo_semana."musculoId" = semana."musculoId"
      WHERE NOT EXISTS (
        SELECT 1
        FROM "EjercicioMusculo" AS ejercicio_musculo
        WHERE ejercicio_musculo."id" = semana_ejercicio."id"
      );
    ELSE
      INSERT INTO "EjercicioMusculo" (
        "id",
        "tenantId",
        "musculoSemanaId",
        "ejercicioId",
        "orden"
      )
      SELECT
        semana_ejercicio."id",
        musculo_semana."tenantId",
        musculo_semana."id",
        semana_ejercicio."ejercicioId",
        semana_ejercicio."orden"
      FROM "SemanaEjercicio" AS semana_ejercicio
      INNER JOIN LATERAL (
        SELECT "id", "tenantId"
        FROM "MusculoSemana"
        WHERE "semanaId" = semana_ejercicio."semanaId"
        ORDER BY "orden" ASC, "id" ASC
        LIMIT 1
      ) AS musculo_semana ON TRUE
      WHERE NOT EXISTS (
        SELECT 1
        FROM "EjercicioMusculo" AS ejercicio_musculo
        WHERE ejercicio_musculo."id" = semana_ejercicio."id"
      );
    END IF;
  END IF;
END
$$;

SELECT setval(
  pg_get_serial_sequence('"MusculoSemana"', 'id'),
  COALESCE((SELECT MAX("id") FROM "MusculoSemana"), 1),
  COALESCE((SELECT MAX("id") FROM "MusculoSemana"), 0) > 0
);

SELECT setval(
  pg_get_serial_sequence('"EjercicioMusculo"', 'id'),
  COALESCE((SELECT MAX("id") FROM "EjercicioMusculo"), 1),
  COALESCE((SELECT MAX("id") FROM "EjercicioMusculo"), 0) > 0
);

ALTER TABLE "SerieRep"
ADD COLUMN IF NOT EXISTS "ejercicioMusculoId" INTEGER;

ALTER TABLE "SerieTiempo"
ADD COLUMN IF NOT EXISTS "ejercicioMusculoId" INTEGER;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'SerieRep'
      AND column_name = 'semanaEjercicioId'
  ) THEN
    UPDATE "SerieRep"
    SET "ejercicioMusculoId" = "semanaEjercicioId"
    WHERE "ejercicioMusculoId" IS NULL
      AND EXISTS (
        SELECT 1
        FROM "EjercicioMusculo"
        WHERE "EjercicioMusculo"."id" = "SerieRep"."semanaEjercicioId"
      );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'SerieTiempo'
      AND column_name = 'semanaEjercicioId'
  ) THEN
    UPDATE "SerieTiempo"
    SET "ejercicioMusculoId" = "semanaEjercicioId"
    WHERE "ejercicioMusculoId" IS NULL
      AND EXISTS (
        SELECT 1
        FROM "EjercicioMusculo"
        WHERE "EjercicioMusculo"."id" = "SerieTiempo"."semanaEjercicioId"
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "SerieRep" WHERE "ejercicioMusculoId" IS NULL) THEN
    RAISE EXCEPTION 'No se pudo migrar SerieRep.ejercicioMusculoId para todos los registros';
  END IF;

  IF EXISTS (SELECT 1 FROM "SerieTiempo" WHERE "ejercicioMusculoId" IS NULL) THEN
    RAISE EXCEPTION 'No se pudo migrar SerieTiempo.ejercicioMusculoId para todos los registros';
  END IF;
END
$$;

ALTER TABLE "SerieRep"
ALTER COLUMN "ejercicioMusculoId" SET NOT NULL;

ALTER TABLE "SerieTiempo"
ALTER COLUMN "ejercicioMusculoId" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SerieRep_ejercicioMusculoId_fkey'
  ) THEN
    ALTER TABLE "SerieRep"
    ADD CONSTRAINT "SerieRep_ejercicioMusculoId_fkey"
    FOREIGN KEY ("ejercicioMusculoId") REFERENCES "EjercicioMusculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SerieTiempo_ejercicioMusculoId_fkey'
  ) THEN
    ALTER TABLE "SerieTiempo"
    ADD CONSTRAINT "SerieTiempo_ejercicioMusculoId_fkey"
    FOREIGN KEY ("ejercicioMusculoId") REFERENCES "EjercicioMusculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

ALTER TABLE "SerieRep"
DROP CONSTRAINT IF EXISTS "SerieRep_semanaEjercicioId_fkey";

ALTER TABLE "SerieTiempo"
DROP CONSTRAINT IF EXISTS "SerieTiempo_semanaEjercicioId_fkey";

ALTER TABLE "SemanaEjercicio"
DROP CONSTRAINT IF EXISTS "SemanaEjercicio_semanaId_fkey";

ALTER TABLE "SemanaEjercicio"
DROP CONSTRAINT IF EXISTS "SemanaEjercicio_ejercicioId_fkey";

ALTER TABLE "SerieRep"
DROP COLUMN IF EXISTS "semanaEjercicioId";

ALTER TABLE "SerieTiempo"
DROP COLUMN IF EXISTS "semanaEjercicioId";

DROP TABLE IF EXISTS "SemanaEjercicio";

ALTER TABLE "Semana"
DROP CONSTRAINT IF EXISTS "Semana_musculoId_fkey";

ALTER TABLE "Semana"
DROP COLUMN IF EXISTS "musculoId";

ALTER TABLE "Ejercicio"
ALTER COLUMN "foto" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Musculo_nombre_key" ON "Musculo"("nombre");
CREATE UNIQUE INDEX IF NOT EXISTS "Ejercicio_nombre_key" ON "Ejercicio"("nombre");
