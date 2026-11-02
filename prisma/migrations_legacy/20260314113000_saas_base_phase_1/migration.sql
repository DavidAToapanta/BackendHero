DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TipoNegocio') THEN
    CREATE TYPE "TipoNegocio" AS ENUM ('GYM', 'STORE', 'MIXTO');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TenantEstado') THEN
    CREATE TYPE "TenantEstado" AS ENUM ('ACTIVO', 'SUSPENDIDO', 'ELIMINADO');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TenantRole') THEN
    CREATE TYPE "TenantRole" AS ENUM (
      'OWNER',
      'ADMIN',
      'EMPLEADO',
      'ENTRENADOR',
      'RECEPCIONISTA',
      'CAJERO'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserTenantEstado') THEN
    CREATE TYPE "UserTenantEstado" AS ENUM ('ACTIVO', 'PENDIENTE', 'INACTIVO');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ModuleKey') THEN
    CREATE TYPE "ModuleKey" AS ENUM ('GYM', 'STORE');
  END IF;
END
$$;

ALTER TABLE "Usuario"
ADD COLUMN IF NOT EXISTS "email" TEXT,
ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Usuario"
ALTER COLUMN "userName" DROP NOT NULL,
ALTER COLUMN "cedula" DROP NOT NULL,
ALTER COLUMN "fechaNacimiento" DROP NOT NULL;

WITH ranked_usernames AS (
  SELECT
    "id",
    "userName",
    ROW_NUMBER() OVER (
      PARTITION BY "userName"
      ORDER BY "id"
    ) AS row_number
  FROM "Usuario"
  WHERE "userName" IS NOT NULL
)
UPDATE "Usuario" AS usuario
SET "userName" = NULL
FROM ranked_usernames
WHERE usuario."id" = ranked_usernames."id"
  AND ranked_usernames.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "Usuario_email_key" ON "Usuario"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "Usuario_userName_key" ON "Usuario"("userName");

CREATE TABLE IF NOT EXISTS "Tenant" (
  "id" SERIAL NOT NULL,
  "nombre" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "tipoNegocio" "TipoNegocio" NOT NULL,
  "estado" "TenantEstado" NOT NULL DEFAULT 'ACTIVO',
  "email" TEXT,
  "telefono" TEXT,
  "direccion" TEXT,
  "ciudad" TEXT,
  "pais" TEXT,
  "logoUrl" TEXT,
  "descripcion" TEXT,
  "latitud" DOUBLE PRECISION,
  "longitud" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_slug_key" ON "Tenant"("slug");
CREATE INDEX IF NOT EXISTS "Tenant_tipoNegocio_idx" ON "Tenant"("tipoNegocio");
CREATE INDEX IF NOT EXISTS "Tenant_estado_idx" ON "Tenant"("estado");

CREATE TABLE IF NOT EXISTS "UserTenant" (
  "id" SERIAL NOT NULL,
  "usuarioId" INTEGER NOT NULL,
  "tenantId" INTEGER NOT NULL,
  "role" "TenantRole" NOT NULL,
  "estado" "UserTenantEstado" NOT NULL DEFAULT 'ACTIVO',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserTenant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserTenant_usuarioId_tenantId_key" ON "UserTenant"("usuarioId", "tenantId");
CREATE INDEX IF NOT EXISTS "UserTenant_tenantId_role_idx" ON "UserTenant"("tenantId", "role");
CREATE INDEX IF NOT EXISTS "UserTenant_usuarioId_idx" ON "UserTenant"("usuarioId");

ALTER TABLE "UserTenant"
DROP CONSTRAINT IF EXISTS "UserTenant_usuarioId_fkey";

ALTER TABLE "UserTenant"
ADD CONSTRAINT "UserTenant_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserTenant"
DROP CONSTRAINT IF EXISTS "UserTenant_tenantId_fkey";

ALTER TABLE "UserTenant"
ADD CONSTRAINT "UserTenant_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "TenantModule" (
  "id" SERIAL NOT NULL,
  "tenantId" INTEGER NOT NULL,
  "module" "ModuleKey" NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantModule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TenantModule_tenantId_module_key" ON "TenantModule"("tenantId", "module");
CREATE INDEX IF NOT EXISTS "TenantModule_tenantId_idx" ON "TenantModule"("tenantId");

ALTER TABLE "TenantModule"
DROP CONSTRAINT IF EXISTS "TenantModule_tenantId_fkey";

ALTER TABLE "TenantModule"
ADD CONSTRAINT "TenantModule_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Tenant" ("nombre", "slug", "tipoNegocio", "estado")
SELECT 'Gym Principal', 'gym-principal', 'GYM'::"TipoNegocio", 'ACTIVO'::"TenantEstado"
WHERE NOT EXISTS (
  SELECT 1
  FROM "Tenant"
  WHERE "slug" = 'gym-principal'
);

INSERT INTO "TenantModule" ("tenantId", "module", "activo")
SELECT tenant."id", 'GYM'::"ModuleKey", true
FROM "Tenant" AS tenant
WHERE tenant."slug" = 'gym-principal'
ON CONFLICT ("tenantId", "module") DO NOTHING;

INSERT INTO "UserTenant" ("usuarioId", "tenantId", "role", "estado")
SELECT
  administrador."usuarioId",
  tenant."id",
  CASE
    WHEN administrador."id" = (
      SELECT MIN("id")
      FROM "Administrador"
    ) THEN 'OWNER'::"TenantRole"
    ELSE 'ADMIN'::"TenantRole"
  END,
  'ACTIVO'::"UserTenantEstado"
FROM "Administrador" AS administrador
CROSS JOIN "Tenant" AS tenant
WHERE tenant."slug" = 'gym-principal'
ON CONFLICT ("usuarioId", "tenantId") DO NOTHING;

INSERT INTO "UserTenant" ("usuarioId", "tenantId", "role", "estado")
SELECT
  entrenador."usuarioId",
  tenant."id",
  'ENTRENADOR'::"TenantRole",
  'ACTIVO'::"UserTenantEstado"
FROM "Entrenador" AS entrenador
CROSS JOIN "Tenant" AS tenant
WHERE tenant."slug" = 'gym-principal'
ON CONFLICT ("usuarioId", "tenantId") DO NOTHING;

INSERT INTO "UserTenant" ("usuarioId", "tenantId", "role", "estado")
SELECT
  recepcionista."usuarioId",
  tenant."id",
  'RECEPCIONISTA'::"TenantRole",
  'ACTIVO'::"UserTenantEstado"
FROM "Recepcionista" AS recepcionista
CROSS JOIN "Tenant" AS tenant
WHERE tenant."slug" = 'gym-principal'
ON CONFLICT ("usuarioId", "tenantId") DO NOTHING;
