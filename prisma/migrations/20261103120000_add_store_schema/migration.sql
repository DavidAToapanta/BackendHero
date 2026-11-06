-- Amplia el baseline existente sin eliminar clientes ni operaciones GYM.
-- Los datos se conservan; una conversion que requiera redondeo aborta.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM "Producto" WHERE "precio"::text IN ('NaN','Infinity','-Infinity') OR "precio" < 0 OR "precio" >= 10000000000000000 OR "stock" < 0) THEN
  RAISE EXCEPTION 'Producto contiene precio/stock incompatible; revisar datos sin borrarlos';
 END IF;
 IF EXISTS (SELECT 1 FROM "Producto" WHERE "precio" <> "precio"::numeric(18,2)::double precision) THEN
  RAISE EXCEPTION 'La conversion de Producto.precio requiere redondeo; se detiene para revision';
 END IF;
END $$;
-- CreateEnum
CREATE TYPE "VersionAutorizacion" AS ENUM ('LEGACY', 'PERMISOS');

-- CreateEnum
CREATE TYPE "ModoInventario" AS ENUM ('LEGACY', 'LOTES');

-- CreateEnum
CREATE TYPE "UnidadVenta" AS ENUM ('UNIDAD');

-- CreateEnum
CREATE TYPE "MetodoVerificacionCliente" AS ENUM ('PERSONAL_AUTORIZADO', 'CUENTA_VERIFICADA');

-- CreateEnum
CREATE TYPE "EstadoCarrito" AS ENUM ('ACTIVO', 'CONFIRMADO', 'ABANDONADO');

-- CreateEnum
CREATE TYPE "EstadoPedido" AS ENUM ('CONFIRMADO', 'EN_PREPARACION', 'ENTREGADO', 'CANCELADO', 'EXPIRADO');

-- CreateEnum
CREATE TYPE "EstadoReservaInventario" AS ENUM ('ACTIVA', 'CONSUMIDA', 'LIBERADA', 'EXPIRADA');

-- CreateEnum
CREATE TYPE "OrigenVenta" AS ENUM ('CAJA', 'PORTAL');

