-- Restricciones SQL adicionales no expresables por Prisma 6.10.1.
-- Todas las tablas STORE permanecen sin activar; GYM conserva modo LEGACY.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_saldos_ck" CHECK (("precio" >= 0 AND "precio" <> 'NaN'::numeric) AND "stock" >= 0 AND "stockReservado" >= 0 AND "stockReservado" <= "stock");
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_legacy_reserva_ck" CHECK ("modoInventario" <> 'LEGACY' OR "stockReservado" = 0);
ALTER TABLE "EntradaInventario" ADD CONSTRAINT "EntradaInventario_motivo_ck" CHECK (length(btrim("motivo")) > 0);
ALTER TABLE "LoteInventario" ADD CONSTRAINT "LoteInventario_importes_ck" CHECK (("costoUnitario" >= 0 AND "costoUnitario" <> 'NaN'::numeric));
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_importes_ck" CHECK (("costoUnitario" >= 0 AND "costoUnitario" <> 'NaN'::numeric) AND ("costoTotal" >= 0 AND "costoTotal" <> 'NaN'::numeric));
ALTER TABLE "DetalleCarrito" ADD CONSTRAINT "DetalleCarrito_cantidad_ck" CHECK ("cantidad" > 0);
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_importes_ck" CHECK (("subtotal" >= 0 AND "subtotal" <> 'NaN'::numeric) AND ("descuento" >= 0 AND "descuento" <> 'NaN'::numeric) AND ("impuesto" >= 0 AND "impuesto" <> 'NaN'::numeric) AND ("total" >= 0 AND "total" <> 'NaN'::numeric));
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_total_ck" CHECK ("descuento" <= "subtotal" AND "total" = "subtotal" - "descuento" + "impuesto");
ALTER TABLE "DetallePedido" ADD CONSTRAINT "DetallePedido_importes_ck" CHECK (("precioUnitario" >= 0 AND "precioUnitario" <> 'NaN'::numeric) AND ("descuento" >= 0 AND "descuento" <> 'NaN'::numeric) AND ("tasaImpuesto" >= 0 AND "tasaImpuesto" <> 'NaN'::numeric) AND ("subtotal" >= 0 AND "subtotal" <> 'NaN'::numeric) AND ("impuesto" >= 0 AND "impuesto" <> 'NaN'::numeric) AND ("total" >= 0 AND "total" <> 'NaN'::numeric));
ALTER TABLE "DetallePedido" ADD CONSTRAINT "DetallePedido_cantidad_ck" CHECK ("cantidad" > 0);
ALTER TABLE "DetallePedido" ADD CONSTRAINT "DetallePedido_total_ck" CHECK ("descuento" <= "subtotal" AND "total" = "subtotal" - "descuento" + "impuesto");
ALTER TABLE "DetallePedido" ADD CONSTRAINT "DetallePedido_tasa_ck" CHECK ("tasaImpuesto" <= 100);
ALTER TABLE "ReservaInventario" ADD CONSTRAINT "ReservaInventario_cantidad_ck" CHECK ("cantidad" > 0);
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_importes_ck" CHECK (("subtotal" >= 0 AND "subtotal" <> 'NaN'::numeric) AND ("descuento" >= 0 AND "descuento" <> 'NaN'::numeric) AND ("impuesto" >= 0 AND "impuesto" <> 'NaN'::numeric) AND ("total" >= 0 AND "total" <> 'NaN'::numeric));
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_total_ck" CHECK ("descuento" <= "subtotal" AND "total" = "subtotal" - "descuento" + "impuesto");
ALTER TABLE "DetalleVenta" ADD CONSTRAINT "DetalleVenta_importes_ck" CHECK (("precioUnitario" >= 0 AND "precioUnitario" <> 'NaN'::numeric) AND ("descuento" >= 0 AND "descuento" <> 'NaN'::numeric) AND ("tasaImpuesto" >= 0 AND "tasaImpuesto" <> 'NaN'::numeric) AND ("subtotal" >= 0 AND "subtotal" <> 'NaN'::numeric) AND ("impuesto" >= 0 AND "impuesto" <> 'NaN'::numeric) AND ("total" >= 0 AND "total" <> 'NaN'::numeric));
ALTER TABLE "DetalleVenta" ADD CONSTRAINT "DetalleVenta_cantidad_ck" CHECK ("cantidad" > 0);
ALTER TABLE "DetalleVenta" ADD CONSTRAINT "DetalleVenta_total_ck" CHECK ("descuento" <= "subtotal" AND "total" = "subtotal" - "descuento" + "impuesto");
ALTER TABLE "DetalleVenta" ADD CONSTRAINT "DetalleVenta_tasa_ck" CHECK ("tasaImpuesto" <= 100);
ALTER TABLE "AsignacionLoteVenta" ADD CONSTRAINT "AsignacionLoteVenta_importes_ck" CHECK (("costoUnitario" >= 0 AND "costoUnitario" <> 'NaN'::numeric) AND ("costoTotal" >= 0 AND "costoTotal" <> 'NaN'::numeric));
ALTER TABLE "AsignacionLoteVenta" ADD CONSTRAINT "AsignacionLoteVenta_cantidad_ck" CHECK ("cantidad" > 0);
ALTER TABLE "AsignacionLoteVenta" ADD CONSTRAINT "AsignacionLoteVenta_costo_ck" CHECK ("costoTotal" = "cantidad" * "costoUnitario");
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_importes_ck" CHECK (("monto" >= 0 AND "monto" <> 'NaN'::numeric));
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_monto_ck" CHECK ("monto" > 0);
ALTER TABLE "AplicacionCobro" ADD CONSTRAINT "AplicacionCobro_importes_ck" CHECK (("monto" >= 0 AND "monto" <> 'NaN'::numeric));
ALTER TABLE "AplicacionCobro" ADD CONSTRAINT "AplicacionCobro_monto_ck" CHECK ("monto" > 0);
ALTER TABLE "ReversionAplicacionCobro" ADD CONSTRAINT "ReversionAplicacionCobro_motivo_ck" CHECK (length(btrim("motivo")) > 0);
ALTER TABLE "CuentaPorCobrar" ADD CONSTRAINT "CuentaPorCobrar_importes_ck" CHECK (("importeFinanciadoInicial" >= 0 AND "importeFinanciadoInicial" <> 'NaN'::numeric) AND ("importeExigible" >= 0 AND "importeExigible" <> 'NaN'::numeric) AND ("saldo" >= 0 AND "saldo" <> 'NaN'::numeric));
ALTER TABLE "AjusteCuentaPorCobrar" ADD CONSTRAINT "AjusteCuentaPorCobrar_motivo_ck" CHECK (length(btrim("motivo")) > 0);
ALTER TABLE "Reembolso" ADD CONSTRAINT "Reembolso_importes_ck" CHECK (("monto" >= 0 AND "monto" <> 'NaN'::numeric));
ALTER TABLE "Reembolso" ADD CONSTRAINT "Reembolso_monto_ck" CHECK ("monto" > 0);
ALTER TABLE "Reembolso" ADD CONSTRAINT "Reembolso_motivo_ck" CHECK (length(btrim("motivo")) > 0);
ALTER TABLE "DevolucionVenta" ADD CONSTRAINT "DevolucionVenta_importes_ck" CHECK (("subtotal" >= 0 AND "subtotal" <> 'NaN'::numeric) AND ("descuento" >= 0 AND "descuento" <> 'NaN'::numeric) AND ("impuesto" >= 0 AND "impuesto" <> 'NaN'::numeric) AND ("total" >= 0 AND "total" <> 'NaN'::numeric));
ALTER TABLE "DevolucionVenta" ADD CONSTRAINT "DevolucionVenta_motivo_ck" CHECK (length(btrim("motivo")) > 0);
ALTER TABLE "DevolucionVenta" ADD CONSTRAINT "DevolucionVenta_total_ck" CHECK ("descuento" <= "subtotal" AND "total" = "subtotal" - "descuento" + "impuesto");
ALTER TABLE "DetalleDevolucionVenta" ADD CONSTRAINT "DetalleDevolucionVenta_importes_ck" CHECK (("subtotal" >= 0 AND "subtotal" <> 'NaN'::numeric) AND ("descuento" >= 0 AND "descuento" <> 'NaN'::numeric) AND ("impuesto" >= 0 AND "impuesto" <> 'NaN'::numeric) AND ("total" >= 0 AND "total" <> 'NaN'::numeric) AND ("costoUnitario" >= 0 AND "costoUnitario" <> 'NaN'::numeric) AND ("costoTotal" >= 0 AND "costoTotal" <> 'NaN'::numeric));
ALTER TABLE "DetalleDevolucionVenta" ADD CONSTRAINT "DetalleDevolucionVenta_cantidad_ck" CHECK ("cantidad" > 0);
ALTER TABLE "DetalleDevolucionVenta" ADD CONSTRAINT "DetalleDevolucionVenta_total_ck" CHECK ("descuento" <= "subtotal" AND "total" = "subtotal" - "descuento" + "impuesto");
ALTER TABLE "DetalleDevolucionVenta" ADD CONSTRAINT "DetalleDevolucionVenta_costo_ck" CHECK ("costoTotal" = "cantidad" * "costoUnitario");
ALTER TABLE "TurnoCaja" ADD CONSTRAINT "TurnoCaja_importes_ck" CHECK (("fondoInicial" >= 0 AND "fondoInicial" <> 'NaN'::numeric) AND ("efectivoEsperado" >= 0 AND "efectivoEsperado" <> 'NaN'::numeric) AND ("efectivoContado" >= 0 AND "efectivoContado" <> 'NaN'::numeric));
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_importes_ck" CHECK (("monto" >= 0 AND "monto" <> 'NaN'::numeric));
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_monto_ck" CHECK ("monto" > 0);
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_motivo_ck" CHECK (length(btrim("motivo")) > 0);
ALTER TABLE "GastoComercial" ADD CONSTRAINT "GastoComercial_importes_ck" CHECK (("monto" >= 0 AND "monto" <> 'NaN'::numeric));
ALTER TABLE "GastoComercial" ADD CONSTRAINT "GastoComercial_monto_ck" CHECK ("monto" > 0);
ALTER TABLE "ComprobanteVenta" ADD CONSTRAINT "ComprobanteVenta_importes_ck" CHECK (("subtotal" >= 0 AND "subtotal" <> 'NaN'::numeric) AND ("descuento" >= 0 AND "descuento" <> 'NaN'::numeric) AND ("impuesto" >= 0 AND "impuesto" <> 'NaN'::numeric) AND ("total" >= 0 AND "total" <> 'NaN'::numeric));
ALTER TABLE "ComprobanteVenta" ADD CONSTRAINT "ComprobanteVenta_total_ck" CHECK ("descuento" <= "subtotal" AND "total" = "subtotal" - "descuento" + "impuesto");
ALTER TABLE "DetalleComprobanteVenta" ADD CONSTRAINT "DetalleComprobanteVenta_importes_ck" CHECK (("precioUnitario" >= 0 AND "precioUnitario" <> 'NaN'::numeric) AND ("descuento" >= 0 AND "descuento" <> 'NaN'::numeric) AND ("tasaImpuesto" >= 0 AND "tasaImpuesto" <> 'NaN'::numeric) AND ("subtotal" >= 0 AND "subtotal" <> 'NaN'::numeric) AND ("impuesto" >= 0 AND "impuesto" <> 'NaN'::numeric) AND ("total" >= 0 AND "total" <> 'NaN'::numeric));
ALTER TABLE "DetalleComprobanteVenta" ADD CONSTRAINT "DetalleComprobanteVenta_cantidad_ck" CHECK ("cantidad" > 0);
ALTER TABLE "DetalleComprobanteVenta" ADD CONSTRAINT "DetalleComprobanteVenta_total_ck" CHECK ("descuento" <= "subtotal" AND "total" = "subtotal" - "descuento" + "impuesto");
ALTER TABLE "DetalleComprobanteVenta" ADD CONSTRAINT "DetalleComprobanteVenta_tasa_ck" CHECK ("tasaImpuesto" <= 100);
ALTER TABLE "LoteInventario" ADD CONSTRAINT "LoteInventario_cantidad_fisica_ck" CHECK ("cantidadFisica" >= 0);
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_plazo_ck" CHECK ("reservaHasta" > "confirmadoAt" AND "reservaHasta" <= "confirmadoAt" + interval '1 hour');
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_estado_ck" CHECK (("estado" = 'ENTREGADO') = ("entregadoAt" IS NOT NULL) AND ("estado" = 'CANCELADO') = ("canceladoAt" IS NOT NULL) AND ("estado" <> 'CANCELADO' OR COALESCE(length(btrim("motivoCancelacion")),0) > 0));
ALTER TABLE "ReservaInventario" ADD CONSTRAINT "ReservaInventario_estado_ck" CHECK (("estado" = 'CONSUMIDA') = ("consumidaAt" IS NOT NULL) AND ("estado" IN ('LIBERADA','EXPIRADA')) = ("liberadaAt" IS NOT NULL));
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_origen_ck" CHECK (("origen" = 'PORTAL') = ("pedidoId" IS NOT NULL) AND ("pedidoId" IS NULL OR "clienteComercialId" IS NOT NULL));
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_anulacion_ck" CHECK (("estado" = 'ANULADA') = ("anuladaAt" IS NOT NULL) AND ("estado" = 'ANULADA') = ("anuladaPorId" IS NOT NULL) AND ("estado" <> 'ANULADA' OR COALESCE(length(btrim("motivoAnulacion")),0) > 0));
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_reversion_ck" CHECK (("estado" = 'REVERSADO') = ("reversadoAt" IS NOT NULL) AND ("estado" = 'REVERSADO') = ("reversadoPorId" IS NOT NULL) AND ("estado" <> 'REVERSADO' OR COALESCE(length(btrim("motivoReversion")),0) > 0));
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_efectivo_turno_ck" CHECK ("metodo" <> 'EFECTIVO' OR "turnoId" IS NOT NULL);
ALTER TABLE "Reembolso" ADD CONSTRAINT "Reembolso_efectivo_turno_ck" CHECK ("metodo" <> 'EFECTIVO' OR "turnoId" IS NOT NULL);
ALTER TABLE "GastoComercial" ADD CONSTRAINT "GastoComercial_efectivo_turno_ck" CHECK ("metodo" <> 'EFECTIVO' OR "turnoId" IS NOT NULL);
ALTER TABLE "AplicacionCobro" ADD CONSTRAINT "AplicacionCobro_cuenta_cliente_ck" CHECK ("cuentaId" IS NULL OR "clienteComercialId" IS NOT NULL);
ALTER TABLE "CuentaPorCobrar" ADD CONSTRAINT "CuentaPorCobrar_saldo_ck" CHECK ("saldo" <= "importeExigible" AND ("estado" <> 'PAGADA' OR "saldo" = 0) AND ("estado" <> 'ABIERTA' OR "saldo" > 0) AND ("estado" <> 'CANCELADA' OR "saldo" = 0));
ALTER TABLE "AjusteCuentaPorCobrar" ADD CONSTRAINT "AjusteCuentaPorCobrar_origen_ck" CHECK ("deltaImporte" <> 0 AND (("tipo"='DEVOLUCION' AND "devolucionId" IS NOT NULL AND "reversionId" IS NULL) OR ("tipo"='CORRECCION_PAGO_INICIAL' AND "reversionId" IS NOT NULL AND "devolucionId" IS NULL) OR ("tipo"='ANULACION' AND "reversionId" IS NULL AND "devolucionId" IS NULL)));
ALTER TABLE "Reembolso" ADD CONSTRAINT "Reembolso_estado_ck" CHECK (("estado" = 'CONFIRMADO') = ("confirmadoAt" IS NOT NULL));
ALTER TABLE "DevolucionVenta" ADD CONSTRAINT "DevolucionVenta_estado_ck" CHECK (("estado" = 'APROBADA') = ("aprobadaAt" IS NOT NULL) AND ("estado" = 'APROBADA') = ("aprobadaPorId" IS NOT NULL));
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_origen_ck" CHECK (num_nonnulls("cobroId","reembolsoId","gastoId") <= 1);
ALTER TABLE "TurnoCaja" ADD CONSTRAINT "TurnoCaja_cierre_ck" CHECK (("estado"='ABIERTO' AND num_nonnulls("cierreAt","cerradoPorId","efectivoEsperado","efectivoContado","diferencia")=0) OR ("estado"='CERRADO' AND num_nonnulls("cierreAt","cerradoPorId","efectivoEsperado","efectivoContado","diferencia")=5 AND "cierreAt">="aperturaAt" AND "diferencia"="efectivoContado"-"efectivoEsperado"));
ALTER TABLE "SecuenciaComprobante" ADD CONSTRAINT "SecuenciaComprobante_secuencia_ck" CHECK ("ultimoConsecutivo" >= 0);
ALTER TABLE "ComprobanteVenta" ADD CONSTRAINT "ComprobanteVenta_numero_ck" CHECK ("consecutivo" > 0 AND "numero" = 'COMP-' || "consecutivo"::text);
ALTER TABLE "ComprobanteVenta" ADD CONSTRAINT "ComprobanteVenta_anulacion_ck" CHECK (("estado"='ANULADO')=("anuladaAt" IS NOT NULL) AND ("estado"='ANULADO')=("anuladoPorId" IS NOT NULL) AND ("estado"<>'ANULADO' OR COALESCE(length(btrim("motivoAnulacion")),0)>0));
ALTER TABLE "VinculacionClienteUsuario" ADD CONSTRAINT "VinculacionClienteUsuario_fechas_ck" CHECK ("revocadaAt" IS NULL OR "revocadaAt" >= "verificadaAt");
ALTER TABLE "AuditoriaOperacion" ADD CONSTRAINT "AuditoriaOperacion_actor_ck" CHECK (("actor"='SISTEMA' AND "usuarioId" IS NULL AND "membresiaId" IS NULL) OR ("actor"='USUARIO' AND "usuarioId" IS NOT NULL AND ("membresiaId" IS NULL OR "rolCodigo" IS NOT NULL)));
ALTER TABLE "EventoSalida" ADD CONSTRAINT "EventoSalida_intentos_ck" CHECK ("intentos" >= 0 AND "version" > 0);
ALTER TABLE "EventoSalida" ADD CONSTRAINT "EventoSalida_lease_ck" CHECK (("estado"='PROCESANDO')=("leaseHasta" IS NOT NULL) AND ("leaseHasta" IS NULL)=("leaseToken" IS NULL) AND ("estado"='ENVIADO')=("enviadoAt" IS NOT NULL));
ALTER TABLE "SolicitudIdempotente" ADD CONSTRAINT "SolicitudIdempotente_resultado_ck" CHECK (("estado"='COMPLETADA')=("recursoTipo" IS NOT NULL AND "recursoId" IS NOT NULL));
ALTER TABLE "NotificacionCliente" ADD CONSTRAINT "NotificacionCliente_origen_ck" CHECK (("tipo"='ESTADO_PEDIDO' AND "pedidoId" IS NOT NULL AND "comprobanteId" IS NULL AND "cuentaId" IS NULL) OR ("tipo"='COMPROBANTE_DISPONIBLE' AND "comprobanteId" IS NOT NULL AND "pedidoId" IS NULL AND "cuentaId" IS NULL) OR ("tipo"='RECORDATORIO_DEUDA' AND "cuentaId" IS NOT NULL AND "pedidoId" IS NULL AND "comprobanteId" IS NULL));
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_datos_origen_ck" CHECK (("asignacionVentaId" IS NULL OR "loteId" IS NOT NULL) AND ("detalleDevolucionId" IS NULL OR "loteId" IS NOT NULL));
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_delta_ck" CHECK (("tipo"='RESERVA' AND "deltaFisico"=0 AND "deltaReservado">0 AND "reservaId" IS NOT NULL) OR ("tipo"='LIBERACION_RESERVA' AND "deltaFisico"=0 AND "deltaReservado"<0 AND "reservaId" IS NOT NULL) OR ("tipo"='CONSUMO_RESERVA' AND "deltaFisico"<0 AND "deltaReservado"="deltaFisico" AND "asignacionVentaId" IS NOT NULL AND "reservaId" IS NOT NULL) OR ("tipo" IN ('ENTRADA','APERTURA','DEVOLUCION') AND "deltaFisico">0 AND "deltaReservado"=0) OR ("tipo" IN ('VENTA','BAJA') AND "deltaFisico"<0 AND "deltaReservado"=0) OR ("tipo" IN ('AJUSTE','REVERSION') AND ("deltaFisico"<>0 OR "deltaReservado"<>0)));
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_origen_ck" CHECK (("tipo" IN ('APERTURA','ENTRADA') AND "entradaId" IS NOT NULL AND num_nonnulls("reservaId","asignacionVentaId","detalleDevolucionId","compraLegacyId","movimientoOriginalId")=0) OR ("tipo"='VENTA' AND num_nonnulls("asignacionVentaId","compraLegacyId")=1 AND num_nonnulls("entradaId","reservaId","detalleDevolucionId","movimientoOriginalId")=0) OR ("tipo" IN ('RESERVA','LIBERACION_RESERVA') AND "reservaId" IS NOT NULL AND num_nonnulls("entradaId","asignacionVentaId","detalleDevolucionId","compraLegacyId","movimientoOriginalId")=0) OR ("tipo"='CONSUMO_RESERVA' AND "reservaId" IS NOT NULL AND "asignacionVentaId" IS NOT NULL AND num_nonnulls("entradaId","detalleDevolucionId","compraLegacyId","movimientoOriginalId")=0) OR ("tipo"='DEVOLUCION' AND "detalleDevolucionId" IS NOT NULL AND num_nonnulls("entradaId","reservaId","asignacionVentaId","compraLegacyId","movimientoOriginalId")=0) OR ("tipo"='BAJA' AND num_nonnulls("entradaId","reservaId","asignacionVentaId","compraLegacyId","movimientoOriginalId")=0 AND COALESCE(length(btrim("motivo")),0)>0) OR ("tipo"='AJUSTE' AND num_nonnulls("entradaId","reservaId","asignacionVentaId","detalleDevolucionId","compraLegacyId","movimientoOriginalId")=0 AND COALESCE(length(btrim("motivo")),0)>0) OR ("tipo"='REVERSION' AND "movimientoOriginalId" IS NOT NULL AND num_nonnulls("entradaId","reservaId","asignacionVentaId","detalleDevolucionId","compraLegacyId")=0 AND COALESCE(length(btrim("motivo")),0)>0));
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_costo_fisico_ck" CHECK ("deltaFisico" = 0 OR ("loteId" IS NOT NULL AND "costoUnitario" IS NOT NULL AND "costoTotal" IS NOT NULL AND "costoTotal" = abs("deltaFisico"::numeric) * "costoUnitario"));

