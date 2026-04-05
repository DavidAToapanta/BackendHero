DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Usuario"
    WHERE "cedula" IS NULL
  ) THEN
    RAISE EXCEPTION 'No se puede volver cedula obligatoria mientras existan usuarios sin cedula';
  END IF;
END
$$;

ALTER TABLE "Usuario"
ALTER COLUMN "cedula" SET NOT NULL;
