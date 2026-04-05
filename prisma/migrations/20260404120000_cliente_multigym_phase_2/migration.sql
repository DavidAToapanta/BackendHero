-- DropIndex
DROP INDEX IF EXISTS "Cliente_usuarioId_key";

-- AlterTable
CREATE SEQUENCE IF NOT EXISTS cliente_id_seq;
SELECT setval(
  'cliente_id_seq',
  COALESCE((SELECT MAX("id") FROM "Cliente"), 1),
  COALESCE((SELECT MAX("id") FROM "Cliente"), 0) > 0
);
ALTER TABLE "Cliente" ALTER COLUMN "id" SET DEFAULT nextval('cliente_id_seq');
ALTER SEQUENCE cliente_id_seq OWNED BY "Cliente"."id";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Cliente_usuarioId_idx" ON "Cliente"("usuarioId");
CREATE UNIQUE INDEX IF NOT EXISTS "Cliente_usuarioId_tenantId_key" ON "Cliente"("usuarioId", "tenantId");