CREATE UNIQUE INDEX "Vinculacion_cliente_activo_uq" ON "VinculacionClienteUsuario" ("tenantId","clienteComercialId") WHERE "revocadaAt" IS NULL;
CREATE UNIQUE INDEX "Vinculacion_usuario_activo_uq" ON "VinculacionClienteUsuario" ("tenantId","usuarioId") WHERE "revocadaAt" IS NULL;
CREATE UNIQUE INDEX "Carrito_activo_uq" ON "Carrito" ("tenantId","clienteComercialId") WHERE "estado"='ACTIVO';
CREATE UNIQUE INDEX "TurnoCaja_abierto_uq" ON "TurnoCaja" ("tenantId","cajaId") WHERE "estado"='ABIERTO';
CREATE INDEX "ReservaInventario_activa_plazo_idx" ON "ReservaInventario" ("tenantId","reservaHasta") WHERE "estado"='ACTIVA';

ALTER TABLE "Producto" ADD CONSTRAINT "Producto_precio_finito_ck" CHECK ("precio" <> 'NaN'::numeric);
-- Se valida el estado FINAL de la transaccion; no se impone orden de insercion
-- de cabecera/detalles/cobros. Los bloqueos del padre serializan los saldos.
CREATE FUNCTION store_check_inventory(t integer, p integer) RETURNS void
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE product "Producto"%ROWTYPE; physical bigint; reserved bigint; df bigint; dr bigint;
BEGIN
 SELECT * INTO product FROM "Producto" WHERE "tenantId"=t AND id=p FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT COALESCE(sum("cantidadFisica"),0) INTO physical FROM "LoteInventario" WHERE "tenantId"=t AND "productoId"=p;
 SELECT COALESCE(sum(cantidad),0) INTO reserved FROM "ReservaInventario" WHERE "tenantId"=t AND "productoId"=p AND estado='ACTIVA';
 IF product."modoInventario"='LEGACY' THEN
  IF EXISTS(SELECT 1 FROM "LoteInventario" WHERE "tenantId"=t AND "productoId"=p)
     OR EXISTS(SELECT 1 FROM "MovimientoInventario" WHERE "tenantId"=t AND "productoId"=p)
     OR reserved<>0 THEN
   RAISE EXCEPTION 'Inventario STORE requiere apertura conciliada en modo LOTES' USING ERRCODE='23514';
  END IF;
  RETURN;
 END IF;
 SELECT COALESCE(sum("deltaFisico"),0),COALESCE(sum("deltaReservado"),0) INTO df,dr
 FROM "MovimientoInventario" WHERE "tenantId"=t AND "productoId"=p;
 IF product.stock<>physical OR product."stockReservado"<>reserved OR product.stock<>df OR product."stockReservado"<>dr THEN
  RAISE EXCEPTION 'Stock, lotes, reservas y movimientos no concilian' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM "LoteInventario" l WHERE l."tenantId"=t AND l."productoId"=p AND l."cantidadFisica" <>
   COALESCE((SELECT sum(m."deltaFisico") FROM "MovimientoInventario" m WHERE m."tenantId"=t AND m."loteId"=l.id),0)) THEN
  RAISE EXCEPTION 'Saldo de lote no concilia con su historial' USING ERRCODE='23514';
 END IF;