-- CreateEnum
CREATE TYPE "EstadoVenta" AS ENUM ('COMPLETADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "MetodoCobro" AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoCobro" AS ENUM ('CONFIRMADO', 'REVERSADO');

-- CreateEnum
CREATE TYPE "EstadoCuentaPorCobrar" AS ENUM ('ABIERTA', 'PAGADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoAjusteCuenta" AS ENUM ('DEVOLUCION', 'ANULACION', 'CORRECCION_PAGO_INICIAL');

-- CreateEnum
CREATE TYPE "EstadoReembolso" AS ENUM ('PENDIENTE', 'CONFIRMADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "EstadoDevolucionVenta" AS ENUM ('PENDIENTE', 'APROBADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "DestinoDevolucionVenta" AS ENUM ('REINTEGRO_APTO', 'BAJA_NO_APTO');

-- CreateEnum
CREATE TYPE "EstadoTurnoCaja" AS ENUM ('ABIERTO', 'CERRADO');

-- CreateEnum
CREATE TYPE "TipoMovimientoCaja" AS ENUM ('ENTRADA', 'SALIDA');

-- CreateEnum
CREATE TYPE "EstadoComprobanteVenta" AS ENUM ('EMITIDO', 'ANULADO');

-- CreateEnum
CREATE TYPE "EstadoEventoSalida" AS ENUM ('PENDIENTE', 'PROCESANDO', 'ENVIADO', 'FALLIDO');

-- CreateEnum
CREATE TYPE "EstadoSolicitudIdempotente" AS ENUM ('EN_PROCESO', 'COMPLETADA');

-- CreateEnum
CREATE TYPE "TipoActorOperacion" AS ENUM ('USUARIO', 'SISTEMA');

-- CreateEnum
CREATE TYPE "TipoNotificacionCliente" AS ENUM ('ESTADO_PEDIDO', 'COMPROBANTE_DISPONIBLE', 'RECORDATORIO_DEUDA');

-- CreateEnum
CREATE TYPE "TipoMovimientoInventario" AS ENUM ('APERTURA', 'ENTRADA', 'VENTA', 'RESERVA', 'LIBERACION_RESERVA', 'CONSUMO_RESERVA', 'BAJA', 'AJUSTE', 'DEVOLUCION', 'REVERSION');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "autorizacionVersion" "VersionAutorizacion" NOT NULL DEFAULT 'LEGACY',
ADD COLUMN     "moneda" CHAR(3) NOT NULL DEFAULT 'USD',
ADD COLUMN     "zonaHoraria" TEXT NOT NULL DEFAULT 'America/Guayaquil';

-- AlterTable
ALTER TABLE "UserTenant" ADD COLUMN     "versionAutorizacion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Producto" ADD COLUMN     "categoriaId" INTEGER,
ADD COLUMN     "codigoBarras" TEXT,
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "descripcion" TEXT,
ADD COLUMN     "marca" TEXT,
ADD COLUMN     "modoInventario" "ModoInventario" NOT NULL DEFAULT 'LEGACY',
ADD COLUMN     "presentacion" TEXT,
ADD COLUMN     "sku" TEXT,
ADD COLUMN     "stockReservado" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unidadVenta" "UnidadVenta" NOT NULL DEFAULT 'UNIDAD',
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3),
ALTER COLUMN "precio" SET DATA TYPE DECIMAL(18,2);

-- La fecha de apertura se registra como fecha de migracion, no como historia inventada.
UPDATE "Producto" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "Producto" ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "ClienteComercial" (
    "id" SERIAL NOT NULL,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT,
    "razonSocial" TEXT,
    "tipoIdentificacion" TEXT,
    "identificacion" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "clienteGymId" INTEGER,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ClienteComercial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VinculacionClienteUsuario" (
    "id" SERIAL NOT NULL,
    "metodo" "MetodoVerificacionCliente" NOT NULL,
    "verificadaAt" TIMESTAMPTZ(3) NOT NULL,
    "revocadaAt" TIMESTAMPTZ(3),
    "motivoRevocacion" TEXT,
    "clienteComercialId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "verificadorId" INTEGER,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "VinculacionClienteUsuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permiso" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "modulo" "ModuleKey" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "delegable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Permiso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolNegocio" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "protegido" BOOLEAN NOT NULL DEFAULT false,
    "equivalenciaLegacy" "TenantRole",
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RolNegocio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolPermiso" (
    "id" SERIAL NOT NULL,
    "rolId" INTEGER NOT NULL,
    "permisoId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RolPermiso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsignacionRol" (
    "id" SERIAL NOT NULL,
    "membresiaId" INTEGER NOT NULL,
    "rolId" INTEGER NOT NULL,
    "asignadorId" INTEGER,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AsignacionRol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoriaProducto" (
    "id" SERIAL NOT NULL,
    "modulo" "ModuleKey" NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombreNormalizado" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CategoriaProducto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductoImagen" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "claveArchivo" TEXT,
    "textoAlternativo" TEXT,
    "orden" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProductoImagen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntradaInventario" (
    "id" SERIAL NOT NULL,
    "fecha" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referenciaExterna" TEXT,
    "motivo" TEXT NOT NULL,
    "claveIdempotencia" TEXT NOT NULL,
    "responsableId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EntradaInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoteInventario" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "fechaEntrada" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vencimiento" TIMESTAMPTZ(3),
    "costoUnitario" DECIMAL(18,4) NOT NULL,
    "cantidadFisica" INTEGER NOT NULL DEFAULT 0,
    "esApertura" BOOLEAN NOT NULL DEFAULT false,
    "productoId" INTEGER NOT NULL,
    "entradaId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LoteInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoInventario" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoMovimientoInventario" NOT NULL,
    "fecha" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deltaFisico" INTEGER NOT NULL,
    "deltaReservado" INTEGER NOT NULL,
    "costoUnitario" DECIMAL(18,4),
    "costoTotal" DECIMAL(18,4),
    "motivo" TEXT,
    "claveIdempotencia" TEXT NOT NULL,
    "correlacionId" UUID NOT NULL,
    "productoId" INTEGER NOT NULL,
    "loteId" INTEGER,
    "entradaId" INTEGER,
    "reservaId" INTEGER,
    "asignacionVentaId" INTEGER,
    "detalleDevolucionId" INTEGER,
    "compraLegacyId" INTEGER,
    "movimientoOriginalId" INTEGER,
    "responsableId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MovimientoInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Carrito" (
    "id" SERIAL NOT NULL,
    "estado" "EstadoCarrito" NOT NULL DEFAULT 'ACTIVO',
    "clienteComercialId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Carrito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetalleCarrito" (
    "id" SERIAL NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "carritoId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DetalleCarrito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pedido" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "estado" "EstadoPedido" NOT NULL DEFAULT 'CONFIRMADO',
    "confirmadoAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reservaHasta" TIMESTAMPTZ(3) NOT NULL,
    "entregadoAt" TIMESTAMPTZ(3),
    "canceladoAt" TIMESTAMPTZ(3),
    "motivoCancelacion" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "descuento" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "impuesto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "claveIdempotencia" TEXT NOT NULL,
    "clienteComercialId" INTEGER NOT NULL,
    "carritoId" INTEGER,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetallePedido" (
    "id" SERIAL NOT NULL,
    "nombreProducto" TEXT NOT NULL,
    "presentacionProducto" TEXT,
    "skuProducto" TEXT,
    "codigoBarrasProducto" TEXT,
    "categoriaNombre" TEXT,
    "cantidad" INTEGER NOT NULL,
    "precioUnitario" DECIMAL(18,2) NOT NULL,
    "descuento" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tasaImpuesto" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "impuesto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "pedidoId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "categoriaId" INTEGER,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DetallePedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservaInventario" (
    "id" SERIAL NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "estado" "EstadoReservaInventario" NOT NULL DEFAULT 'ACTIVA',
    "reservaHasta" TIMESTAMPTZ(3) NOT NULL,
    "consumidaAt" TIMESTAMPTZ(3),
    "liberadaAt" TIMESTAMPTZ(3),
    "motivo" TEXT,
    "productoId" INTEGER NOT NULL,
    "pedidoId" INTEGER NOT NULL,
    "detallePedidoId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ReservaInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistorialEstadoPedido" (
    "id" SERIAL NOT NULL,
    "estadoAnterior" "EstadoPedido",
    "estadoNuevo" "EstadoPedido" NOT NULL,
    "actor" "TipoActorOperacion" NOT NULL,
    "motivo" TEXT,
    "pedidoId" INTEGER NOT NULL,
    "responsableId" INTEGER,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HistorialEstadoPedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venta" (
    "id" SERIAL NOT NULL,
    "origen" "OrigenVenta" NOT NULL,
    "estado" "EstadoVenta" NOT NULL DEFAULT 'COMPLETADA',
    "fecha" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "descuento" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "impuesto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "anuladaAt" TIMESTAMPTZ(3),
    "motivoAnulacion" TEXT,
    "claveIdempotencia" TEXT NOT NULL,
    "clienteComercialId" INTEGER,
    "pedidoId" INTEGER,
    "responsableId" INTEGER NOT NULL,
    "anuladaPorId" INTEGER,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetalleVenta" (
    "id" SERIAL NOT NULL,
    "nombreProducto" TEXT NOT NULL,
    "presentacionProducto" TEXT,
    "skuProducto" TEXT,
    "codigoBarrasProducto" TEXT,
    "categoriaNombre" TEXT,
    "cantidad" INTEGER NOT NULL,
    "precioUnitario" DECIMAL(18,2) NOT NULL,
    "descuento" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tasaImpuesto" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "impuesto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "ventaId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "categoriaId" INTEGER,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DetalleVenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsignacionLoteVenta" (
    "id" SERIAL NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "costoUnitario" DECIMAL(18,4) NOT NULL,
    "costoTotal" DECIMAL(18,4) NOT NULL,
    "detalleVentaId" INTEGER NOT NULL,
    "loteId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "ventaId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AsignacionLoteVenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cobro" (
    "id" SERIAL NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "metodo" "MetodoCobro" NOT NULL,
    "estado" "EstadoCobro" NOT NULL DEFAULT 'CONFIRMADO',
    "fecha" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referencia" TEXT,
    "reversadoAt" TIMESTAMPTZ(3),
    "motivoReversion" TEXT,
    "claveIdempotencia" TEXT NOT NULL,
    "clienteComercialId" INTEGER,
    "responsableId" INTEGER NOT NULL,
    "turnoId" INTEGER,
    "reversadoPorId" INTEGER,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Cobro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AplicacionCobro" (
    "id" SERIAL NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "claveIdempotencia" TEXT NOT NULL,
    "clienteComercialId" INTEGER,
    "cobroId" INTEGER NOT NULL,
    "ventaId" INTEGER NOT NULL,
    "cuentaId" INTEGER,
    "responsableId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AplicacionCobro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReversionAplicacionCobro" (
    "id" SERIAL NOT NULL,
    "motivo" TEXT NOT NULL,
    "claveIdempotencia" TEXT NOT NULL,
    "aplicacionId" INTEGER NOT NULL,
    "responsableId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "ventaId" INTEGER NOT NULL,

    CONSTRAINT "ReversionAplicacionCobro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CuentaPorCobrar" (
    "id" SERIAL NOT NULL,
    "importeFinanciadoInicial" DECIMAL(18,2) NOT NULL,
    "importeExigible" DECIMAL(18,2) NOT NULL,
    "saldo" DECIMAL(18,2) NOT NULL,
    "vencimiento" TIMESTAMPTZ(3) NOT NULL,
    "estado" "EstadoCuentaPorCobrar" NOT NULL DEFAULT 'ABIERTA',
    "clienteComercialId" INTEGER NOT NULL,
    "ventaId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CuentaPorCobrar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AjusteCuentaPorCobrar" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoAjusteCuenta" NOT NULL,
    "deltaImporte" DECIMAL(18,2) NOT NULL,
    "motivo" TEXT NOT NULL,
    "claveIdempotencia" TEXT NOT NULL,
    "cuentaId" INTEGER NOT NULL,
    "devolucionId" INTEGER,
    "reversionId" INTEGER,
    "responsableId" INTEGER NOT NULL,
    "ventaId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AjusteCuentaPorCobrar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reembolso" (
    "id" SERIAL NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "metodo" "MetodoCobro" NOT NULL,
    "estado" "EstadoReembolso" NOT NULL DEFAULT 'PENDIENTE',
    "fecha" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmadoAt" TIMESTAMPTZ(3),
    "referencia" TEXT,
    "motivo" TEXT NOT NULL,
    "claveIdempotencia" TEXT NOT NULL,
    "cobroId" INTEGER NOT NULL,
    "ventaId" INTEGER NOT NULL,
    "aplicacionOriginalId" INTEGER,
    "devolucionId" INTEGER,
    "responsableId" INTEGER NOT NULL,
    "turnoId" INTEGER,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Reembolso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevolucionVenta" (
    "id" SERIAL NOT NULL,
    "estado" "EstadoDevolucionVenta" NOT NULL DEFAULT 'PENDIENTE',
    "fecha" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aprobadaAt" TIMESTAMPTZ(3),
    "motivo" TEXT NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "descuento" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "impuesto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "claveIdempotencia" TEXT NOT NULL,
    "ventaId" INTEGER NOT NULL,
    "responsableId" INTEGER NOT NULL,
    "aprobadaPorId" INTEGER,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DevolucionVenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetalleDevolucionVenta" (
    "id" SERIAL NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "destino" "DestinoDevolucionVenta" NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "descuento" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "impuesto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "costoUnitario" DECIMAL(18,4) NOT NULL,
    "costoTotal" DECIMAL(18,4) NOT NULL,
    "devolucionId" INTEGER NOT NULL,
    "asignacionVentaId" INTEGER NOT NULL,
    "ventaId" INTEGER NOT NULL,
    "detalleVentaId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "loteId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DetalleDevolucionVenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Caja" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TurnoCaja" (
    "id" SERIAL NOT NULL,
    "estado" "EstadoTurnoCaja" NOT NULL DEFAULT 'ABIERTO',
    "aperturaAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fondoInicial" DECIMAL(18,2) NOT NULL,
    "cierreAt" TIMESTAMPTZ(3),
    "efectivoEsperado" DECIMAL(18,2),
    "efectivoContado" DECIMAL(18,2),
    "diferencia" DECIMAL(18,2),
    "motivoCierre" TEXT,
    "cajaId" INTEGER NOT NULL,
    "cajeroId" INTEGER NOT NULL,
    "cerradoPorId" INTEGER,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TurnoCaja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoCaja" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoMovimientoCaja" NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "fecha" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motivo" TEXT NOT NULL,
    "claveIdempotencia" TEXT NOT NULL,
    "turnoId" INTEGER NOT NULL,
    "responsableId" INTEGER NOT NULL,
    "cobroId" INTEGER,
    "reembolsoId" INTEGER,
    "gastoId" INTEGER,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MovimientoCaja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GastoComercial" (
    "id" SERIAL NOT NULL,
    "concepto" TEXT NOT NULL,
    "categoria" TEXT,
    "monto" DECIMAL(18,2) NOT NULL,
    "metodo" "MetodoCobro" NOT NULL,
    "fecha" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referencia" TEXT,
    "claveIdempotencia" TEXT NOT NULL,
    "responsableId" INTEGER NOT NULL,
    "turnoId" INTEGER,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GastoComercial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecuenciaComprobante" (
    "id" SERIAL NOT NULL,
    "ultimoConsecutivo" BIGINT NOT NULL DEFAULT 0,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SecuenciaComprobante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComprobanteVenta" (
    "id" SERIAL NOT NULL,
    "consecutivo" BIGINT NOT NULL,
    "numero" TEXT NOT NULL,
    "estado" "EstadoComprobanteVenta" NOT NULL DEFAULT 'EMITIDO',
    "fechaEmision" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receptorNombre" TEXT NOT NULL,
    "receptorTipoIdentificacion" TEXT,
    "receptorIdentificacion" TEXT,
    "receptorDireccion" TEXT,
    "receptorEmail" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "descuento" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "impuesto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "anuladaAt" TIMESTAMPTZ(3),
    "motivoAnulacion" TEXT,
    "ventaId" INTEGER NOT NULL,
    "emitidoPorId" INTEGER NOT NULL,
    "anuladoPorId" INTEGER,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "clienteComercialId" INTEGER,

    CONSTRAINT "ComprobanteVenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetalleComprobanteVenta" (
    "id" SERIAL NOT NULL,
    "nombreProducto" TEXT NOT NULL,
    "presentacionProducto" TEXT,
    "skuProducto" TEXT,
    "codigoBarrasProducto" TEXT,
    "categoriaNombre" TEXT,
    "cantidad" INTEGER NOT NULL,
    "precioUnitario" DECIMAL(18,2) NOT NULL,
    "descuento" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tasaImpuesto" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "impuesto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "comprobanteId" INTEGER NOT NULL,
    "detalleVentaId" INTEGER NOT NULL,
    "ventaId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DetalleComprobanteVenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoSalida" (
    "id" SERIAL NOT NULL,
    "eventoId" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "entidadTipo" TEXT NOT NULL,
    "entidadId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "estado" "EstadoEventoSalida" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "proximoIntentoAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseHasta" TIMESTAMPTZ(3),
    "leaseToken" UUID,
    "enviadoAt" TIMESTAMPTZ(3),
    "ultimoError" TEXT,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EventoSalida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificacionCliente" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoNotificacionCliente" NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "leidaAt" TIMESTAMPTZ(3),
    "clienteComercialId" INTEGER NOT NULL,
    "eventoId" INTEGER NOT NULL,
    "vinculacionId" INTEGER,
    "pedidoId" INTEGER,
    "comprobanteId" INTEGER,
    "cuentaId" INTEGER,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NotificacionCliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditoriaOperacion" (
    "id" SERIAL NOT NULL,
    "actor" "TipoActorOperacion" NOT NULL,
    "rolCodigo" TEXT,
    "rolNombre" TEXT,
    "accion" TEXT NOT NULL,
    "entidadTipo" TEXT NOT NULL,
    "entidadId" INTEGER NOT NULL,
    "motivo" TEXT,
    "datos" JSONB,
    "correlacionId" UUID NOT NULL,
    "usuarioId" INTEGER,
    "membresiaId" INTEGER,
    "productoId" INTEGER,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AuditoriaOperacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitudIdempotente" (
    "id" SERIAL NOT NULL,
    "alcance" TEXT NOT NULL,
    "operacion" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "hashSolicitud" TEXT NOT NULL,
    "estado" "EstadoSolicitudIdempotente" NOT NULL DEFAULT 'EN_PROCESO',
    "recursoTipo" TEXT,
    "recursoId" INTEGER,
    "usuarioId" INTEGER,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SolicitudIdempotente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClienteComercial_tenantId_activo_idx" ON "ClienteComercial"("tenantId", "activo");

-- CreateIndex
CREATE INDEX "ClienteComercial_tenantId_nombres_idx" ON "ClienteComercial"("tenantId", "nombres");

-- CreateIndex
CREATE UNIQUE INDEX "ClienteComercial_tenantId_clienteGymId_key" ON "ClienteComercial"("tenantId", "clienteGymId");

-- CreateIndex
CREATE UNIQUE INDEX "ClienteComercial_key_53dbb48832" ON "ClienteComercial"("tenantId", "tipoIdentificacion", "identificacion");

-- CreateIndex
CREATE UNIQUE INDEX "ClienteComercial_tenantId_id_key" ON "ClienteComercial"("tenantId", "id");

-- CreateIndex
CREATE INDEX "VinculacionClienteUsuario_idx_5c2e50946e" ON "VinculacionClienteUsuario"("tenantId", "clienteComercialId", "revocadaAt");

-- CreateIndex
CREATE INDEX "VinculacionClienteUsuario_usuarioId_revocadaAt_idx" ON "VinculacionClienteUsuario"("usuarioId", "revocadaAt");

-- CreateIndex
CREATE UNIQUE INDEX "VinculacionClienteUsuario_tenantId_id_clienteComercialId_key" ON "VinculacionClienteUsuario"("tenantId", "id", "clienteComercialId");

-- CreateIndex
CREATE UNIQUE INDEX "VinculacionClienteUsuario_tenantId_id_key" ON "VinculacionClienteUsuario"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Permiso_codigo_key" ON "Permiso"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "RolNegocio_tenantId_codigo_key" ON "RolNegocio"("tenantId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "RolNegocio_tenantId_nombre_key" ON "RolNegocio"("tenantId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "RolNegocio_tenantId_id_key" ON "RolNegocio"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RolPermiso_tenantId_rolId_permisoId_key" ON "RolPermiso"("tenantId", "rolId", "permisoId");

-- CreateIndex
CREATE UNIQUE INDEX "RolPermiso_tenantId_id_key" ON "RolPermiso"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AsignacionRol_tenantId_membresiaId_key" ON "AsignacionRol"("tenantId", "membresiaId");

-- CreateIndex
CREATE UNIQUE INDEX "AsignacionRol_tenantId_id_key" ON "AsignacionRol"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaProducto_tenantId_modulo_nombreNormalizado_key" ON "CategoriaProducto"("tenantId", "modulo", "nombreNormalizado");

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaProducto_tenantId_id_key" ON "CategoriaProducto"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductoImagen_tenantId_productoId_orden_key" ON "ProductoImagen"("tenantId", "productoId", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "ProductoImagen_tenantId_id_key" ON "ProductoImagen"("tenantId", "id");

-- CreateIndex
CREATE INDEX "EntradaInventario_tenantId_fecha_idx" ON "EntradaInventario"("tenantId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "EntradaInventario_tenantId_claveIdempotencia_key" ON "EntradaInventario"("tenantId", "claveIdempotencia");

-- CreateIndex
CREATE UNIQUE INDEX "EntradaInventario_tenantId_id_key" ON "EntradaInventario"("tenantId", "id");

-- CreateIndex
CREATE INDEX "LoteInventario_tenantId_productoId_vencimiento_idx" ON "LoteInventario"("tenantId", "productoId", "vencimiento");

-- CreateIndex
CREATE INDEX "LoteInventario_tenantId_entradaId_idx" ON "LoteInventario"("tenantId", "entradaId");

-- CreateIndex
CREATE INDEX "LoteInventario_tenantId_productoId_codigo_idx" ON "LoteInventario"("tenantId", "productoId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "LoteInventario_tenantId_id_productoId_key" ON "LoteInventario"("tenantId", "id", "productoId");

-- CreateIndex
CREATE UNIQUE INDEX "LoteInventario_tenantId_id_key" ON "LoteInventario"("tenantId", "id");

-- CreateIndex
CREATE INDEX "MovimientoInventario_tenantId_productoId_fecha_idx" ON "MovimientoInventario"("tenantId", "productoId", "fecha");

-- CreateIndex
CREATE INDEX "MovimientoInventario_tenantId_tipo_fecha_idx" ON "MovimientoInventario"("tenantId", "tipo", "fecha");

-- CreateIndex
CREATE INDEX "MovimientoInventario_tenantId_responsableId_fecha_idx" ON "MovimientoInventario"("tenantId", "responsableId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoInventario_tenantId_claveIdempotencia_key" ON "MovimientoInventario"("tenantId", "claveIdempotencia");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoInventario_tenantId_asignacionVentaId_tipo_key" ON "MovimientoInventario"("tenantId", "asignacionVentaId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoInventario_tenantId_detalleDevolucionId_tipo_key" ON "MovimientoInventario"("tenantId", "detalleDevolucionId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoInventario_tenantId_id_productoId_key" ON "MovimientoInventario"("tenantId", "id", "productoId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoInventario_tenantId_id_key" ON "MovimientoInventario"("tenantId", "id");

-- CreateIndex
CREATE INDEX "Carrito_tenantId_clienteComercialId_estado_idx" ON "Carrito"("tenantId", "clienteComercialId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "Carrito_tenantId_id_key" ON "Carrito"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Carrito_tenantId_id_clienteComercialId_key" ON "Carrito"("tenantId", "id", "clienteComercialId");

-- CreateIndex
CREATE UNIQUE INDEX "DetalleCarrito_tenantId_carritoId_productoId_key" ON "DetalleCarrito"("tenantId", "carritoId", "productoId");

-- CreateIndex
CREATE UNIQUE INDEX "DetalleCarrito_tenantId_id_key" ON "DetalleCarrito"("tenantId", "id");

-- CreateIndex
CREATE INDEX "Pedido_tenantId_estado_createdAt_idx" ON "Pedido"("tenantId", "estado", "createdAt");

-- CreateIndex
CREATE INDEX "Pedido_tenantId_clienteComercialId_createdAt_idx" ON "Pedido"("tenantId", "clienteComercialId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Pedido_tenantId_numero_key" ON "Pedido"("tenantId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "Pedido_tenantId_claveIdempotencia_key" ON "Pedido"("tenantId", "claveIdempotencia");

-- CreateIndex
CREATE UNIQUE INDEX "Pedido_tenantId_id_key" ON "Pedido"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Pedido_tenantId_id_clienteComercialId_key" ON "Pedido"("tenantId", "id", "clienteComercialId");

-- CreateIndex
CREATE UNIQUE INDEX "DetallePedido_tenantId_pedidoId_productoId_key" ON "DetallePedido"("tenantId", "pedidoId", "productoId");

-- CreateIndex
CREATE UNIQUE INDEX "DetallePedido_tenantId_id_pedidoId_productoId_key" ON "DetallePedido"("tenantId", "id", "pedidoId", "productoId");

-- CreateIndex
CREATE UNIQUE INDEX "DetallePedido_tenantId_id_key" ON "DetallePedido"("tenantId", "id");

-- CreateIndex
CREATE INDEX "ReservaInventario_tenantId_estado_reservaHasta_idx" ON "ReservaInventario"("tenantId", "estado", "reservaHasta");

-- CreateIndex
CREATE INDEX "ReservaInventario_tenantId_productoId_estado_idx" ON "ReservaInventario"("tenantId", "productoId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "ReservaInventario_tenantId_detallePedidoId_key" ON "ReservaInventario"("tenantId", "detallePedidoId");

-- CreateIndex
CREATE UNIQUE INDEX "ReservaInventario_tenantId_id_productoId_key" ON "ReservaInventario"("tenantId", "id", "productoId");

-- CreateIndex
CREATE UNIQUE INDEX "ReservaInventario_tenantId_id_key" ON "ReservaInventario"("tenantId", "id");

-- CreateIndex
CREATE INDEX "HistorialEstadoPedido_tenantId_pedidoId_createdAt_idx" ON "HistorialEstadoPedido"("tenantId", "pedidoId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HistorialEstadoPedido_tenantId_id_key" ON "HistorialEstadoPedido"("tenantId", "id");

-- CreateIndex
CREATE INDEX "Venta_tenantId_fecha_idx" ON "Venta"("tenantId", "fecha");

-- CreateIndex
CREATE INDEX "Venta_tenantId_estado_fecha_idx" ON "Venta"("tenantId", "estado", "fecha");

-- CreateIndex
CREATE INDEX "Venta_tenantId_responsableId_fecha_idx" ON "Venta"("tenantId", "responsableId", "fecha");

-- CreateIndex
CREATE INDEX "Venta_tenantId_clienteComercialId_fecha_idx" ON "Venta"("tenantId", "clienteComercialId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "Venta_tenantId_pedidoId_key" ON "Venta"("tenantId", "pedidoId");

-- CreateIndex
CREATE UNIQUE INDEX "Venta_tenantId_claveIdempotencia_key" ON "Venta"("tenantId", "claveIdempotencia");

-- CreateIndex
CREATE UNIQUE INDEX "Venta_tenantId_id_key" ON "Venta"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Venta_tenantId_id_clienteComercialId_key" ON "Venta"("tenantId", "id", "clienteComercialId");

-- CreateIndex
CREATE INDEX "DetalleVenta_tenantId_ventaId_idx" ON "DetalleVenta"("tenantId", "ventaId");

-- CreateIndex
CREATE INDEX "DetalleVenta_tenantId_productoId_createdAt_idx" ON "DetalleVenta"("tenantId", "productoId", "createdAt");

-- CreateIndex
CREATE INDEX "DetalleVenta_tenantId_categoriaId_createdAt_idx" ON "DetalleVenta"("tenantId", "categoriaId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DetalleVenta_tenantId_id_productoId_ventaId_key" ON "DetalleVenta"("tenantId", "id", "productoId", "ventaId");

-- CreateIndex
CREATE UNIQUE INDEX "DetalleVenta_tenantId_id_ventaId_productoId_key" ON "DetalleVenta"("tenantId", "id", "ventaId", "productoId");

-- CreateIndex
CREATE UNIQUE INDEX "DetalleVenta_tenantId_id_key" ON "DetalleVenta"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AsignacionLoteVenta_tenantId_detalleVentaId_loteId_key" ON "AsignacionLoteVenta"("tenantId", "detalleVentaId", "loteId");

-- CreateIndex
CREATE UNIQUE INDEX "AsignacionLoteVenta_tenantId_id_productoId_loteId_key" ON "AsignacionLoteVenta"("tenantId", "id", "productoId", "loteId");

-- CreateIndex
CREATE UNIQUE INDEX "AsignacionLoteVenta_key_85f419fd91" ON "AsignacionLoteVenta"("tenantId", "id", "ventaId", "detalleVentaId", "productoId", "loteId");

-- CreateIndex
CREATE UNIQUE INDEX "AsignacionLoteVenta_tenantId_id_key" ON "AsignacionLoteVenta"("tenantId", "id");

-- CreateIndex
CREATE INDEX "Cobro_tenantId_fecha_idx" ON "Cobro"("tenantId", "fecha");

-- CreateIndex
CREATE INDEX "Cobro_tenantId_clienteComercialId_fecha_idx" ON "Cobro"("tenantId", "clienteComercialId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "Cobro_tenantId_claveIdempotencia_key" ON "Cobro"("tenantId", "claveIdempotencia");

-- CreateIndex
CREATE UNIQUE INDEX "Cobro_tenantId_id_key" ON "Cobro"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Cobro_tenantId_id_turnoId_key" ON "Cobro"("tenantId", "id", "turnoId");

-- CreateIndex
CREATE UNIQUE INDEX "Cobro_tenantId_id_clienteComercialId_key" ON "Cobro"("tenantId", "id", "clienteComercialId");

-- CreateIndex
CREATE INDEX "AplicacionCobro_tenantId_cobroId_idx" ON "AplicacionCobro"("tenantId", "cobroId");

-- CreateIndex
CREATE INDEX "AplicacionCobro_tenantId_ventaId_idx" ON "AplicacionCobro"("tenantId", "ventaId");

-- CreateIndex
CREATE INDEX "AplicacionCobro_tenantId_cuentaId_idx" ON "AplicacionCobro"("tenantId", "cuentaId");

-- CreateIndex
CREATE UNIQUE INDEX "AplicacionCobro_tenantId_claveIdempotencia_key" ON "AplicacionCobro"("tenantId", "claveIdempotencia");

-- CreateIndex
CREATE UNIQUE INDEX "AplicacionCobro_tenantId_id_key" ON "AplicacionCobro"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AplicacionCobro_tenantId_id_cobroId_ventaId_key" ON "AplicacionCobro"("tenantId", "id", "cobroId", "ventaId");

-- CreateIndex
CREATE UNIQUE INDEX "AplicacionCobro_tenantId_id_ventaId_key" ON "AplicacionCobro"("tenantId", "id", "ventaId");

-- CreateIndex
CREATE UNIQUE INDEX "ReversionAplicacionCobro_tenantId_aplicacionId_key" ON "ReversionAplicacionCobro"("tenantId", "aplicacionId");

-- CreateIndex
CREATE UNIQUE INDEX "ReversionAplicacionCobro_tenantId_claveIdempotencia_key" ON "ReversionAplicacionCobro"("tenantId", "claveIdempotencia");

-- CreateIndex
CREATE UNIQUE INDEX "ReversionAplicacionCobro_tenantId_id_key" ON "ReversionAplicacionCobro"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ReversionAplicacionCobro_tenantId_id_ventaId_key" ON "ReversionAplicacionCobro"("tenantId", "id", "ventaId");

-- CreateIndex
CREATE INDEX "CuentaPorCobrar_tenantId_estado_vencimiento_idx" ON "CuentaPorCobrar"("tenantId", "estado", "vencimiento");

-- CreateIndex
CREATE INDEX "CuentaPorCobrar_tenantId_clienteComercialId_estado_idx" ON "CuentaPorCobrar"("tenantId", "clienteComercialId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaPorCobrar_tenantId_ventaId_key" ON "CuentaPorCobrar"("tenantId", "ventaId");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaPorCobrar_tenantId_id_ventaId_clienteComercialId_key" ON "CuentaPorCobrar"("tenantId", "id", "ventaId", "clienteComercialId");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaPorCobrar_tenantId_id_ventaId_key" ON "CuentaPorCobrar"("tenantId", "id", "ventaId");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaPorCobrar_tenantId_id_clienteComercialId_key" ON "CuentaPorCobrar"("tenantId", "id", "clienteComercialId");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaPorCobrar_tenantId_id_key" ON "CuentaPorCobrar"("tenantId", "id");

-- CreateIndex
CREATE INDEX "AjusteCuentaPorCobrar_tenantId_cuentaId_createdAt_idx" ON "AjusteCuentaPorCobrar"("tenantId", "cuentaId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AjusteCuentaPorCobrar_tenantId_claveIdempotencia_key" ON "AjusteCuentaPorCobrar"("tenantId", "claveIdempotencia");

-- CreateIndex
CREATE UNIQUE INDEX "AjusteCuentaPorCobrar_tenantId_id_key" ON "AjusteCuentaPorCobrar"("tenantId", "id");

-- CreateIndex
CREATE INDEX "Reembolso_tenantId_cobroId_idx" ON "Reembolso"("tenantId", "cobroId");

-- CreateIndex
CREATE INDEX "Reembolso_tenantId_ventaId_idx" ON "Reembolso"("tenantId", "ventaId");

-- CreateIndex
CREATE INDEX "Reembolso_tenantId_fecha_idx" ON "Reembolso"("tenantId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "Reembolso_tenantId_claveIdempotencia_key" ON "Reembolso"("tenantId", "claveIdempotencia");

-- CreateIndex
CREATE UNIQUE INDEX "Reembolso_tenantId_id_turnoId_key" ON "Reembolso"("tenantId", "id", "turnoId");

-- CreateIndex
CREATE UNIQUE INDEX "Reembolso_tenantId_id_key" ON "Reembolso"("tenantId", "id");

-- CreateIndex
CREATE INDEX "DevolucionVenta_tenantId_ventaId_fecha_idx" ON "DevolucionVenta"("tenantId", "ventaId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "DevolucionVenta_tenantId_claveIdempotencia_key" ON "DevolucionVenta"("tenantId", "claveIdempotencia");

-- CreateIndex
CREATE UNIQUE INDEX "DevolucionVenta_tenantId_id_ventaId_key" ON "DevolucionVenta"("tenantId", "id", "ventaId");

-- CreateIndex
CREATE UNIQUE INDEX "DevolucionVenta_tenantId_id_key" ON "DevolucionVenta"("tenantId", "id");

-- CreateIndex
CREATE INDEX "DetalleDevolucionVenta_tenantId_devolucionId_idx" ON "DetalleDevolucionVenta"("tenantId", "devolucionId");

-- CreateIndex
CREATE INDEX "DetalleDevolucionVenta_tenantId_asignacionVentaId_idx" ON "DetalleDevolucionVenta"("tenantId", "asignacionVentaId");

-- CreateIndex
CREATE UNIQUE INDEX "DetalleDevolucionVenta_tenantId_id_productoId_loteId_key" ON "DetalleDevolucionVenta"("tenantId", "id", "productoId", "loteId");

-- CreateIndex
CREATE UNIQUE INDEX "DetalleDevolucionVenta_tenantId_id_key" ON "DetalleDevolucionVenta"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Caja_tenantId_codigo_key" ON "Caja"("tenantId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Caja_tenantId_id_key" ON "Caja"("tenantId", "id");

-- CreateIndex
CREATE INDEX "TurnoCaja_tenantId_cajaId_estado_idx" ON "TurnoCaja"("tenantId", "cajaId", "estado");

-- CreateIndex
CREATE INDEX "TurnoCaja_tenantId_cajeroId_aperturaAt_idx" ON "TurnoCaja"("tenantId", "cajeroId", "aperturaAt");

-- CreateIndex
CREATE UNIQUE INDEX "TurnoCaja_tenantId_id_key" ON "TurnoCaja"("tenantId", "id");

-- CreateIndex
CREATE INDEX "MovimientoCaja_tenantId_turnoId_fecha_idx" ON "MovimientoCaja"("tenantId", "turnoId", "fecha");

-- CreateIndex
CREATE INDEX "MovimientoCaja_tenantId_fecha_idx" ON "MovimientoCaja"("tenantId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoCaja_tenantId_claveIdempotencia_key" ON "MovimientoCaja"("tenantId", "claveIdempotencia");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoCaja_tenantId_cobroId_key" ON "MovimientoCaja"("tenantId", "cobroId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoCaja_tenantId_reembolsoId_key" ON "MovimientoCaja"("tenantId", "reembolsoId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoCaja_tenantId_gastoId_key" ON "MovimientoCaja"("tenantId", "gastoId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoCaja_tenantId_id_key" ON "MovimientoCaja"("tenantId", "id");

-- CreateIndex
CREATE INDEX "GastoComercial_tenantId_fecha_idx" ON "GastoComercial"("tenantId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "GastoComercial_tenantId_claveIdempotencia_key" ON "GastoComercial"("tenantId", "claveIdempotencia");

-- CreateIndex
CREATE UNIQUE INDEX "GastoComercial_tenantId_id_turnoId_key" ON "GastoComercial"("tenantId", "id", "turnoId");

-- CreateIndex
CREATE UNIQUE INDEX "GastoComercial_tenantId_id_key" ON "GastoComercial"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SecuenciaComprobante_tenantId_key" ON "SecuenciaComprobante"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SecuenciaComprobante_tenantId_id_key" ON "SecuenciaComprobante"("tenantId", "id");

-- CreateIndex
CREATE INDEX "ComprobanteVenta_tenantId_fechaEmision_idx" ON "ComprobanteVenta"("tenantId", "fechaEmision");

-- CreateIndex
CREATE UNIQUE INDEX "ComprobanteVenta_tenantId_ventaId_key" ON "ComprobanteVenta"("tenantId", "ventaId");

-- CreateIndex
CREATE UNIQUE INDEX "ComprobanteVenta_tenantId_consecutivo_key" ON "ComprobanteVenta"("tenantId", "consecutivo");

-- CreateIndex
CREATE UNIQUE INDEX "ComprobanteVenta_tenantId_numero_key" ON "ComprobanteVenta"("tenantId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "ComprobanteVenta_tenantId_id_ventaId_key" ON "ComprobanteVenta"("tenantId", "id", "ventaId");

-- CreateIndex
CREATE UNIQUE INDEX "ComprobanteVenta_tenantId_id_key" ON "ComprobanteVenta"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ComprobanteVenta_tenantId_id_clienteComercialId_key" ON "ComprobanteVenta"("tenantId", "id", "clienteComercialId");

-- CreateIndex
CREATE UNIQUE INDEX "DetalleComprobanteVenta_key_0917bd5041" ON "DetalleComprobanteVenta"("tenantId", "comprobanteId", "detalleVentaId");

-- CreateIndex
CREATE UNIQUE INDEX "DetalleComprobanteVenta_tenantId_id_key" ON "DetalleComprobanteVenta"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "EventoSalida_eventoId_key" ON "EventoSalida"("eventoId");

-- CreateIndex
CREATE INDEX "EventoSalida_estado_proximoIntentoAt_idx" ON "EventoSalida"("estado", "proximoIntentoAt");

-- CreateIndex
CREATE INDEX "EventoSalida_tenantId_createdAt_idx" ON "EventoSalida"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventoSalida_tenantId_id_key" ON "EventoSalida"("tenantId", "id");

-- CreateIndex
CREATE INDEX "NotificacionCliente_idx_65e93edc38" ON "NotificacionCliente"("tenantId", "clienteComercialId", "leidaAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificacionCliente_tenantId_eventoId_clienteComercialId_key" ON "NotificacionCliente"("tenantId", "eventoId", "clienteComercialId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificacionCliente_tenantId_id_key" ON "NotificacionCliente"("tenantId", "id");

-- CreateIndex
CREATE INDEX "AuditoriaOperacion_tenantId_createdAt_idx" ON "AuditoriaOperacion"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditoriaOperacion_tenantId_rolCodigo_createdAt_idx" ON "AuditoriaOperacion"("tenantId", "rolCodigo", "createdAt");

-- CreateIndex
CREATE INDEX "AuditoriaOperacion_tenantId_productoId_createdAt_idx" ON "AuditoriaOperacion"("tenantId", "productoId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditoriaOperacion_idx_f8f5db49a6" ON "AuditoriaOperacion"("tenantId", "entidadTipo", "entidadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuditoriaOperacion_tenantId_id_key" ON "AuditoriaOperacion"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SolicitudIdempotente_tenantId_alcance_operacion_clave_key" ON "SolicitudIdempotente"("tenantId", "alcance", "operacion", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "SolicitudIdempotente_tenantId_id_key" ON "SolicitudIdempotente"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "UserTenant_tenantId_id_key" ON "UserTenant"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "UserTenant_tenantId_id_usuarioId_key" ON "UserTenant"("tenantId", "id", "usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_tenantId_id_key" ON "Cliente"("tenantId", "id");

-- CreateIndex
CREATE INDEX "Producto_tenantId_estado_categoriaId_idx" ON "Producto"("tenantId", "estado", "categoriaId");

-- CreateIndex
CREATE UNIQUE INDEX "Producto_tenantId_id_key" ON "Producto"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Producto_tenantId_sku_key" ON "Producto"("tenantId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "Producto_tenantId_codigoBarras_key" ON "Producto"("tenantId", "codigoBarras");

-- CreateIndex
CREATE UNIQUE INDEX "Compra_tenantId_id_productoId_key" ON "Compra"("tenantId", "id", "productoId");

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_tenantId_categoriaId_fkey" FOREIGN KEY ("tenantId", "categoriaId") REFERENCES "CategoriaProducto"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ClienteComercial" ADD CONSTRAINT "ClienteComercial_tenantId_clienteGymId_fkey" FOREIGN KEY ("tenantId", "clienteGymId") REFERENCES "Cliente"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ClienteComercial" ADD CONSTRAINT "ClienteComercial_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "VinculacionClienteUsuario" ADD CONSTRAINT "VinculacionClienteUsuario_tenantId_clienteComercialId_fkey" FOREIGN KEY ("tenantId", "clienteComercialId") REFERENCES "ClienteComercial"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "VinculacionClienteUsuario" ADD CONSTRAINT "VinculacionClienteUsuario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "VinculacionClienteUsuario" ADD CONSTRAINT "VinculacionClienteUsuario_tenantId_verificadorId_fkey" FOREIGN KEY ("tenantId", "verificadorId") REFERENCES "UserTenant"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "VinculacionClienteUsuario" ADD CONSTRAINT "VinculacionClienteUsuario_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "RolNegocio" ADD CONSTRAINT "RolNegocio_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "RolPermiso" ADD CONSTRAINT "RolPermiso_tenantId_rolId_fkey" FOREIGN KEY ("tenantId", "rolId") REFERENCES "RolNegocio"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "RolPermiso" ADD CONSTRAINT "RolPermiso_permisoId_fkey" FOREIGN KEY ("permisoId") REFERENCES "Permiso"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "RolPermiso" ADD CONSTRAINT "RolPermiso_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AsignacionRol" ADD CONSTRAINT "AsignacionRol_tenantId_membresiaId_fkey" FOREIGN KEY ("tenantId", "membresiaId") REFERENCES "UserTenant"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AsignacionRol" ADD CONSTRAINT "AsignacionRol_tenantId_rolId_fkey" FOREIGN KEY ("tenantId", "rolId") REFERENCES "RolNegocio"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AsignacionRol" ADD CONSTRAINT "AsignacionRol_tenantId_asignadorId_fkey" FOREIGN KEY ("tenantId", "asignadorId") REFERENCES "UserTenant"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AsignacionRol" ADD CONSTRAINT "AsignacionRol_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CategoriaProducto" ADD CONSTRAINT "CategoriaProducto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ProductoImagen" ADD CONSTRAINT "ProductoImagen_tenantId_productoId_fkey" FOREIGN KEY ("tenantId", "productoId") REFERENCES "Producto"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ProductoImagen" ADD CONSTRAINT "ProductoImagen_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "EntradaInventario" ADD CONSTRAINT "EntradaInventario_tenantId_responsableId_fkey" FOREIGN KEY ("tenantId", "responsableId") REFERENCES "UserTenant"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "EntradaInventario" ADD CONSTRAINT "EntradaInventario_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "LoteInventario" ADD CONSTRAINT "LoteInventario_tenantId_productoId_fkey" FOREIGN KEY ("tenantId", "productoId") REFERENCES "Producto"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "LoteInventario" ADD CONSTRAINT "LoteInventario_tenantId_entradaId_fkey" FOREIGN KEY ("tenantId", "entradaId") REFERENCES "EntradaInventario"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "LoteInventario" ADD CONSTRAINT "LoteInventario_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_tenantId_productoId_fkey" FOREIGN KEY ("tenantId", "productoId") REFERENCES "Producto"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_tenantId_loteId_productoId_fkey" FOREIGN KEY ("tenantId", "loteId", "productoId") REFERENCES "LoteInventario"("tenantId", "id", "productoId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_tenantId_entradaId_fkey" FOREIGN KEY ("tenantId", "entradaId") REFERENCES "EntradaInventario"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_tenantId_reservaId_productoId_fkey" FOREIGN KEY ("tenantId", "reservaId", "productoId") REFERENCES "ReservaInventario"("tenantId", "id", "productoId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_tenantId_asignacionVentaId_productoId_fkey" FOREIGN KEY ("tenantId", "asignacionVentaId", "productoId", "loteId") REFERENCES "AsignacionLoteVenta"("tenantId", "id", "productoId", "loteId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_tenantId_detalleDevolucionId_producto_fkey" FOREIGN KEY ("tenantId", "detalleDevolucionId", "productoId", "loteId") REFERENCES "DetalleDevolucionVenta"("tenantId", "id", "productoId", "loteId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_tenantId_compraLegacyId_productoId_fkey" FOREIGN KEY ("tenantId", "compraLegacyId", "productoId") REFERENCES "Compra"("tenantId", "id", "productoId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_tenantId_movimientoOriginalId_product_fkey" FOREIGN KEY ("tenantId", "movimientoOriginalId", "productoId") REFERENCES "MovimientoInventario"("tenantId", "id", "productoId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_tenantId_responsableId_fkey" FOREIGN KEY ("tenantId", "responsableId") REFERENCES "UserTenant"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_tenantId_asignacionVentaId_fkey" FOREIGN KEY ("tenantId", "asignacionVentaId") REFERENCES "AsignacionLoteVenta"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_tenantId_detalleDevolucionId_fkey" FOREIGN KEY ("tenantId", "detalleDevolucionId") REFERENCES "DetalleDevolucionVenta"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Carrito" ADD CONSTRAINT "Carrito_tenantId_clienteComercialId_fkey" FOREIGN KEY ("tenantId", "clienteComercialId") REFERENCES "ClienteComercial"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Carrito" ADD CONSTRAINT "Carrito_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DetalleCarrito" ADD CONSTRAINT "DetalleCarrito_tenantId_carritoId_fkey" FOREIGN KEY ("tenantId", "carritoId") REFERENCES "Carrito"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DetalleCarrito" ADD CONSTRAINT "DetalleCarrito_tenantId_productoId_fkey" FOREIGN KEY ("tenantId", "productoId") REFERENCES "Producto"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DetalleCarrito" ADD CONSTRAINT "DetalleCarrito_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_tenantId_clienteComercialId_fkey" FOREIGN KEY ("tenantId", "clienteComercialId") REFERENCES "ClienteComercial"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_tenantId_carritoId_clienteComercialId_fkey" FOREIGN KEY ("tenantId", "carritoId", "clienteComercialId") REFERENCES "Carrito"("tenantId", "id", "clienteComercialId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DetallePedido" ADD CONSTRAINT "DetallePedido_tenantId_pedidoId_fkey" FOREIGN KEY ("tenantId", "pedidoId") REFERENCES "Pedido"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DetallePedido" ADD CONSTRAINT "DetallePedido_tenantId_productoId_fkey" FOREIGN KEY ("tenantId", "productoId") REFERENCES "Producto"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DetallePedido" ADD CONSTRAINT "DetallePedido_tenantId_categoriaId_fkey" FOREIGN KEY ("tenantId", "categoriaId") REFERENCES "CategoriaProducto"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DetallePedido" ADD CONSTRAINT "DetallePedido_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ReservaInventario" ADD CONSTRAINT "ReservaInventario_tenantId_productoId_fkey" FOREIGN KEY ("tenantId", "productoId") REFERENCES "Producto"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ReservaInventario" ADD CONSTRAINT "ReservaInventario_tenantId_detallePedidoId_pedidoId_produc_fkey" FOREIGN KEY ("tenantId", "detallePedidoId", "pedidoId", "productoId") REFERENCES "DetallePedido"("tenantId", "id", "pedidoId", "productoId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ReservaInventario" ADD CONSTRAINT "ReservaInventario_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "HistorialEstadoPedido" ADD CONSTRAINT "HistorialEstadoPedido_tenantId_pedidoId_fkey" FOREIGN KEY ("tenantId", "pedidoId") REFERENCES "Pedido"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "HistorialEstadoPedido" ADD CONSTRAINT "HistorialEstadoPedido_tenantId_responsableId_fkey" FOREIGN KEY ("tenantId", "responsableId") REFERENCES "UserTenant"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "HistorialEstadoPedido" ADD CONSTRAINT "HistorialEstadoPedido_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_tenantId_clienteComercialId_fkey" FOREIGN KEY ("tenantId", "clienteComercialId") REFERENCES "ClienteComercial"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_tenantId_pedidoId_clienteComercialId_fkey" FOREIGN KEY ("tenantId", "pedidoId", "clienteComercialId") REFERENCES "Pedido"("tenantId", "id", "clienteComercialId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_tenantId_responsableId_fkey" FOREIGN KEY ("tenantId", "responsableId") REFERENCES "UserTenant"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_tenantId_anuladaPorId_fkey" FOREIGN KEY ("tenantId", "anuladaPorId") REFERENCES "UserTenant"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_tenantId_pedidoId_fkey" FOREIGN KEY ("tenantId", "pedidoId") REFERENCES "Pedido"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DetalleVenta" ADD CONSTRAINT "DetalleVenta_tenantId_ventaId_fkey" FOREIGN KEY ("tenantId", "ventaId") REFERENCES "Venta"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DetalleVenta" ADD CONSTRAINT "DetalleVenta_tenantId_productoId_fkey" FOREIGN KEY ("tenantId", "productoId") REFERENCES "Producto"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DetalleVenta" ADD CONSTRAINT "DetalleVenta_tenantId_categoriaId_fkey" FOREIGN KEY ("tenantId", "categoriaId") REFERENCES "CategoriaProducto"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DetalleVenta" ADD CONSTRAINT "DetalleVenta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AsignacionLoteVenta" ADD CONSTRAINT "AsignacionLoteVenta_tenantId_detalleVentaId_productoId_ven_fkey" FOREIGN KEY ("tenantId", "detalleVentaId", "productoId", "ventaId") REFERENCES "DetalleVenta"("tenantId", "id", "productoId", "ventaId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AsignacionLoteVenta" ADD CONSTRAINT "AsignacionLoteVenta_tenantId_loteId_productoId_fkey" FOREIGN KEY ("tenantId", "loteId", "productoId") REFERENCES "LoteInventario"("tenantId", "id", "productoId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AsignacionLoteVenta" ADD CONSTRAINT "AsignacionLoteVenta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_tenantId_clienteComercialId_fkey" FOREIGN KEY ("tenantId", "clienteComercialId") REFERENCES "ClienteComercial"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_tenantId_responsableId_fkey" FOREIGN KEY ("tenantId", "responsableId") REFERENCES "UserTenant"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_tenantId_turnoId_fkey" FOREIGN KEY ("tenantId", "turnoId") REFERENCES "TurnoCaja"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_tenantId_reversadoPorId_fkey" FOREIGN KEY ("tenantId", "reversadoPorId") REFERENCES "UserTenant"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AplicacionCobro" ADD CONSTRAINT "AplicacionCobro_tenantId_cobroId_fkey" FOREIGN KEY ("tenantId", "cobroId") REFERENCES "Cobro"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AplicacionCobro" ADD CONSTRAINT "AplicacionCobro_tenantId_ventaId_fkey" FOREIGN KEY ("tenantId", "ventaId") REFERENCES "Venta"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AplicacionCobro" ADD CONSTRAINT "AplicacionCobro_tenantId_cuentaId_ventaId_clienteComercial_fkey" FOREIGN KEY ("tenantId", "cuentaId", "ventaId", "clienteComercialId") REFERENCES "CuentaPorCobrar"("tenantId", "id", "ventaId", "clienteComercialId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AplicacionCobro" ADD CONSTRAINT "AplicacionCobro_tenantId_responsableId_fkey" FOREIGN KEY ("tenantId", "responsableId") REFERENCES "UserTenant"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AplicacionCobro" ADD CONSTRAINT "AplicacionCobro_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AplicacionCobro" ADD CONSTRAINT "AplicacionCobro_tenantId_cuentaId_fkey" FOREIGN KEY ("tenantId", "cuentaId") REFERENCES "CuentaPorCobrar"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AplicacionCobro" ADD CONSTRAINT "AplicacionCobro_tenantId_clienteComercialId_fkey" FOREIGN KEY ("tenantId", "clienteComercialId") REFERENCES "ClienteComercial"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AplicacionCobro" ADD CONSTRAINT "AplicacionCobro_tenantId_cobroId_clienteComercialId_fkey" FOREIGN KEY ("tenantId", "cobroId", "clienteComercialId") REFERENCES "Cobro"("tenantId", "id", "clienteComercialId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AplicacionCobro" ADD CONSTRAINT "AplicacionCobro_tenantId_ventaId_clienteComercialId_fkey" FOREIGN KEY ("tenantId", "ventaId", "clienteComercialId") REFERENCES "Venta"("tenantId", "id", "clienteComercialId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ReversionAplicacionCobro" ADD CONSTRAINT "ReversionAplicacionCobro_tenantId_aplicacionId_ventaId_fkey" FOREIGN KEY ("tenantId", "aplicacionId", "ventaId") REFERENCES "AplicacionCobro"("tenantId", "id", "ventaId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ReversionAplicacionCobro" ADD CONSTRAINT "ReversionAplicacionCobro_tenantId_responsableId_fkey" FOREIGN KEY ("tenantId", "responsableId") REFERENCES "UserTenant"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ReversionAplicacionCobro" ADD CONSTRAINT "ReversionAplicacionCobro_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CuentaPorCobrar" ADD CONSTRAINT "CuentaPorCobrar_tenantId_clienteComercialId_fkey" FOREIGN KEY ("tenantId", "clienteComercialId") REFERENCES "ClienteComercial"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CuentaPorCobrar" ADD CONSTRAINT "CuentaPorCobrar_tenantId_ventaId_clienteComercialId_fkey" FOREIGN KEY ("tenantId", "ventaId", "clienteComercialId") REFERENCES "Venta"("tenantId", "id", "clienteComercialId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CuentaPorCobrar" ADD CONSTRAINT "CuentaPorCobrar_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AjusteCuentaPorCobrar" ADD CONSTRAINT "AjusteCuentaPorCobrar_tenantId_cuentaId_ventaId_fkey" FOREIGN KEY ("tenantId", "cuentaId", "ventaId") REFERENCES "CuentaPorCobrar"("tenantId", "id", "ventaId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AjusteCuentaPorCobrar" ADD CONSTRAINT "AjusteCuentaPorCobrar_tenantId_devolucionId_ventaId_fkey" FOREIGN KEY ("tenantId", "devolucionId", "ventaId") REFERENCES "DevolucionVenta"("tenantId", "id", "ventaId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AjusteCuentaPorCobrar" ADD CONSTRAINT "AjusteCuentaPorCobrar_tenantId_reversionId_ventaId_fkey" FOREIGN KEY ("tenantId", "reversionId", "ventaId") REFERENCES "ReversionAplicacionCobro"("tenantId", "id", "ventaId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AjusteCuentaPorCobrar" ADD CONSTRAINT "AjusteCuentaPorCobrar_tenantId_responsableId_fkey" FOREIGN KEY ("tenantId", "responsableId") REFERENCES "UserTenant"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AjusteCuentaPorCobrar" ADD CONSTRAINT "AjusteCuentaPorCobrar_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Reembolso" ADD CONSTRAINT "Reembolso_tenantId_cobroId_fkey" FOREIGN KEY ("tenantId", "cobroId") REFERENCES "Cobro"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Reembolso" ADD CONSTRAINT "Reembolso_tenantId_ventaId_fkey" FOREIGN KEY ("tenantId", "ventaId") REFERENCES "Venta"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Reembolso" ADD CONSTRAINT "Reembolso_tenantId_aplicacionOriginalId_cobroId_ventaId_fkey" FOREIGN KEY ("tenantId", "aplicacionOriginalId", "cobroId", "ventaId") REFERENCES "AplicacionCobro"("tenantId", "id", "cobroId", "ventaId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Reembolso" ADD CONSTRAINT "Reembolso_tenantId_devolucionId_ventaId_fkey" FOREIGN KEY ("tenantId", "devolucionId", "ventaId") REFERENCES "DevolucionVenta"("tenantId", "id", "ventaId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Reembolso" ADD CONSTRAINT "Reembolso_tenantId_responsableId_fkey" FOREIGN KEY ("tenantId", "responsableId") REFERENCES "UserTenant"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Reembolso" ADD CONSTRAINT "Reembolso_tenantId_turnoId_fkey" FOREIGN KEY ("tenantId", "turnoId") REFERENCES "TurnoCaja"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Reembolso" ADD CONSTRAINT "Reembolso_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DevolucionVenta" ADD CONSTRAINT "DevolucionVenta_tenantId_ventaId_fkey" FOREIGN KEY ("tenantId", "ventaId") REFERENCES "Venta"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DevolucionVenta" ADD CONSTRAINT "DevolucionVenta_tenantId_responsableId_fkey" FOREIGN KEY ("tenantId", "responsableId") REFERENCES "UserTenant"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DevolucionVenta" ADD CONSTRAINT "DevolucionVenta_tenantId_aprobadaPorId_fkey" FOREIGN KEY ("tenantId", "aprobadaPorId") REFERENCES "UserTenant"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DevolucionVenta" ADD CONSTRAINT "DevolucionVenta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DetalleDevolucionVenta" ADD CONSTRAINT "DetalleDevolucionVenta_tenantId_devolucionId_ventaId_fkey" FOREIGN KEY ("tenantId", "devolucionId", "ventaId") REFERENCES "DevolucionVenta"("tenantId", "id", "ventaId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DetalleDevolucionVenta" ADD CONSTRAINT "DetalleDevolucionVenta_tenantId_asignacionVentaId_ventaId__fkey" FOREIGN KEY ("tenantId", "asignacionVentaId", "ventaId", "detalleVentaId", "productoId", "loteId") REFERENCES "AsignacionLoteVenta"("tenantId", "id", "ventaId", "detalleVentaId", "productoId", "loteId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DetalleDevolucionVenta" ADD CONSTRAINT "DetalleDevolucionVenta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Caja" ADD CONSTRAINT "Caja_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TurnoCaja" ADD CONSTRAINT "TurnoCaja_tenantId_cajaId_fkey" FOREIGN KEY ("tenantId", "cajaId") REFERENCES "Caja"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TurnoCaja" ADD CONSTRAINT "TurnoCaja_tenantId_cajeroId_fkey" FOREIGN KEY ("tenantId", "cajeroId") REFERENCES "UserTenant"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TurnoCaja" ADD CONSTRAINT "TurnoCaja_tenantId_cerradoPorId_fkey" FOREIGN KEY ("tenantId", "cerradoPorId") REFERENCES "UserTenant"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TurnoCaja" ADD CONSTRAINT "TurnoCaja_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_tenantId_turnoId_fkey" FOREIGN KEY ("tenantId", "turnoId") REFERENCES "TurnoCaja"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_tenantId_responsableId_fkey" FOREIGN KEY ("tenantId", "responsableId") REFERENCES "UserTenant"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_tenantId_cobroId_turnoId_fkey" FOREIGN KEY ("tenantId", "cobroId", "turnoId") REFERENCES "Cobro"("tenantId", "id", "turnoId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_tenantId_reembolsoId_turnoId_fkey" FOREIGN KEY ("tenantId", "reembolsoId", "turnoId") REFERENCES "Reembolso"("tenantId", "id", "turnoId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_tenantId_gastoId_turnoId_fkey" FOREIGN KEY ("tenantId", "gastoId", "turnoId") REFERENCES "GastoComercial"("tenantId", "id", "turnoId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "GastoComercial" ADD CONSTRAINT "GastoComercial_tenantId_responsableId_fkey" FOREIGN KEY ("tenantId", "responsableId") REFERENCES "UserTenant"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "GastoComercial" ADD CONSTRAINT "GastoComercial_tenantId_turnoId_fkey" FOREIGN KEY ("tenantId", "turnoId") REFERENCES "TurnoCaja"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "GastoComercial" ADD CONSTRAINT "GastoComercial_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SecuenciaComprobante" ADD CONSTRAINT "SecuenciaComprobante_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ComprobanteVenta" ADD CONSTRAINT "ComprobanteVenta_tenantId_ventaId_fkey" FOREIGN KEY ("tenantId", "ventaId") REFERENCES "Venta"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ComprobanteVenta" ADD CONSTRAINT "ComprobanteVenta_tenantId_emitidoPorId_fkey" FOREIGN KEY ("tenantId", "emitidoPorId") REFERENCES "UserTenant"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ComprobanteVenta" ADD CONSTRAINT "ComprobanteVenta_tenantId_anuladoPorId_fkey" FOREIGN KEY ("tenantId", "anuladoPorId") REFERENCES "UserTenant"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ComprobanteVenta" ADD CONSTRAINT "ComprobanteVenta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ComprobanteVenta" ADD CONSTRAINT "ComprobanteVenta_tenantId_clienteComercialId_fkey" FOREIGN KEY ("tenantId", "clienteComercialId") REFERENCES "ClienteComercial"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ComprobanteVenta" ADD CONSTRAINT "ComprobanteVenta_tenantId_ventaId_clienteComercialId_fkey" FOREIGN KEY ("tenantId", "ventaId", "clienteComercialId") REFERENCES "Venta"("tenantId", "id", "clienteComercialId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DetalleComprobanteVenta" ADD CONSTRAINT "DetalleComprobanteVenta_tenantId_comprobanteId_ventaId_fkey" FOREIGN KEY ("tenantId", "comprobanteId", "ventaId") REFERENCES "ComprobanteVenta"("tenantId", "id", "ventaId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DetalleComprobanteVenta" ADD CONSTRAINT "DetalleComprobanteVenta_tenantId_detalleVentaId_ventaId_pr_fkey" FOREIGN KEY ("tenantId", "detalleVentaId", "ventaId", "productoId") REFERENCES "DetalleVenta"("tenantId", "id", "ventaId", "productoId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DetalleComprobanteVenta" ADD CONSTRAINT "DetalleComprobanteVenta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "EventoSalida" ADD CONSTRAINT "EventoSalida_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "NotificacionCliente" ADD CONSTRAINT "NotificacionCliente_tenantId_clienteComercialId_fkey" FOREIGN KEY ("tenantId", "clienteComercialId") REFERENCES "ClienteComercial"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "NotificacionCliente" ADD CONSTRAINT "NotificacionCliente_tenantId_eventoId_fkey" FOREIGN KEY ("tenantId", "eventoId") REFERENCES "EventoSalida"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "NotificacionCliente" ADD CONSTRAINT "NotificacionCliente_tenantId_vinculacionId_clienteComercia_fkey" FOREIGN KEY ("tenantId", "vinculacionId", "clienteComercialId") REFERENCES "VinculacionClienteUsuario"("tenantId", "id", "clienteComercialId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "NotificacionCliente" ADD CONSTRAINT "NotificacionCliente_tenantId_pedidoId_clienteComercialId_fkey" FOREIGN KEY ("tenantId", "pedidoId", "clienteComercialId") REFERENCES "Pedido"("tenantId", "id", "clienteComercialId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "NotificacionCliente" ADD CONSTRAINT "NotificacionCliente_tenantId_comprobanteId_clienteComercia_fkey" FOREIGN KEY ("tenantId", "comprobanteId", "clienteComercialId") REFERENCES "ComprobanteVenta"("tenantId", "id", "clienteComercialId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "NotificacionCliente" ADD CONSTRAINT "NotificacionCliente_tenantId_cuentaId_clienteComercialId_fkey" FOREIGN KEY ("tenantId", "cuentaId", "clienteComercialId") REFERENCES "CuentaPorCobrar"("tenantId", "id", "clienteComercialId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "NotificacionCliente" ADD CONSTRAINT "NotificacionCliente_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AuditoriaOperacion" ADD CONSTRAINT "AuditoriaOperacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AuditoriaOperacion" ADD CONSTRAINT "AuditoriaOperacion_tenantId_membresiaId_usuarioId_fkey" FOREIGN KEY ("tenantId", "membresiaId", "usuarioId") REFERENCES "UserTenant"("tenantId", "id", "usuarioId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AuditoriaOperacion" ADD CONSTRAINT "AuditoriaOperacion_tenantId_productoId_fkey" FOREIGN KEY ("tenantId", "productoId") REFERENCES "Producto"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AuditoriaOperacion" ADD CONSTRAINT "AuditoriaOperacion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AuditoriaOperacion" ADD CONSTRAINT "AuditoriaOperacion_tenantId_membresiaId_fkey" FOREIGN KEY ("tenantId", "membresiaId") REFERENCES "UserTenant"("tenantId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SolicitudIdempotente" ADD CONSTRAINT "SolicitudIdempotente_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SolicitudIdempotente" ADD CONSTRAINT "SolicitudIdempotente_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

COMMIT;
