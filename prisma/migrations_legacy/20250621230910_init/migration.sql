-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "userName" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "cedula" TEXT NOT NULL,
    "fechaNacimiento" TEXT NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Administrador" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,

    CONSTRAINT "Administrador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entrenador" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "horario" TEXT NOT NULL,
    "sueldo" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Entrenador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recepcionista" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "horario" TEXT NOT NULL,
    "sueldo" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Recepcionista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "horario" TEXT NOT NULL,
    "sexo" TEXT NOT NULL,
    "observaciones" INTEGER NOT NULL,
    "objetivos" TEXT NOT NULL,
    "tiempoEntrenar" INTEGER NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Medida" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Medida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClienteMedida" (
    "id" SERIAL NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "medidaId" INTEGER NOT NULL,
    "medida" INTEGER NOT NULL,

    CONSTRAINT "ClienteMedida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Novedad" (
    "id" SERIAL NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "novedad" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "solventada" BOOLEAN NOT NULL,

    CONSTRAINT "Novedad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio" DOUBLE PRECISION NOT NULL,
    "stock" INTEGER NOT NULL,
    "estado" BOOLEAN NOT NULL,

    CONSTRAINT "Producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Compra" (
    "id" SERIAL NOT NULL,
    "productoId" INTEGER NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio" DOUBLE PRECISION NOT NULL,
    "mesesPagar" INTEGER NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientePlan" (
    "id" SERIAL NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "planId" INTEGER NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3) NOT NULL,
    "diaPago" INTEGER NOT NULL,
    "activado" BOOLEAN NOT NULL,

    CONSTRAINT "ClientePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" SERIAL NOT NULL,
    "clientePlanId" INTEGER NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deuda" (
    "id" SERIAL NOT NULL,
    "clientePlanId" INTEGER NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "solventada" BOOLEAN NOT NULL,

    CONSTRAINT "Deuda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rutina" (
    "id" SERIAL NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "rutina" BYTEA NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3) NOT NULL,
    "observacion" TEXT NOT NULL,

    CONSTRAINT "Rutina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entrenamiento" (
    "id" SERIAL NOT NULL,
    "rutinaId" INTEGER NOT NULL,
    "finalizado" BOOLEAN NOT NULL,

    CONSTRAINT "Entrenamiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Semana" (
    "id" SERIAL NOT NULL,
    "numero" INTEGER NOT NULL,
    "musculoId" INTEGER NOT NULL,
    "entrenamientoId" INTEGER NOT NULL,

    CONSTRAINT "Semana_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Musculo" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Musculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SemanaEjercicio" (
    "id" SERIAL NOT NULL,
    "ejercicioId" INTEGER NOT NULL,
    "semanaId" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "SemanaEjercicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ejercicio" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "foto" BYTEA NOT NULL,

    CONSTRAINT "Ejercicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerieRep" (
    "id" SERIAL NOT NULL,
    "semanaEjercicioId" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,
    "peso" DOUBLE PRECISION NOT NULL,
    "repeticiones" INTEGER NOT NULL,
    "unidadMedida" TEXT NOT NULL,

    CONSTRAINT "SerieRep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerieTiempo" (
    "id" SERIAL NOT NULL,
    "semanaEjercicioId" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,
    "peso" DOUBLE PRECISION NOT NULL,
    "tiempo" INTEGER NOT NULL,
    "unidadMedida" TEXT NOT NULL,

    CONSTRAINT "SerieTiempo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_cedula_key" ON "Usuario"("cedula");

-- CreateIndex
CREATE UNIQUE INDEX "Entrenamiento_rutinaId_key" ON "Entrenamiento"("rutinaId");

-- AddForeignKey
ALTER TABLE "Administrador" ADD CONSTRAINT "Administrador_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrenador" ADD CONSTRAINT "Entrenador_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recepcionista" ADD CONSTRAINT "Recepcionista_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClienteMedida" ADD CONSTRAINT "ClienteMedida_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClienteMedida" ADD CONSTRAINT "ClienteMedida_medidaId_fkey" FOREIGN KEY ("medidaId") REFERENCES "Medida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Novedad" ADD CONSTRAINT "Novedad_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientePlan" ADD CONSTRAINT "ClientePlan_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientePlan" ADD CONSTRAINT "ClientePlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_clientePlanId_fkey" FOREIGN KEY ("clientePlanId") REFERENCES "ClientePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deuda" ADD CONSTRAINT "Deuda_clientePlanId_fkey" FOREIGN KEY ("clientePlanId") REFERENCES "ClientePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rutina" ADD CONSTRAINT "Rutina_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrenamiento" ADD CONSTRAINT "Entrenamiento_rutinaId_fkey" FOREIGN KEY ("rutinaId") REFERENCES "Rutina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Semana" ADD CONSTRAINT "Semana_musculoId_fkey" FOREIGN KEY ("musculoId") REFERENCES "Musculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Semana" ADD CONSTRAINT "Semana_entrenamientoId_fkey" FOREIGN KEY ("entrenamientoId") REFERENCES "Entrenamiento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SemanaEjercicio" ADD CONSTRAINT "SemanaEjercicio_semanaId_fkey" FOREIGN KEY ("semanaId") REFERENCES "Semana"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SemanaEjercicio" ADD CONSTRAINT "SemanaEjercicio_ejercicioId_fkey" FOREIGN KEY ("ejercicioId") REFERENCES "Ejercicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerieRep" ADD CONSTRAINT "SerieRep_semanaEjercicioId_fkey" FOREIGN KEY ("semanaEjercicioId") REFERENCES "SemanaEjercicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerieTiempo" ADD CONSTRAINT "SerieTiempo_semanaEjercicioId_fkey" FOREIGN KEY ("semanaEjercicioId") REFERENCES "SemanaEjercicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
