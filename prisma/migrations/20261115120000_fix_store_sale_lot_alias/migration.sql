-- Disambiguate the lot assignment alias from the account record in PL/pgSQL.
CREATE OR REPLACE FUNCTION store_check_sale(t integer, sale integer) RETURNS void
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
 IF EXISTS(SELECT 1 FROM "AsignacionLoteVenta" asignacion WHERE asignacion."tenantId"=t AND asignacion."ventaId"=sale AND asignacion.cantidad<>
   COALESCE((SELECT -sum(m."deltaFisico") FROM "MovimientoInventario" m WHERE m."tenantId"=t AND m."asignacionVentaId"=asignacion.id AND m.tipo IN ('VENTA','CONSUMO_RESERVA')),0)) THEN
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
