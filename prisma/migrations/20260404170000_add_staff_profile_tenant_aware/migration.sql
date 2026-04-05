CREATE TABLE "StaffProfile" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "tenantRole" "TenantRole" NOT NULL,
    "horario" TEXT NOT NULL,
    "sueldo" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffProfile_usuarioId_tenantId_tenantRole_key"
ON "StaffProfile"("usuarioId", "tenantId", "tenantRole");

CREATE INDEX "StaffProfile_tenantId_idx" ON "StaffProfile"("tenantId");

CREATE INDEX "StaffProfile_usuarioId_idx" ON "StaffProfile"("usuarioId");

CREATE INDEX "StaffProfile_tenantId_tenantRole_idx"
ON "StaffProfile"("tenantId", "tenantRole");

ALTER TABLE "StaffProfile"
ADD CONSTRAINT "StaffProfile_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffProfile"
ADD CONSTRAINT "StaffProfile_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