END $$;

CREATE FUNCTION store_inventory_deferred() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE n jsonb; o jsonb; p integer; t integer;
BEGIN
 IF TG_OP<>'DELETE' THEN n=to_jsonb(NEW); t=(n->>'tenantId')::int;
  p=CASE WHEN TG_TABLE_NAME='Producto' THEN (n->>'id')::int ELSE (n->>'productoId')::int END;
  PERFORM store_check_inventory(t,p);
 END IF;
 IF TG_OP<>'INSERT' THEN o=to_jsonb(OLD);
  p=CASE WHEN TG_TABLE_NAME='Producto' THEN (o->>'id')::int ELSE (o->>'productoId')::int END;
  IF TG_OP='DELETE' OR n->>'tenantId' IS DISTINCT FROM o->>'tenantId' OR n->>'productoId' IS DISTINCT FROM o->>'productoId' THEN
   PERFORM store_check_inventory((o->>'tenantId')::int,p);
  END IF;
 END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION store_check_cash(t integer, turn integer) RETURNS void
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE session "TurnoCaja"%ROWTYPE; expected numeric;
BEGIN
 SELECT * INTO session FROM "TurnoCaja" WHERE "tenantId"=t AND id=turn FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM "MovimientoCaja" m
  LEFT JOIN "Cobro" c ON c."tenantId"=t AND c.id=m."cobroId"
  LEFT JOIN "Reembolso" r ON r."tenantId"=t AND r.id=m."reembolsoId"
  LEFT JOIN "GastoComercial" g ON g."tenantId"=t AND g.id=m."gastoId"
  WHERE m."tenantId"=t AND m."turnoId"=turn AND (
   (m."cobroId" IS NOT NULL AND (c.metodo<>'EFECTIVO' OR m.tipo<>'ENTRADA' OR m.monto<>c.monto)) OR
   (m."reembolsoId" IS NOT NULL AND (r.metodo<>'EFECTIVO' OR r.estado<>'CONFIRMADO' OR m.tipo<>'SALIDA' OR m.monto<>r.monto)) OR
   (m."gastoId" IS NOT NULL AND (g.metodo<>'EFECTIVO' OR m.tipo<>'SALIDA' OR m.monto<>g.monto)))) THEN
  RAISE EXCEPTION 'Movimiento de caja incompatible con origen' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM "Cobro" c WHERE c."tenantId"=t AND c."turnoId"=turn AND c.metodo='EFECTIVO'
    AND NOT EXISTS(SELECT 1 FROM "MovimientoCaja" m WHERE m."tenantId"=t AND m."cobroId"=c.id)) OR
    EXISTS(SELECT 1 FROM "Reembolso" r WHERE r."tenantId"=t AND r."turnoId"=turn AND r.metodo='EFECTIVO' AND r.estado='CONFIRMADO'
    AND NOT EXISTS(SELECT 1 FROM "MovimientoCaja" m WHERE m."tenantId"=t AND m."reembolsoId"=r.id)) OR
    EXISTS(SELECT 1 FROM "GastoComercial" g WHERE g."tenantId"=t AND g."turnoId"=turn AND g.metodo='EFECTIVO'
    AND NOT EXISTS(SELECT 1 FROM "MovimientoCaja" m WHERE m."tenantId"=t AND m."gastoId"=g.id)) THEN
  RAISE EXCEPTION 'Operacion de efectivo sin movimiento de caja' USING ERRCODE='23514';
 END IF;
 SELECT session."fondoInicial"+COALESCE(sum(CASE WHEN tipo='ENTRADA' THEN monto ELSE -monto END),0)
 INTO expected FROM "MovimientoCaja" WHERE "tenantId"=t AND "turnoId"=turn;
 IF session.estado='CERRADO' AND session."efectivoEsperado"<>expected THEN
  RAISE EXCEPTION 'Cierre de caja no concilia' USING ERRCODE='23514';
 END IF;
