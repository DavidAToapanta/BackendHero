/*
  Warnings:

  - The column `mesesPagar` on the `Plan` table has been renamed to `duracion`.
  - Added the required column `unidadDuracion` to the `Plan` table with default value 'MESES'.

*/
-- CreateEnum
CREATE TYPE "UnidadDuracion" AS ENUM ('MESES', 'DIAS');

-- AlterTable
ALTER TABLE "Plan" RENAME COLUMN "mesesPagar" TO "duracion";
ALTER TABLE "Plan" ADD COLUMN "unidadDuracion" "UnidadDuracion" NOT NULL DEFAULT 'MESES';
