/*
  Warnings:

  - A unique constraint covering the columns `[usuarioId]` on the table `Cliente` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Cliente" ALTER COLUMN "id" DROP DEFAULT;
DROP SEQUENCE "Cliente_id_seq";

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_usuarioId_key" ON "Cliente"("usuarioId");