END $$;

CREATE FUNCTION store_cash_deferred() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE j jsonb;
BEGIN
 IF TG_OP<>'DELETE' THEN j=to_jsonb(NEW);
  PERFORM store_check_cash((j->>'tenantId')::int,CASE WHEN TG_TABLE_NAME='TurnoCaja' THEN (j->>'id')::int ELSE (j->>'turnoId')::int END);
 END IF;
 IF TG_OP<>'INSERT' THEN j=to_jsonb(OLD);
  PERFORM store_check_cash((j->>'tenantId')::int,CASE WHEN TG_TABLE_NAME='TurnoCaja' THEN (j->>'id')::int ELSE (j->>'turnoId')::int END);
 END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION store_check_receipt(t integer, doc integer) RETURNS void
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE d "ComprobanteVenta"%ROWTYPE; v "Venta"%ROWTYPE;
BEGIN
 SELECT * INTO d FROM "ComprobanteVenta" WHERE "tenantId"=t AND id=doc;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT * INTO v FROM "Venta" WHERE "tenantId"=t AND id=d."ventaId" FOR UPDATE;
 PERFORM 1 FROM "SecuenciaComprobante" WHERE "tenantId"=t FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM "SecuenciaComprobante" WHERE "tenantId"=t AND "ultimoConsecutivo">=d.consecutivo) THEN
  RAISE EXCEPTION 'Comprobante sin asignacion de secuencia' USING ERRCODE='23514';
 END IF;
 IF d."clienteComercialId" IS DISTINCT FROM v."clienteComercialId" OR
    (d.subtotal,d.descuento,d.impuesto,d.total) IS DISTINCT FROM (v.subtotal,v.descuento,v.impuesto,v.total) THEN
  RAISE EXCEPTION 'Comprobante no corresponde a venta' USING ERRCODE='23514';
 END IF;
 IF (SELECT count(*) FROM "DetalleComprobanteVenta" WHERE "tenantId"=t AND "comprobanteId"=doc)<>
    (SELECT count(*) FROM "DetalleVenta" WHERE "tenantId"=t AND "ventaId"=v.id) OR
    EXISTS(SELECT 1 FROM "DetalleComprobanteVenta" x JOIN "DetalleVenta" y ON y."tenantId"=t AND y.id=x."detalleVentaId"
     WHERE x."tenantId"=t AND x."comprobanteId"=doc AND
     (x.cantidad,x."precioUnitario",x.descuento,x.subtotal,x.impuesto,x.total,x."tasaImpuesto") IS DISTINCT FROM
     (y.cantidad,y."precioUnitario",y.descuento,y.subtotal,y.impuesto,y.total,y."tasaImpuesto")) THEN
  RAISE EXCEPTION 'Detalles de comprobante no corresponden a venta' USING ERRCODE='23514';
 END IF;
 IF (d.estado='ANULADO') IS DISTINCT FROM (v.estado='ANULADA') THEN
  RAISE EXCEPTION 'Estado de comprobante no corresponde a venta' USING ERRCODE='23514';
 END IF;
