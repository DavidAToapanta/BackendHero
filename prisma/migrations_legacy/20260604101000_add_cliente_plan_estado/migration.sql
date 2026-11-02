DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EstadoClientePlan') THEN
    CREATE TYPE "EstadoClientePlan" AS ENUM (
      'ACTIVO',
      'CAMBIADO',
      'FINALIZADO',
      'CANCELADO'
    );
  END IF;
END
$$;

ALTER TABLE "ClientePlan"
ADD COLUMN IF NOT EXISTS "estado" "EstadoClientePlan" NOT NULL DEFAULT 'ACTIVO';
