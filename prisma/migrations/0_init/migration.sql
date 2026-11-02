-- Canonical baseline generated with Prisma 6.10.1 from prisma/schema.prisma.
-- The previous 26 migrations are preserved under prisma/migrations_legacy.

-- CreateEnum
CREATE TYPE "EstadoFactura" AS ENUM ('PENDIENTE', 'PAGADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "TipoNegocio" AS ENUM ('GYM', 'STORE', 'MIXTO');

-- CreateEnum
CREATE TYPE "TenantEstado" AS ENUM ('ACTIVO', 'SUSPENDIDO', 'ELIMINADO');

-- CreateEnum
CREATE TYPE "TenantRole" AS ENUM ('OWNER', 'ADMIN', 'EMPLEADO', 'ENTRENADOR', 'RECEPCIONISTA', 'CAJERO');

-- CreateEnum
CREATE TYPE "UserTenantEstado" AS ENUM ('ACTIVO', 'PENDIENTE', 'INACTIVO');

-- CreateEnum
CREATE TYPE "ModuleKey" AS ENUM ('GYM', 'STORE');

-- CreateEnum
CREATE TYPE "SaasPlan" AS ENUM ('FREE', 'PLUS');

-- CreateEnum
CREATE TYPE "EstadoClientePlan" AS ENUM ('ACTIVO', 'CAMBIADO', 'FINALIZADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "UnidadDuracion" AS ENUM ('MESES', 'DIAS');

-- CreateEnum
CREATE TYPE "OrigenAsistencia" AS ENUM ('MANUAL', 'BIOMETRIA');

-- CreateEnum
CREATE TYPE "EstadoDevolucion" AS ENUM ('PENDIENTE', 'COMPLETADO', 'NO_APLICA', 'PARCIAL');

-- CustomSequence
-- Preserves the physical sequence name and bigint range established by the
-- historical cliente_multigym migration. Prisma's SERIAL output cannot encode it.
CREATE SEQUENCE cliente_id_seq AS BIGINT
    INCREMENT BY 1
    MINVALUE 1
    NO MAXVALUE
    START WITH 1
    CACHE 1;

-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "email" TEXT,
    "userName" TEXT,
    "password" TEXT NOT NULL,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "cedula" TEXT NOT NULL,
    "fechaNacimiento" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "tipoNegocio" "TipoNegocio" NOT NULL,
    "estado" "TenantEstado" NOT NULL DEFAULT 'ACTIVO',
    "saasPlan" "SaasPlan" NOT NULL DEFAULT 'FREE',
    "email" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "ciudad" TEXT,
    "pais" TEXT,
    "logoUrl" TEXT,
    "descripcion" TEXT,
    "bridgeKeyHash" TEXT,
    "latitud" DOUBLE PRECISION,
    "longitud" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTenant" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "role" "TenantRole" NOT NULL,
    "estado" "UserTenantEstado" NOT NULL DEFAULT 'ACTIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantModule" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "module" "ModuleKey" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantModule_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "StaffProfile" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "tenantRole" "TenantRole" NOT NULL,
    "horario" TEXT NOT NULL,
    "sueldo" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" INTEGER NOT NULL DEFAULT nextval('cliente_id_seq'::regclass),
    "usuarioId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "horario" TEXT NOT NULL,
    "sexo" TEXT NOT NULL,
    "observaciones" TEXT NOT NULL,
    "objetivos" TEXT NOT NULL,
    "tiempoEntrenar" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "zkbioPersonId" TEXT,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

ALTER SEQUENCE cliente_id_seq OWNED BY "Cliente"."id";

-- CreateTable
CREATE TABLE "Medida" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Medida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClienteMedida" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "medidaId" INTEGER NOT NULL,
    "medida" INTEGER NOT NULL,

    CONSTRAINT "ClienteMedida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Novedad" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "novedad" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "solventada" BOOLEAN NOT NULL,

    CONSTRAINT "Novedad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio" DOUBLE PRECISION NOT NULL,
    "stock" INTEGER NOT NULL,
    "estado" BOOLEAN NOT NULL,

    CONSTRAINT "Producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Compra" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
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
    "tenantId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio" DOUBLE PRECISION NOT NULL,
    "duracion" INTEGER NOT NULL,
    "unidadDuracion" "UnidadDuracion" NOT NULL DEFAULT 'MESES',
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientePlan" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "planId" INTEGER NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3) NOT NULL,
    "diaPago" INTEGER NOT NULL,
    "activado" BOOLEAN NOT NULL,
    "estado" "EstadoClientePlan" NOT NULL DEFAULT 'ACTIVO',

    CONSTRAINT "ClientePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "clientePlanId" INTEGER NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deuda" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "clientePlanId" INTEGER NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "solventada" BOOLEAN NOT NULL,

    CONSTRAINT "Deuda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rutina" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
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
    "tenantId" INTEGER NOT NULL,
    "rutinaId" INTEGER NOT NULL,
    "finalizado" BOOLEAN NOT NULL,

    CONSTRAINT "Entrenamiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Semana" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "entrenamientoId" INTEGER NOT NULL,

    CONSTRAINT "Semana_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MusculoSemana" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "semanaId" INTEGER NOT NULL,
    "musculoId" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "MusculoSemana_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Musculo" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Musculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EjercicioMusculo" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "musculoSemanaId" INTEGER NOT NULL,
    "ejercicioId" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "EjercicioMusculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ejercicio" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "foto" BYTEA,

    CONSTRAINT "Ejercicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerieRep" (
    "id" SERIAL NOT NULL,
    "ejercicioMusculoId" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,
    "peso" DOUBLE PRECISION NOT NULL,
    "repeticiones" INTEGER NOT NULL,
    "unidadMedida" TEXT NOT NULL,

    CONSTRAINT "SerieRep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerieTiempo" (
    "id" SERIAL NOT NULL,
    "ejercicioMusculoId" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,
    "peso" DOUBLE PRECISION NOT NULL,
    "tiempo" INTEGER NOT NULL,
    "unidadMedida" TEXT NOT NULL,

    CONSTRAINT "SerieTiempo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gasto" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" INTEGER NOT NULL,

    CONSTRAINT "Gasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngresoRapido" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "concepto" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngresoRapido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asistencia" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "horaEntrada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origen" "OrigenAsistencia" NOT NULL DEFAULT 'MANUAL',
    "eventoBiometricoId" TEXT,
    "dispositivoSn" TEXT,
    "biometricoPersonId" TEXT,

    CONSTRAINT "Asistencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Factura" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "clientePlanId" INTEGER NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "iva" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "totalPagado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "creditoAplicado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "saldo" DOUBLE PRECISION NOT NULL,
    "estado" "EstadoFactura" NOT NULL,
    "fechaEmision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Factura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CambioPlan" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "clientePlanAnteriorId" INTEGER NOT NULL,
    "clientePlanNuevoId" INTEGER NOT NULL,
    "montoPagadoTransferido" DOUBLE PRECISION NOT NULL,
    "montoDevuelto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "devolucionPendiente" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "devolucionDevueltaAcumulada" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estadoDevolucion" "EstadoDevolucion" NOT NULL DEFAULT 'PENDIENTE',
    "motivo" TEXT,

    CONSTRAINT "CambioPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevolucionMovimiento" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "cambioPlanId" INTEGER NOT NULL,
    "facturaId" INTEGER NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motivo" TEXT,
    "usuarioId" INTEGER,

    CONSTRAINT "DevolucionMovimiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_userName_key" ON "Usuario"("userName");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_cedula_key" ON "Usuario"("cedula");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_tipoNegocio_idx" ON "Tenant"("tipoNegocio");

-- CreateIndex
CREATE INDEX "Tenant_estado_idx" ON "Tenant"("estado");

-- CreateIndex
CREATE INDEX "UserTenant_tenantId_role_idx" ON "UserTenant"("tenantId", "role");

-- CreateIndex
CREATE INDEX "UserTenant_usuarioId_idx" ON "UserTenant"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "UserTenant_usuarioId_tenantId_key" ON "UserTenant"("usuarioId", "tenantId");

-- CreateIndex
CREATE INDEX "TenantModule_tenantId_idx" ON "TenantModule"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantModule_tenantId_module_key" ON "TenantModule"("tenantId", "module");

-- CreateIndex
CREATE INDEX "StaffProfile_tenantId_idx" ON "StaffProfile"("tenantId");

-- CreateIndex
CREATE INDEX "StaffProfile_usuarioId_idx" ON "StaffProfile"("usuarioId");

-- CreateIndex
CREATE INDEX "StaffProfile_tenantId_tenantRole_idx" ON "StaffProfile"("tenantId", "tenantRole");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_usuarioId_tenantId_tenantRole_key" ON "StaffProfile"("usuarioId", "tenantId", "tenantRole");

-- CreateIndex
CREATE INDEX "Cliente_usuarioId_idx" ON "Cliente"("usuarioId");

-- CreateIndex
CREATE INDEX "Cliente_tenantId_idx" ON "Cliente"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_usuarioId_tenantId_key" ON "Cliente"("usuarioId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_tenantId_zkbioPersonId_key" ON "Cliente"("tenantId", "zkbioPersonId");

-- CreateIndex
CREATE INDEX "ClienteMedida_tenantId_idx" ON "ClienteMedida"("tenantId");

-- CreateIndex
CREATE INDEX "Novedad_tenantId_idx" ON "Novedad"("tenantId");

-- CreateIndex
CREATE INDEX "Producto_tenantId_idx" ON "Producto"("tenantId");

-- CreateIndex
CREATE INDEX "Compra_tenantId_idx" ON "Compra"("tenantId");

-- CreateIndex
CREATE INDEX "Plan_tenantId_idx" ON "Plan"("tenantId");

-- CreateIndex
CREATE INDEX "ClientePlan_tenantId_idx" ON "ClientePlan"("tenantId");

-- CreateIndex
CREATE INDEX "Pago_tenantId_idx" ON "Pago"("tenantId");

-- CreateIndex
CREATE INDEX "Pago_clientePlanId_idx" ON "Pago"("clientePlanId");

-- CreateIndex
CREATE INDEX "Pago_fecha_idx" ON "Pago"("fecha");

-- CreateIndex
CREATE INDEX "Deuda_tenantId_idx" ON "Deuda"("tenantId");

-- CreateIndex
CREATE INDEX "Rutina_tenantId_idx" ON "Rutina"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Entrenamiento_rutinaId_key" ON "Entrenamiento"("rutinaId");

-- CreateIndex
CREATE INDEX "Entrenamiento_tenantId_idx" ON "Entrenamiento"("tenantId");

-- CreateIndex
CREATE INDEX "Semana_tenantId_idx" ON "Semana"("tenantId");

-- CreateIndex
CREATE INDEX "MusculoSemana_tenantId_idx" ON "MusculoSemana"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Musculo_nombre_key" ON "Musculo"("nombre");

-- CreateIndex
CREATE INDEX "EjercicioMusculo_tenantId_idx" ON "EjercicioMusculo"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Ejercicio_nombre_key" ON "Ejercicio"("nombre");

-- CreateIndex
CREATE INDEX "Gasto_tenantId_idx" ON "Gasto"("tenantId");

-- CreateIndex
CREATE INDEX "IngresoRapido_tenantId_idx" ON "IngresoRapido"("tenantId");

-- CreateIndex
CREATE INDEX "IngresoRapido_fecha_idx" ON "IngresoRapido"("fecha");

-- CreateIndex
CREATE INDEX "Asistencia_tenantId_idx" ON "Asistencia"("tenantId");

-- CreateIndex
CREATE INDEX "Asistencia_clienteId_fecha_idx" ON "Asistencia"("clienteId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "Asistencia_clienteId_fecha_key" ON "Asistencia"("clienteId", "fecha" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Asistencia_tenantId_eventoBiometricoId_key" ON "Asistencia"("tenantId", "eventoBiometricoId");

-- CreateIndex
CREATE UNIQUE INDEX "Factura_numero_key" ON "Factura"("numero");

-- CreateIndex
CREATE INDEX "Factura_tenantId_idx" ON "Factura"("tenantId");

-- CreateIndex
CREATE INDEX "CambioPlan_tenantId_idx" ON "CambioPlan"("tenantId");

-- CreateIndex
CREATE INDEX "DevolucionMovimiento_tenantId_idx" ON "DevolucionMovimiento"("tenantId");

-- CreateIndex
CREATE INDEX "DevolucionMovimiento_cambioPlanId_idx" ON "DevolucionMovimiento"("cambioPlanId");

-- CreateIndex
CREATE INDEX "DevolucionMovimiento_facturaId_idx" ON "DevolucionMovimiento"("facturaId");

-- CreateIndex
CREATE INDEX "DevolucionMovimiento_fecha_idx" ON "DevolucionMovimiento"("fecha");

-- AddForeignKey
ALTER TABLE "UserTenant" ADD CONSTRAINT "UserTenant_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTenant" ADD CONSTRAINT "UserTenant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantModule" ADD CONSTRAINT "TenantModule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Administrador" ADD CONSTRAINT "Administrador_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrenador" ADD CONSTRAINT "Entrenador_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recepcionista" ADD CONSTRAINT "Recepcionista_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClienteMedida" ADD CONSTRAINT "ClienteMedida_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClienteMedida" ADD CONSTRAINT "ClienteMedida_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClienteMedida" ADD CONSTRAINT "ClienteMedida_medidaId_fkey" FOREIGN KEY ("medidaId") REFERENCES "Medida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Novedad" ADD CONSTRAINT "Novedad_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Novedad" ADD CONSTRAINT "Novedad_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientePlan" ADD CONSTRAINT "ClientePlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientePlan" ADD CONSTRAINT "ClientePlan_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientePlan" ADD CONSTRAINT "ClientePlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_clientePlanId_fkey" FOREIGN KEY ("clientePlanId") REFERENCES "ClientePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deuda" ADD CONSTRAINT "Deuda_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deuda" ADD CONSTRAINT "Deuda_clientePlanId_fkey" FOREIGN KEY ("clientePlanId") REFERENCES "ClientePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rutina" ADD CONSTRAINT "Rutina_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rutina" ADD CONSTRAINT "Rutina_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrenamiento" ADD CONSTRAINT "Entrenamiento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrenamiento" ADD CONSTRAINT "Entrenamiento_rutinaId_fkey" FOREIGN KEY ("rutinaId") REFERENCES "Rutina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Semana" ADD CONSTRAINT "Semana_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Semana" ADD CONSTRAINT "Semana_entrenamientoId_fkey" FOREIGN KEY ("entrenamientoId") REFERENCES "Entrenamiento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MusculoSemana" ADD CONSTRAINT "MusculoSemana_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MusculoSemana" ADD CONSTRAINT "MusculoSemana_semanaId_fkey" FOREIGN KEY ("semanaId") REFERENCES "Semana"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MusculoSemana" ADD CONSTRAINT "MusculoSemana_musculoId_fkey" FOREIGN KEY ("musculoId") REFERENCES "Musculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EjercicioMusculo" ADD CONSTRAINT "EjercicioMusculo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EjercicioMusculo" ADD CONSTRAINT "EjercicioMusculo_musculoSemanaId_fkey" FOREIGN KEY ("musculoSemanaId") REFERENCES "MusculoSemana"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EjercicioMusculo" ADD CONSTRAINT "EjercicioMusculo_ejercicioId_fkey" FOREIGN KEY ("ejercicioId") REFERENCES "Ejercicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerieRep" ADD CONSTRAINT "SerieRep_ejercicioMusculoId_fkey" FOREIGN KEY ("ejercicioMusculoId") REFERENCES "EjercicioMusculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerieTiempo" ADD CONSTRAINT "SerieTiempo_ejercicioMusculoId_fkey" FOREIGN KEY ("ejercicioMusculoId") REFERENCES "EjercicioMusculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngresoRapido" ADD CONSTRAINT "IngresoRapido_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asistencia" ADD CONSTRAINT "Asistencia_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asistencia" ADD CONSTRAINT "Asistencia_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_clientePlanId_fkey" FOREIGN KEY ("clientePlanId") REFERENCES "ClientePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CambioPlan" ADD CONSTRAINT "CambioPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CambioPlan" ADD CONSTRAINT "CambioPlan_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CambioPlan" ADD CONSTRAINT "CambioPlan_clientePlanAnteriorId_fkey" FOREIGN KEY ("clientePlanAnteriorId") REFERENCES "ClientePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CambioPlan" ADD CONSTRAINT "CambioPlan_clientePlanNuevoId_fkey" FOREIGN KEY ("clientePlanNuevoId") REFERENCES "ClientePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevolucionMovimiento" ADD CONSTRAINT "DevolucionMovimiento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevolucionMovimiento" ADD CONSTRAINT "DevolucionMovimiento_cambioPlanId_fkey" FOREIGN KEY ("cambioPlanId") REFERENCES "CambioPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevolucionMovimiento" ADD CONSTRAINT "DevolucionMovimiento_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevolucionMovimiento" ADD CONSTRAINT "DevolucionMovimiento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