END $$;

CREATE FUNCTION store_check_sale(t integer, sale integer) RETURNS void
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v "Venta"%ROWTYPE; a "CuentaPorCobrar"%ROWTYPE; net numeric; paid numeric; applied_account numeric; exigible numeric; doc integer;
BEGIN
 SELECT * INTO v FROM "Venta" WHERE "tenantId"=t AND id=sale FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM "DetalleVenta" WHERE "tenantId"=t AND "ventaId"=sale) OR
  (SELECT ROW(COALESCE(sum(subtotal),0),COALESCE(sum(descuento),0),COALESCE(sum(impuesto),0),COALESCE(sum(total),0)) FROM "DetalleVenta" WHERE "tenantId"=t AND "ventaId"=sale)
  IS DISTINCT FROM ROW(v.subtotal,v.descuento,v.impuesto,v.total) THEN
  RAISE EXCEPTION 'Cabecera y detalles de venta no concilian' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM "DetalleVenta" d WHERE d."tenantId"=t AND d."ventaId"=sale AND d.cantidad<>
   COALESCE((SELECT sum(x.cantidad) FROM "AsignacionLoteVenta" x WHERE x."tenantId"=t AND x."detalleVentaId"=d.id),0)) THEN
  RAISE EXCEPTION 'Venta sin asignacion completa de lotes manuales' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM "AsignacionLoteVenta" a WHERE a."tenantId"=t AND a."ventaId"=sale AND a.cantidad<>
   COALESCE((SELECT -sum(m."deltaFisico") FROM "MovimientoInventario" m WHERE m."tenantId"=t AND m."asignacionVentaId"=a.id AND m.tipo IN ('VENTA','CONSUMO_RESERVA')),0)) THEN
  RAISE EXCEPTION 'Venta sin salida fisica unica por asignacion' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM "AplicacionCobro" x JOIN "Cobro" c ON c."tenantId"=t AND c.id=x."cobroId"
  WHERE x."tenantId"=t AND x."ventaId"=sale AND (x."clienteComercialId" IS DISTINCT FROM v."clienteComercialId" OR c."clienteComercialId" IS DISTINCT FROM v."clienteComercialId")) THEN
  RAISE EXCEPTION 'Cliente de aplicacion/cobro no coincide con venta' USING ERRCODE='23514';
 END IF;
 SELECT COALESCE(sum(x.monto),0) INTO paid FROM "AplicacionCobro" x JOIN "Cobro" c ON c."tenantId"=t AND c.id=x."cobroId"
  WHERE x."tenantId"=t AND x."ventaId"=sale AND c.estado='CONFIRMADO'
  AND NOT EXISTS(SELECT 1 FROM "ReversionAplicacionCobro" r WHERE r."tenantId"=t AND r."aplicacionId"=x.id);
 net=v.total-COALESCE((SELECT sum(total) FROM "DevolucionVenta" WHERE "tenantId"=t AND "ventaId"=sale AND estado='APROBADA'),0);
 SELECT * INTO a FROM "CuentaPorCobrar" WHERE "tenantId"=t AND "ventaId"=sale FOR UPDATE;
 IF FOUND THEN
  SELECT a."importeFinanciadoInicial"+COALESCE(sum("deltaImporte"),0) INTO exigible FROM "AjusteCuentaPorCobrar" WHERE "tenantId"=t AND "cuentaId"=a.id;
  SELECT COALESCE(sum(x.monto),0) INTO applied_account FROM "AplicacionCobro" x JOIN "Cobro" c ON c."tenantId"=t AND c.id=x."cobroId"
   WHERE x."tenantId"=t AND x."cuentaId"=a.id AND c.estado='CONFIRMADO' AND NOT EXISTS(SELECT 1 FROM "ReversionAplicacionCobro" r WHERE r."tenantId"=t AND r."aplicacionId"=x.id);
  IF a."importeExigible"<>exigible OR a.saldo<>exigible-applied_account THEN
   RAISE EXCEPTION 'Cuenta por cobrar no concilia con aplicaciones/ajustes' USING ERRCODE='23514';
  END IF;
  IF v.estado='ANULADA' THEN
   IF a.estado<>'CANCELADA' OR a.saldo<>0 THEN RAISE EXCEPTION 'Cuenta de venta anulada debe cancelarse' USING ERRCODE='23514'; END IF;
  ELSIF a.estado='CANCELADA' OR a.saldo<>net-paid THEN
   RAISE EXCEPTION 'Saldo comercial distinto de saldo de venta' USING ERRCODE='23514';
  END IF;
 ELSIF v.estado='COMPLETADA' AND net<>paid THEN
  RAISE EXCEPTION 'Venta con saldo requiere cuenta por cobrar identificada' USING ERRCODE='23514';
 END IF;
 IF net<0 OR (v.estado='COMPLETADA' AND paid>net) OR (v.estado='ANULADA' AND paid<>0) THEN
  RAISE EXCEPTION 'Aplicaciones exceden saldo o permanecen en venta anulada' USING ERRCODE='23514';
 END IF;
 FOR doc IN SELECT id FROM "ComprobanteVenta" WHERE "tenantId"=t AND "ventaId"=sale LOOP PERFORM store_check_receipt(t,doc); END LOOP;
END $$;

CREATE FUNCTION store_check_payment(t integer, payment integer) RETURNS void
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE c "Cobro"%ROWTYPE; used numeric; refunded numeric; sale integer;
BEGIN
 SELECT * INTO c FROM "Cobro" WHERE "tenantId"=t AND id=payment FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT COALESCE(sum(x.monto),0) INTO used FROM "AplicacionCobro" x WHERE x."tenantId"=t AND x."cobroId"=payment
  AND NOT EXISTS(SELECT 1 FROM "ReversionAplicacionCobro" r WHERE r."tenantId"=t AND r."aplicacionId"=x.id);
 SELECT COALESCE(sum(monto),0) INTO refunded FROM "Reembolso" WHERE "tenantId"=t AND "cobroId"=payment AND estado='CONFIRMADO';
 IF used+refunded>c.monto OR (c.estado='REVERSADO' AND used<>0) THEN
  RAISE EXCEPTION 'Cobro sobreaplicado, reembolsado en exceso o reversado con aplicaciones' USING ERRCODE='23514';
 END IF;
 FOR sale IN SELECT DISTINCT "ventaId" FROM "AplicacionCobro" WHERE "tenantId"=t AND "cobroId"=payment LOOP PERFORM store_check_sale(t,sale); END LOOP;
END $$;

