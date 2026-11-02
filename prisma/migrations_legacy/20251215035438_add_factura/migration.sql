-- CreateEnum
CREATE TYPE "EstadoFactura" AS ENUM ('PENDIENTE', 'PAGADA', 'ANULADA');

-- CreateTable
CREATE TABLE "Factura" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "clientePlanId" INTEGER NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "iva" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "totalPagado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "saldo" DOUBLE PRECISION NOT NULL,
    "estado" "EstadoFactura" NOT NULL,
    "fechaEmision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Factura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Factura_numero_key" ON "Factura"("numero");

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_clientePlanId_fkey" FOREIGN KEY ("clientePlanId") REFERENCES "ClientePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
