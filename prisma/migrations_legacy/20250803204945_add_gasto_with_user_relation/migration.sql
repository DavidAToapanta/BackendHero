/*
  Warnings:

  - You are about to drop the column `concepto` on the `Gasto` table. All the data in the column will be lost.
  - Added the required column `descripcion` to the `Gasto` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Gasto" DROP COLUMN "concepto",
ADD COLUMN     "descripcion" TEXT NOT NULL,
ALTER COLUMN "fecha" SET DEFAULT CURRENT_TIMESTAMP;