CREATE FUNCTION store_finance_deferred() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE j jsonb; t integer; sale integer; payment integer; doc integer;
BEGIN
 IF TG_OP='DELETE' THEN j=to_jsonb(OLD); ELSE j=to_jsonb(NEW); END IF;
 t=(j->>'tenantId')::int; sale=(j->>'ventaId')::int; payment=(j->>'cobroId')::int;
 IF TG_TABLE_NAME='Venta' THEN sale=(j->>'id')::int; END IF;
 IF TG_TABLE_NAME='Cobro' THEN payment=(j->>'id')::int; END IF;
 IF TG_TABLE_NAME='ReversionAplicacionCobro' THEN SELECT "cobroId" INTO payment FROM "AplicacionCobro" WHERE "tenantId"=t AND id=(j->>'aplicacionId')::int; END IF;
 -- Orden fijo cobro -> venta -> cuenta. Servicios futuros deben seguirlo tambien.
 IF payment IS NOT NULL THEN PERFORM store_check_payment(t,payment); END IF;
 IF sale IS NOT NULL THEN PERFORM store_check_sale(t,sale); END IF;
 IF TG_TABLE_NAME='DetalleComprobanteVenta' THEN PERFORM store_check_receipt(t,(j->>'comprobanteId')::int); END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION store_check_return() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE j jsonb; t integer; d integer; header "DevolucionVenta"%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN j=to_jsonb(OLD); ELSE j=to_jsonb(NEW); END IF;
 t=(j->>'tenantId')::int; d=CASE WHEN TG_TABLE_NAME='DevolucionVenta' THEN (j->>'id')::int ELSE (j->>'devolucionId')::int END;
 SELECT * INTO header FROM "DevolucionVenta" WHERE "tenantId"=t AND id=d FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF header.estado='APROBADA' THEN
  IF NOT EXISTS(SELECT 1 FROM "DetalleDevolucionVenta" WHERE "tenantId"=t AND "devolucionId"=d) OR
     (SELECT ROW(COALESCE(sum(subtotal),0),COALESCE(sum(descuento),0),COALESCE(sum(impuesto),0),COALESCE(sum(total),0)) FROM "DetalleDevolucionVenta" WHERE "tenantId"=t AND "devolucionId"=d)
     IS DISTINCT FROM ROW(header.subtotal,header.descuento,header.impuesto,header.total) THEN
   RAISE EXCEPTION 'Devolucion sin detalles conciliados' USING ERRCODE='23514';
  END IF;
  PERFORM 1 FROM "AsignacionLoteVenta" WHERE "tenantId"=t AND "ventaId"=header."ventaId" ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM "AsignacionLoteVenta" a WHERE a."tenantId"=t AND a."ventaId"=header."ventaId" AND a.cantidad<
   COALESCE((SELECT sum(x.cantidad) FROM "DetalleDevolucionVenta" x JOIN "DevolucionVenta" h ON h."tenantId"=t AND h.id=x."devolucionId" WHERE x."tenantId"=t AND x."asignacionVentaId"=a.id AND h.estado='APROBADA'),0)) THEN
   RAISE EXCEPTION 'Se devuelve mas de la cantidad vendida' USING ERRCODE='23514';
  END IF;
 END IF;
 PERFORM store_check_sale(t,header."ventaId");
 RETURN NULL;
END $$;

CREATE FUNCTION store_lifecycle_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE p "Pedido"%ROWTYPE; original jsonb; current_row jsonb;
BEGIN
 IF TG_OP='UPDATE' THEN
  original=to_jsonb(OLD); current_row=to_jsonb(NEW);
  IF (current_row->>'tenantId') IS DISTINCT FROM (original->>'tenantId') OR (current_row->>'id') IS DISTINCT FROM (original->>'id') THEN
   RAISE EXCEPTION 'La identidad de una operacion no puede cambiar' USING ERRCODE='23514';
  END IF;
 END IF;
 IF TG_TABLE_NAME='Pedido' AND TG_OP='UPDATE' THEN
  IF NEW."reservaHasta"<>OLD."reservaHasta" OR NEW."confirmadoAt"<>OLD."confirmadoAt" OR
     ROW(NEW.subtotal,NEW.descuento,NEW.impuesto,NEW.total,NEW."clienteComercialId") IS DISTINCT FROM ROW(OLD.subtotal,OLD.descuento,OLD.impuesto,OLD.total,OLD."clienteComercialId") THEN
   RAISE EXCEPTION 'Pedido confirmado conserva plazo y precio' USING ERRCODE='23514';
  END IF;
  IF NEW.estado<>OLD.estado AND NOT ((OLD.estado='CONFIRMADO' AND NEW.estado IN ('EN_PREPARACION','CANCELADO','EXPIRADO')) OR (OLD.estado='EN_PREPARACION' AND NEW.estado IN ('ENTREGADO','CANCELADO','EXPIRADO'))) THEN
   RAISE EXCEPTION 'Transicion de pedido invalida' USING ERRCODE='23514';
  END IF;
  IF NEW.estado='ENTREGADO' AND OLD.estado<>'ENTREGADO' AND clock_timestamp()>=NEW."reservaHasta" THEN
   RAISE EXCEPTION 'Pedido vencido requiere un nuevo pedido' USING ERRCODE='23514';
  END IF;
 ELSIF TG_TABLE_NAME='ReservaInventario' THEN
  SELECT * INTO p FROM "Pedido" WHERE "tenantId"=NEW."tenantId" AND id=NEW."pedidoId" FOR UPDATE;
  IF NEW."reservaHasta"<>p."reservaHasta" OR NOT EXISTS(SELECT 1 FROM "DetallePedido" d WHERE d."tenantId"=NEW."tenantId" AND d.id=NEW."detallePedidoId" AND d.cantidad=NEW.cantidad) THEN
   RAISE EXCEPTION 'Reserva no corresponde al pedido/detalle' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
   IF ROW(NEW."reservaHasta",NEW.cantidad,NEW."productoId",NEW."pedidoId",NEW."detallePedidoId") IS DISTINCT FROM ROW(OLD."reservaHasta",OLD.cantidad,OLD."productoId",OLD."pedidoId",OLD."detallePedidoId") OR
      (NEW.estado<>OLD.estado AND OLD.estado<>'ACTIVA') THEN
    RAISE EXCEPTION 'Reserva no se extiende ni se reutiliza' USING ERRCODE='23514';
   END IF;
  END IF;
  IF NEW.estado IN ('ACTIVA','CONSUMIDA') AND (TG_OP='INSERT' OR NEW.estado IS DISTINCT FROM OLD.estado) AND clock_timestamp()>=NEW."reservaHasta" THEN
   RAISE EXCEPTION 'Reserva vencida no puede crearse ni consumirse' USING ERRCODE='23514';
  END IF;
 ELSIF TG_TABLE_NAME='TurnoCaja' AND TG_OP='UPDATE' THEN
  IF OLD.estado='CERRADO' OR ROW(NEW."fondoInicial",NEW."cajaId",NEW."cajeroId",NEW."aperturaAt") IS DISTINCT FROM ROW(OLD."fondoInicial",OLD."cajaId",OLD."cajeroId",OLD."aperturaAt") THEN
   RAISE EXCEPTION 'No modificar turno cerrado ni apertura historica' USING ERRCODE='23514';
  END IF;
 ELSIF TG_TABLE_NAME='MovimientoCaja' AND TG_OP='INSERT' THEN
  PERFORM 1 FROM "TurnoCaja" WHERE "tenantId"=NEW."tenantId" AND id=NEW."turnoId" AND estado='ABIERTO' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Turno cerrado no admite movimientos' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='AsignacionLoteVenta' AND TG_OP='INSERT' THEN
  IF NOT EXISTS(SELECT 1 FROM "LoteInventario" l WHERE l."tenantId"=NEW."tenantId" AND l.id=NEW."loteId" AND l."costoUnitario"=NEW."costoUnitario" AND (l.vencimiento IS NULL OR l.vencimiento>clock_timestamp())) THEN
   RAISE EXCEPTION 'Lote vencido o costo historico incorrecto' USING ERRCODE='23514';
  END IF;
 ELSIF TG_TABLE_NAME='SecuenciaComprobante' AND TG_OP='UPDATE' THEN
  IF NEW."ultimoConsecutivo"<OLD."ultimoConsecutivo" THEN RAISE EXCEPTION 'No reutilizar numeros de comprobante' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='ComprobanteVenta' AND TG_OP='UPDATE' THEN
  IF (current_row - ARRAY['estado','anuladaAt','anuladoPorId','motivoAnulacion','updatedAt']) IS DISTINCT FROM (original - ARRAY['estado','anuladaAt','anuladoPorId','motivoAnulacion','updatedAt']) OR OLD.estado='ANULADO' THEN
   RAISE EXCEPTION 'Comprobante emitido es historico; solo permite anulacion' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION store_immutable_operation() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
 RAISE EXCEPTION 'Registro historico inmutable: usar operacion de reversion' USING ERRCODE='23514';
