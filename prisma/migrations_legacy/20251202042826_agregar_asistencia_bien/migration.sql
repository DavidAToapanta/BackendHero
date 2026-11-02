-- CreateTable
CREATE TABLE "Asistencia" (
    "id" SERIAL NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "horaEntrada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asistencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Asistencia_clienteId_fecha_idx" ON "Asistencia"("clienteId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "Asistencia_clienteId_fecha_key" ON "Asistencia"("clienteId", "fecha" DESC);

-- AddForeignKey
ALTER TABLE "Asistencia" ADD CONSTRAINT "Asistencia_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
