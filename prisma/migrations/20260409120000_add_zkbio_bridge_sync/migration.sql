CREATE TYPE "SaasPlan" AS ENUM ('FREE', 'PLUS');

CREATE TYPE "OrigenAsistencia" AS ENUM ('MANUAL', 'BIOMETRIA');

ALTER TABLE "Tenant"
ADD COLUMN "saasPlan" "SaasPlan" NOT NULL DEFAULT 'FREE',
ADD COLUMN "bridgeKeyHash" TEXT;

ALTER TABLE "Cliente"
ADD COLUMN "zkbioPersonId" TEXT;

ALTER TABLE "Asistencia"
ADD COLUMN "origen" "OrigenAsistencia" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "eventoBiometricoId" TEXT,
ADD COLUMN "dispositivoSn" TEXT,
ADD COLUMN "biometricoPersonId" TEXT;

CREATE UNIQUE INDEX "Cliente_tenantId_zkbioPersonId_key" ON "Cliente"("tenantId", "zkbioPersonId");

CREATE UNIQUE INDEX "Asistencia_tenantId_eventoBiometricoId_key" ON "Asistencia"("tenantId", "eventoBiometricoId");