END $$;

CREATE FUNCTION store_order_deferred() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE j jsonb; t integer; order_id integer; p "Pedido"%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN j=to_jsonb(OLD); ELSE j=to_jsonb(NEW); END IF;
 t=(j->>'tenantId')::int;
 IF TG_TABLE_NAME='Pedido' THEN order_id=(j->>'id')::int;
 ELSIF TG_TABLE_NAME='MovimientoInventario' THEN
  SELECT "pedidoId" INTO order_id FROM "ReservaInventario" WHERE "tenantId"=t AND id=(j->>'reservaId')::int;
 ELSE order_id=(j->>'pedidoId')::int; END IF;
 IF order_id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO p FROM "Pedido" WHERE "tenantId"=t AND id=order_id FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM "DetallePedido" WHERE "tenantId"=t AND "pedidoId"=order_id) OR
  (SELECT ROW(COALESCE(sum(subtotal),0),COALESCE(sum(descuento),0),COALESCE(sum(impuesto),0),COALESCE(sum(total),0)) FROM "DetallePedido" WHERE "tenantId"=t AND "pedidoId"=order_id)
   IS DISTINCT FROM ROW(p.subtotal,p.descuento,p.impuesto,p.total) THEN
  RAISE EXCEPTION 'Pedido sin detalles conciliados' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM "DetallePedido" d LEFT JOIN "ReservaInventario" r ON r."tenantId"=t AND r."detallePedidoId"=d.id
   WHERE d."tenantId"=t AND d."pedidoId"=order_id AND (r.id IS NULL OR r.cantidad<>d.cantidad OR r."reservaHasta"<>p."reservaHasta" OR
   (p.estado IN ('CONFIRMADO','EN_PREPARACION') AND r.estado<>'ACTIVA') OR (p.estado='ENTREGADO' AND r.estado<>'CONSUMIDA') OR
   (p.estado IN ('CANCELADO','EXPIRADO') AND r.estado NOT IN ('LIBERADA','EXPIRADA')))) THEN
  RAISE EXCEPTION 'Pedido y reservas tienen estados incompatibles' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM "ReservaInventario" r WHERE r."tenantId"=t AND r."pedidoId"=order_id AND
   COALESCE((SELECT sum(m."deltaReservado") FROM "MovimientoInventario" m WHERE m."tenantId"=t AND m."reservaId"=r.id),0) <>
   CASE WHEN r.estado='ACTIVA' THEN r.cantidad ELSE 0 END) THEN
  RAISE EXCEPTION 'Reserva y movimientos no concilian' USING ERRCODE='23514';
 END IF;
 IF (p.estado='ENTREGADO') IS DISTINCT FROM EXISTS(SELECT 1 FROM "Venta" WHERE "tenantId"=t AND "pedidoId"=order_id) THEN
  RAISE EXCEPTION 'Solo un pedido entregado tiene venta' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM "Venta" v WHERE v."tenantId"=t AND v."pedidoId"=order_id AND
   (ROW(v.subtotal,v.descuento,v.impuesto,v.total) IS DISTINCT FROM ROW(p.subtotal,p.descuento,p.impuesto,p.total) OR
    EXISTS(SELECT 1 FROM "DetallePedido" d WHERE d."tenantId"=t AND d."pedidoId"=order_id AND NOT EXISTS
    (SELECT 1 FROM "DetalleVenta" x WHERE x."tenantId"=t AND x."ventaId"=v.id AND x."productoId"=d."productoId" AND
     ROW(x.cantidad,x."precioUnitario",x.descuento,x.subtotal,x.impuesto,x.total) IS NOT DISTINCT FROM ROW(d.cantidad,d."precioUnitario",d.descuento,d.subtotal,d.impuesto,d.total))))) THEN
  RAISE EXCEPTION 'Venta de retiro no conserva precio y cantidades reservadas' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER "Producto_inventario_ct" AFTER INSERT OR UPDATE OR DELETE ON "Producto" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_inventory_deferred();

CREATE CONSTRAINT TRIGGER "LoteInventario_inventario_ct" AFTER INSERT OR UPDATE OR DELETE ON "LoteInventario" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_inventory_deferred();

CREATE CONSTRAINT TRIGGER "ReservaInventario_inventario_ct" AFTER INSERT OR UPDATE OR DELETE ON "ReservaInventario" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_inventory_deferred();

CREATE CONSTRAINT TRIGGER "MovimientoInventario_inventario_ct" AFTER INSERT OR UPDATE OR DELETE ON "MovimientoInventario" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_inventory_deferred();

CREATE CONSTRAINT TRIGGER "TurnoCaja_caja_ct" AFTER INSERT OR UPDATE OR DELETE ON "TurnoCaja" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_cash_deferred();

CREATE CONSTRAINT TRIGGER "MovimientoCaja_caja_ct" AFTER INSERT OR UPDATE OR DELETE ON "MovimientoCaja" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_cash_deferred();

CREATE CONSTRAINT TRIGGER "Cobro_caja_ct" AFTER INSERT OR UPDATE OR DELETE ON "Cobro" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_cash_deferred();

CREATE CONSTRAINT TRIGGER "Reembolso_caja_ct" AFTER INSERT OR UPDATE OR DELETE ON "Reembolso" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_cash_deferred();

CREATE CONSTRAINT TRIGGER "GastoComercial_caja_ct" AFTER INSERT OR UPDATE OR DELETE ON "GastoComercial" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_cash_deferred();

CREATE CONSTRAINT TRIGGER "Venta_finanzas_ct" AFTER INSERT OR UPDATE OR DELETE ON "Venta" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_finance_deferred();

CREATE CONSTRAINT TRIGGER "DetalleVenta_finanzas_ct" AFTER INSERT OR UPDATE OR DELETE ON "DetalleVenta" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_finance_deferred();

CREATE CONSTRAINT TRIGGER "AsignacionLoteVenta_finanzas_ct" AFTER INSERT OR UPDATE OR DELETE ON "AsignacionLoteVenta" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_finance_deferred();

CREATE CONSTRAINT TRIGGER "Cobro_finanzas_ct" AFTER INSERT OR UPDATE OR DELETE ON "Cobro" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_finance_deferred();

CREATE CONSTRAINT TRIGGER "AplicacionCobro_finanzas_ct" AFTER INSERT OR UPDATE OR DELETE ON "AplicacionCobro" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_finance_deferred();

CREATE CONSTRAINT TRIGGER "ReversionAplicacionCobro_finanzas_ct" AFTER INSERT OR UPDATE OR DELETE ON "ReversionAplicacionCobro" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_finance_deferred();

CREATE CONSTRAINT TRIGGER "CuentaPorCobrar_finanzas_ct" AFTER INSERT OR UPDATE OR DELETE ON "CuentaPorCobrar" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_finance_deferred();

CREATE CONSTRAINT TRIGGER "AjusteCuentaPorCobrar_finanzas_ct" AFTER INSERT OR UPDATE OR DELETE ON "AjusteCuentaPorCobrar" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_finance_deferred();

