import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { db, leerDatos } from './entorno.mjs';

const dia = 86_400_000;
const dinero = (centavos) => (centavos / 100).toFixed(2);
const motivo = 'Historial sintético A14';

async function loteHistorico(tx, actor, clave, fecha, cantidad, precio) {
  const producto = await tx.producto.create({
    data: {
      tenantId: actor.tenantId,
      nombre: `${motivo} ${precio}`,
      precio,
      stock: 0,
      estado: true,
      modoInventario: 'LOTES',
    },
  });
  const entrada = await tx.entradaInventario.create({
    data: { ...actor, fecha, motivo, claveIdempotencia: clave },
  });
  const lote = await tx.loteInventario.create({
    data: {
      tenantId: actor.tenantId,
      productoId: producto.id,
      entradaId: entrada.id,
      codigo: 'HIST',
      fechaEntrada: fecha,
      cantidadFisica: 0,
      costoUnitario: 1,
      esApertura: true,
    },
  });
  await tx.movimientoInventario.create({
    data: {
      ...actor,
      productoId: producto.id,
      loteId: lote.id,
      entradaId: entrada.id,
      fecha,
      tipo: 'APERTURA',
      deltaFisico: cantidad,
      deltaReservado: 0,
      costoUnitario: 1,
      costoTotal: cantidad,
      motivo,
      claveIdempotencia: `${clave}:apertura`,
      correlacionId: randomUUID(),
    },
  });
  return {
    productoId: producto.id,
    loteId: lote.id,
    nombreProducto: producto.nombre,
    precioUnitario: precio,
  };
}