CREATE CONSTRAINT TRIGGER "Reembolso_finanzas_ct" AFTER INSERT OR UPDATE OR DELETE ON "Reembolso" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_finance_deferred();

CREATE CONSTRAINT TRIGGER "ComprobanteVenta_finanzas_ct" AFTER INSERT OR UPDATE OR DELETE ON "ComprobanteVenta" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_finance_deferred();

CREATE CONSTRAINT TRIGGER "DetalleComprobanteVenta_finanzas_ct" AFTER INSERT OR UPDATE OR DELETE ON "DetalleComprobanteVenta" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_finance_deferred();

CREATE CONSTRAINT TRIGGER "DevolucionVenta_devolucion_ct" AFTER INSERT OR UPDATE OR DELETE ON "DevolucionVenta" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_check_return();

CREATE CONSTRAINT TRIGGER "DetalleDevolucionVenta_devolucion_ct" AFTER INSERT OR UPDATE OR DELETE ON "DetalleDevolucionVenta" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_check_return();

CREATE CONSTRAINT TRIGGER "Pedido_pedido_ct" AFTER INSERT OR UPDATE OR DELETE ON "Pedido" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_order_deferred();

CREATE CONSTRAINT TRIGGER "DetallePedido_pedido_ct" AFTER INSERT OR UPDATE OR DELETE ON "DetallePedido" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_order_deferred();

CREATE CONSTRAINT TRIGGER "ReservaInventario_pedido_ct" AFTER INSERT OR UPDATE OR DELETE ON "ReservaInventario" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_order_deferred();

CREATE CONSTRAINT TRIGGER "MovimientoInventario_pedido_ct" AFTER INSERT OR UPDATE OR DELETE ON "MovimientoInventario" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_order_deferred();

CREATE CONSTRAINT TRIGGER "Venta_pedido_ct" AFTER INSERT OR UPDATE OR DELETE ON "Venta" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_order_deferred();

CREATE TRIGGER "Pedido_ciclo_bt" BEFORE INSERT OR UPDATE ON "Pedido" FOR EACH ROW EXECUTE FUNCTION store_lifecycle_guard();

CREATE TRIGGER "ReservaInventario_ciclo_bt" BEFORE INSERT OR UPDATE ON "ReservaInventario" FOR EACH ROW EXECUTE FUNCTION store_lifecycle_guard();

CREATE TRIGGER "TurnoCaja_ciclo_bt" BEFORE INSERT OR UPDATE ON "TurnoCaja" FOR EACH ROW EXECUTE FUNCTION store_lifecycle_guard();

CREATE TRIGGER "MovimientoCaja_ciclo_bt" BEFORE INSERT OR UPDATE ON "MovimientoCaja" FOR EACH ROW EXECUTE FUNCTION store_lifecycle_guard();

CREATE TRIGGER "AsignacionLoteVenta_ciclo_bt" BEFORE INSERT OR UPDATE ON "AsignacionLoteVenta" FOR EACH ROW EXECUTE FUNCTION store_lifecycle_guard();

CREATE TRIGGER "SecuenciaComprobante_ciclo_bt" BEFORE INSERT OR UPDATE ON "SecuenciaComprobante" FOR EACH ROW EXECUTE FUNCTION store_lifecycle_guard();

CREATE TRIGGER "ComprobanteVenta_ciclo_bt" BEFORE INSERT OR UPDATE ON "ComprobanteVenta" FOR EACH ROW EXECUTE FUNCTION store_lifecycle_guard();

CREATE TRIGGER "MovimientoInventario_inmutable_bt" BEFORE UPDATE OR DELETE ON "MovimientoInventario" FOR EACH ROW EXECUTE FUNCTION store_immutable_operation();

CREATE TRIGGER "MovimientoCaja_inmutable_bt" BEFORE UPDATE OR DELETE ON "MovimientoCaja" FOR EACH ROW EXECUTE FUNCTION store_immutable_operation();

CREATE TRIGGER "DetallePedido_inmutable_bt" BEFORE UPDATE OR DELETE ON "DetallePedido" FOR EACH ROW EXECUTE FUNCTION store_immutable_operation();

CREATE TRIGGER "DetalleVenta_inmutable_bt" BEFORE UPDATE OR DELETE ON "DetalleVenta" FOR EACH ROW EXECUTE FUNCTION store_immutable_operation();

CREATE TRIGGER "AsignacionLoteVenta_inmutable_bt" BEFORE UPDATE OR DELETE ON "AsignacionLoteVenta" FOR EACH ROW EXECUTE FUNCTION store_immutable_operation();

CREATE TRIGGER "AplicacionCobro_inmutable_bt" BEFORE UPDATE OR DELETE ON "AplicacionCobro" FOR EACH ROW EXECUTE FUNCTION store_immutable_operation();

CREATE TRIGGER "ReversionAplicacionCobro_inmutable_bt" BEFORE UPDATE OR DELETE ON "ReversionAplicacionCobro" FOR EACH ROW EXECUTE FUNCTION store_immutable_operation();

CREATE TRIGGER "AjusteCuentaPorCobrar_inmutable_bt" BEFORE UPDATE OR DELETE ON "AjusteCuentaPorCobrar" FOR EACH ROW EXECUTE FUNCTION store_immutable_operation();

CREATE TRIGGER "DetalleComprobanteVenta_inmutable_bt" BEFORE UPDATE OR DELETE ON "DetalleComprobanteVenta" FOR EACH ROW EXECUTE FUNCTION store_immutable_operation();

CREATE TRIGGER "AuditoriaOperacion_inmutable_bt" BEFORE UPDATE OR DELETE ON "AuditoriaOperacion" FOR EACH ROW EXECUTE FUNCTION store_immutable_operation();

CREATE TRIGGER "HistorialEstadoPedido_inmutable_bt" BEFORE UPDATE OR DELETE ON "HistorialEstadoPedido" FOR EACH ROW EXECUTE FUNCTION store_immutable_operation();

CREATE TRIGGER "Venta_sin_borrado_bt" BEFORE DELETE ON "Venta" FOR EACH ROW EXECUTE FUNCTION store_immutable_operation();

CREATE TRIGGER "Cobro_sin_borrado_bt" BEFORE DELETE ON "Cobro" FOR EACH ROW EXECUTE FUNCTION store_immutable_operation();

CREATE TRIGGER "CuentaPorCobrar_sin_borrado_bt" BEFORE DELETE ON "CuentaPorCobrar" FOR EACH ROW EXECUTE FUNCTION store_immutable_operation();

CREATE TRIGGER "Reembolso_sin_borrado_bt" BEFORE DELETE ON "Reembolso" FOR EACH ROW EXECUTE FUNCTION store_immutable_operation();

CREATE TRIGGER "DevolucionVenta_sin_borrado_bt" BEFORE DELETE ON "DevolucionVenta" FOR EACH ROW EXECUTE FUNCTION store_immutable_operation();

CREATE TRIGGER "ComprobanteVenta_sin_borrado_bt" BEFORE DELETE ON "ComprobanteVenta" FOR EACH ROW EXECUTE FUNCTION store_immutable_operation();

CREATE TRIGGER "Pedido_sin_borrado_bt" BEFORE DELETE ON "Pedido" FOR EACH ROW EXECUTE FUNCTION store_immutable_operation();

CREATE TRIGGER "ReservaInventario_sin_borrado_bt" BEFORE DELETE ON "ReservaInventario" FOR EACH ROW EXECUTE FUNCTION store_immutable_operation();

CREATE TRIGGER "TurnoCaja_sin_borrado_bt" BEFORE DELETE ON "TurnoCaja" FOR EACH ROW EXECUTE FUNCTION store_immutable_operation();

CREATE TRIGGER "SecuenciaComprobante_sin_borrado_bt" BEFORE DELETE ON "SecuenciaComprobante" FOR EACH ROW EXECUTE FUNCTION store_immutable_operation();

COMMIT;