async function cargarLote(
  tx,
  actor,
  cajaId,
  clienteComercialId,
  inicio,
  ventas,
  fecha,
) {
  const { tenantId, responsableId } = actor;
  const clave = `a14-historial:${inicio}`;
  const turno = await tx.turnoCaja.create({
    data: {
      tenantId,
      cajaId,
      cajeroId: responsableId,
      aperturaAt: fecha,
      fondoInicial: 5,
    },
  });
  const articulos = await Promise.all(
    [520, 230].map((precio, i) =>
      loteHistorico(tx, actor, `${clave}:${i}`, fecha, ventas, dinero(precio)),
    ),
  );
  const cabeceras = await tx.venta.createManyAndReturn({
    data: Array.from({ length: ventas }, (_, i) => {
      const indice = inicio + i;
      return {
        ...actor,
        origen: 'CAJA',
        subtotal: '7.50',
        total: '7.50',
        fecha,
        claveIdempotencia: `a14-historial:venta:${indice}`,
        ...(indice === 0 ? { clienteComercialId } : {}),
        ...(indice === 1
          ? {
              estado: 'ANULADA',
              anuladaAt: fecha,
              anuladaPorId: responsableId,
              motivoAnulacion: motivo,
            }
          : {}),
      };
    }),
  });
  const porClave = new Map(
    cabeceras.map((venta) => [venta.claveIdempotencia, venta]),
  );
  const detalles = await tx.detalleVenta.createManyAndReturn({
    data: cabeceras.flatMap((venta) =>
      articulos.map((articulo) => ({
        tenantId,
        ventaId: venta.id,
        productoId: articulo.productoId,
        nombreProducto: articulo.nombreProducto,
        cantidad: 1,
        precioUnitario: articulo.precioUnitario,
        subtotal: articulo.precioUnitario,
        total: articulo.precioUnitario,
      })),
    ),
  });
  const lotes = new Map(
    articulos.map(({ productoId, loteId }) => [productoId, loteId]),
  );
  const asignaciones = await tx.asignacionLoteVenta.createManyAndReturn({
    data: detalles.map((detalle) => ({
      tenantId,
      ventaId: detalle.ventaId,
      productoId: detalle.productoId,
      detalleVentaId: detalle.id,
      loteId: lotes.get(detalle.productoId),
      cantidad: 1,
      costoUnitario: 1,
      costoTotal: 1,
    })),
  });
  await tx.movimientoInventario.createMany({
    data: asignaciones.map(({ id, productoId, loteId }) => ({
      ...actor,
      productoId,
      loteId,
      asignacionVentaId: id,
      fecha,
      tipo: 'VENTA',
      deltaFisico: -1,
      deltaReservado: 0,
      costoUnitario: 1,
      costoTotal: 1,
      claveIdempotencia: `${clave}:salida:${id}`,
      correlacionId: randomUUID(),
    })),
  });

  let deuda = 0,
    cobrado = 0,
    efectivo = 500,
    perdida = 0,
    gasto = 0;
  const pagos = [];
  for (let indice = inicio; indice < inicio + ventas; indice++) {
    if (indice === 1) continue;
    const venta = porClave.get(`a14-historial:venta:${indice}`);
    const credito = indice === 0;
    const metodo = credito || indice % 2 === 0 ? 'TRANSFERENCIA' : 'EFECTIVO';
    const monto = credito ? 250 : 750;
    cobrado += monto;
    if (metodo === 'EFECTIVO') efectivo += monto;
    pagos.push({
      venta,
      metodo,
      monto: dinero(monto),
      claveIdempotencia: `a14-historial:cobro:${indice}`,
    });
  }
  const cobros = await tx.cobro.createManyAndReturn({
    data: pagos.map(({ venta, metodo, monto, claveIdempotencia }) => ({
      ...actor,
      fecha,
      metodo,
      monto,
      claveIdempotencia,
      clienteComercialId: venta.clienteComercialId,
      turnoId: metodo === 'EFECTIVO' ? turno.id : null,
    })),
  });
  const cobroPorClave = new Map(
    cobros.map((cobro) => [cobro.claveIdempotencia, cobro.id]),
  );
  let cuentaId;
  if (inicio === 0) {
    const venta = porClave.get('a14-historial:venta:0');
    const { id: idCuenta } = await tx.cuentaPorCobrar.create({
      data: {
        tenantId,
        ventaId: venta.id,
        clienteComercialId,
        createdAt: fecha,
        vencimiento: new Date(fecha.getTime() + 14 * dia),
        importeFinanciadoInicial: '7.50',
        importeExigible: '5.20',
        saldo: '2.70',
      },
    });
    cuentaId = idCuenta;
    const devolucion = await tx.devolucionVenta.create({
      data: {
        ...actor,
        ventaId: venta.id,
        estado: 'APROBADA',
        fecha,
        aprobadaAt: fecha,
        aprobadaPorId: responsableId,
        subtotal: '2.30',
        total: '2.30',
        motivo,
        claveIdempotencia: `${clave}:devolucion`,
      },
    });
    const asignacion = asignaciones.find(
      ({ ventaId, productoId }) =>
        ventaId === venta.id && productoId === articulos[1].productoId,
    );
    const detalle = await tx.detalleDevolucionVenta.create({
      data: {
        tenantId,
        devolucionId: devolucion.id,
        ventaId: venta.id,
        detalleVentaId: asignacion.detalleVentaId,
        asignacionVentaId: asignacion.id,
        productoId: asignacion.productoId,
        loteId: asignacion.loteId,
        cantidad: 1,
        destino: 'BAJA_NO_APTO',
        subtotal: '2.30',
        total: '2.30',
        costoUnitario: 1,
        costoTotal: 1,
        createdAt: fecha,
      },
    });
    const correlacionId = randomUUID();
    await tx.movimientoInventario.createMany({
      data: [
        ['DEVOLUCION', 1],
        ['BAJA', -1],
      ].map(([tipo, deltaFisico]) => ({
        ...actor,
        fecha,
        tipo,
        deltaFisico,
        deltaReservado: 0,
        motivo,
        costoUnitario: 1,
        costoTotal: 1,
        productoId: asignacion.productoId,
        loteId: asignacion.loteId,
        detalleDevolucionId: detalle.id,
        claveIdempotencia: `${clave}:${tipo}`,
        correlacionId,
      })),
    });
    await tx.ajusteCuentaPorCobrar.create({
      data: {
        ...actor,
        tipo: 'DEVOLUCION',
        deltaImporte: '-2.30',
        cuentaId,
        ventaId: venta.id,
        devolucionId: devolucion.id,
        motivo,
        createdAt: fecha,
        claveIdempotencia: `${clave}:ajuste`,
      },
    });
    await tx.gastoComercial.create({
      data: {
        ...actor,
        metodo: 'TRANSFERENCIA',
        monto: '1.50',
        fecha,
        concepto: motivo,
        claveIdempotencia: `${clave}:gasto`,
      },
    });
    gasto = 150;
    deuda = 270;
    perdida = 100;
  }
  await tx.aplicacionCobro.createMany({
    data: pagos.map(({ venta, monto, claveIdempotencia }) => ({
      ...actor,
      monto,
      ventaId: venta.id,
      cobroId: cobroPorClave.get(claveIdempotencia),
      clienteComercialId: venta.clienteComercialId,
      cuentaId: venta.clienteComercialId ? cuentaId : null,
      createdAt: fecha,
      claveIdempotencia,
    })),
  });
  const entradasCaja = cobros.filter(({ metodo }) => metodo === 'EFECTIVO');
  if (entradasCaja.length)
    await tx.movimientoCaja.createMany({
      data: entradasCaja.map(({ id, monto, claveIdempotencia }) => ({
        ...actor,
        fecha,
        tipo: 'ENTRADA',
        monto,
        motivo,
        turnoId: turno.id,
        cobroId: id,
        claveIdempotencia,
      })),
    });
  await tx.turnoCaja.update({
    where: { id: turno.id },
    data: {
      estado: 'CERRADO',
      cierreAt: new Date(fecha.getTime() + 1000),
      cerradoPorId: responsableId,
      efectivoEsperado: dinero(efectivo),
      efectivoContado: dinero(efectivo),
      diferencia: 0,
    },
  });
  return {
    filas: ventas,
    ventaNeta:
      750 * (ventas - Number(inicio <= 1 && inicio + ventas > 1)) -
      (inicio === 0 ? 230 : 0),
    cobrado,
    deuda,
    perdida,
    gasto,
    anuladas: Number(inicio <= 1 && inicio + ventas > 1),
  };
}

export async function historial() {
  const fechaGuayaquil = new Date(Date.now() - 5 * 3_600_000)
    .toISOString()
    .slice(0, 10);
  const inicioPeriodo =
    process.env.A14_HASTA ?? `${fechaGuayaquil}T00:00:00.000-05:00`;
  const hasta = new Date(inicioPeriodo);
  assert(
    Number.isFinite(hasta.getTime()),
    'A14_HASTA debe ser una fecha ISO con zona',
  );
  const filas = Number(process.env.A14_HISTORIAL_FILAS ?? 10_000);
  const reciente = Math.min(filas, 1_000);
  assert(Number.isInteger(filas) && filas >= 3 && filas <= 10_000);
  assert.equal(
    await db.venta.count({
      where: { claveIdempotencia: { startsWith: 'a14-historial:' } },
    }),
    0,
    'Restaurar datos antes de cargar otro historial',
  );
  const { tiendas } = await leerDatos();
  const resultado = [];
  for (const { tenantId, cajas } of tiendas) {
    const { cajeroId: responsableId } = await db.turnoCaja.findUniqueOrThrow({
      where: { id: cajas[0].turnoId },
    });
    const { id: cajaId } = await db.caja.create({
      data: { tenantId, nombre: 'Caja histórica', codigo: 'A14-HIST' },
    });
    const { id: clienteComercialId } = await db.clienteComercial.create({
      data: { tenantId, nombres: 'Cliente histórico A14' },
    });
    const esperados = [];
    for (let inicio = 0; inicio < filas; ) {
      const ultimos7 = inicio < reciente;
      const cantidad = Math.min(50, (ultimos7 ? reciente : filas) - inicio);
      const diasAntes = ultimos7
        ? 1 + (Math.floor(inicio / 50) % 7)
        : 8 + (Math.floor((inicio - reciente) / 50) % 23);
      const fecha = new Date(
        hasta.getTime() - diasAntes * dia + 12 * 3_600_000,
      );
      const esperado = await db.$transaction(
        (tx) =>
          cargarLote(
            tx,
            { tenantId, responsableId },
            cajaId,
            clienteComercialId,
            inicio,
            cantidad,
            fecha,
          ),
        { timeout: 60_000 },
      );
      esperados.push({ fecha, ...esperado });
      inicio += cantidad;
    }
    const periodos = [7, 30].map((dias) => {
      const desde = new Date(hasta.getTime() - dias * dia);
      const bloques = esperados.filter(({ fecha }) => fecha >= desde);
      const sumar = (campo) =>
        bloques.reduce((n, bloque) => n + bloque[campo], 0);
      return {
        desde,
        hasta,
        filas: sumar('filas'),
        ventaNeta: dinero(sumar('ventaNeta')),
        cobrado: dinero(sumar('cobrado')),
        deuda: dinero(sumar('deuda')),
        perdida: (sumar('perdida') / 100).toFixed(4),
        gasto: dinero(sumar('gasto')),
        anuladas: sumar('anuladas'),
      };
    });
    for (const { desde, hasta: fin, filas: esperadas } of periodos) {
      const persistidas = await db.venta.count({
        where: {
          tenantId,
          fecha: { gte: desde, lt: fin },
          claveIdempotencia: { startsWith: 'a14-historial:venta:' },
        },
      });
      assert.equal(
        persistidas,
        esperadas,
        `No concilian las ventas históricas del tenant ${tenantId}`,
      );
    }
    resultado.push({ tenantId, periodos });
  }
  await writeFile(
    '.tmp/a14-esperados.json',
    JSON.stringify(resultado, null, 2),
  );
  console.log(
    `Historial preparado: ${filas} ventas por tienda. Totales en .tmp/a14-esperados.json`,
  );
}
