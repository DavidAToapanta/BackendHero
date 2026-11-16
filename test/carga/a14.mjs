import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { cpus, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as esperar } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { io } from 'socket.io-client';
import {
  abrirCaja,
  bases,
  db,
  exigir,
  leerDatos,
  login,
  preparar,
  request,
} from './entorno.mjs';
import { historial } from './historial.mjs';

const limites = {
  venta: 800,
  inventario: 400,
  cierre: 1500,
  finanzas: 2000,
  tipico: 5000,
  grande: 20000,
};
const minutos = Number(process.env.A14_MINUTOS ?? 5);
const factor = Number(process.env.A14_FACTOR ?? 1);
const calentamiento = Number(process.env.A14_CALENTAMIENTO_S ?? 60);
const modo = process.argv[2] ?? 'base';
const dinero = (centavos) => (centavos / 100).toFixed(2);
const centavos = (importe) => Math.round(Number(importe) * 100);

function percentil95(muestras) {
  const ordenadas = [...muestras].sort((a, b) => a - b);
  return ordenadas.length
    ? Math.round(ordenadas[Math.ceil(ordenadas.length * 0.95) - 1] * 100) / 100
    : null;
}

async function medir() {
  assert(['base', 'excel', 'pdf'].includes(modo));
  assert(Number.isFinite(minutos) && minutos > 0 && minutos <= 60);
  assert([1, 1.5].includes(factor));
  assert(
    Number.isFinite(calentamiento) &&
      calentamiento >= 0 &&
      calentamiento <= 600,
  );
  const rutaContrato =
    process.env.A14_CONTRATO && resolve(process.env.A14_CONTRATO);
  const contrato = rutaContrato
    ? (await import(pathToFileURL(rutaContrato).href)).default
    : null;
  assert(
    modo === 'base' || contrato,
    'Excel/PDF exige A14_CONTRATO de B15/B17',
  );
  if (contrato) {
    assert.equal(typeof contrato.finanzas, 'function');
    assert.equal(typeof contrato.validarReporte, 'function');
  }
  if (modo !== 'base') {
    assert.equal(typeof contrato[modo], 'function');
    assert.equal(typeof contrato.validarArchivo, 'function');
  }
  const { tiendas, gymCedula } = await leerDatos();
  const [postgres] =
    await db.$queryRaw`SELECT current_setting('server_version') AS version, current_setting('max_connections')::int AS max,
    current_setting('superuser_reserved_connections')::int AS reservadas`;
  const entorno = {
    sha: execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    node: process.version,
    sistema: process.platform,
    cpu: cpus()[0]?.model,
    cpuLogicas: cpus().length,
    memoriaGiB: Math.round(totalmem() / 1024 ** 3),
    postgres,
  };
  const firma = createHash('sha256')
    .update(
      JSON.stringify({
        entorno,
        tiendas,
        minutos,
        calentamiento,
        factor,
        bases,
      }),
    )
    .update(rutaContrato ? await readFile(rutaContrato) : '')
    .update(contrato ? await readFile('.tmp/a14-esperados.json') : '')
    .digest('hex');
  const gymToken = await login('gym', gymCedula);
  const cajas = [];
  for (const tienda of tiendas) {
    for (const caja of tienda.cajas) {
      caja.token = await login('tienda', caja.cedula);
      caja.efectivo = 500;
      caja.cola = Promise.resolve();
      caja.tienda = tienda;
      cajas.push(caja);
    }
    tienda.ventas = 0;
    tienda.ingresos = 0;
  }
  const ventasIniciales = await db.venta.count({
    where: { tenantId: { in: tiendas.map(({ tenantId }) => tenantId) } },
  });
  const cuentasIniciales = await db.cuentaPorCobrar.aggregate({
    where: { tenantId: { in: tiendas.map(({ tenantId }) => tenantId) } },
    _count: true,
    _sum: { saldo: true },
  });
  const comprobarAislamiento = async () => {
    const ajeno = tiendas[1].productos[0].productoId;
    await exigir(
      'tienda',
      `/inventario/productos/${ajeno}/lotes`,
      cajas[0].token,
      undefined,
      404,
    );
  };
  await comprobarAislamiento();
  const socket = io(new URL('/notifications', bases.gym).href, {
    auth: { token: gymToken },
    transports: ['websocket'],
  });
  const resultados = new Map();
  const esperas = [];
  let diagnosticoActivo = false;
  let intervalo;
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Gym WebSocket no emitió notificationsUpdate')),
        15_000,
      );
      socket.once('notificationsUpdate', () => {
        clearTimeout(timeout);
        resolve();
      });
      socket.once('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    let desconexiones = 0;
    socket.on('disconnect', () => {
      desconexiones++;
    });
    const tomar = async (nombre, ejecutar) => {
      const inicio = performance.now();
      if (!resultados.has(nombre)) resultados.set(nombre, []);
      let estado = 'ok';
      let referencia;
      let latencia;
      try {
        const respuesta = await ejecutar();
        referencia = respuesta?.correlacionId;
        latencia = respuesta?.ms;
        if (respuesta?.esperado) estado = 'rechazoEsperado';
        else if (respuesta && respuesta.status >= 500) estado = 'errorTecnico';
        else if (
          respuesta &&
          respuesta.status !== (nombre === 'venta' ? 201 : 200)
        )
          estado = 'rechazoInesperado';
      } catch (error) {
        estado =
          error?.name === 'AssertionError' ? 'inconsistencia' : 'errorTecnico';
        referencia = error?.name;
      }
      resultados.get(nombre).push({
        estado,
        ms: latencia ?? performance.now() - inicio,
        referencia,
      });
    };
    const venta = async (caja, productos, monto, metodo) => {
      const respuesta = await request('tienda', '/ventas', caja.token, {
        turnoId: caja.turnoId,
        lineas: productos.map(({ productoId, loteId }) => ({
          productoId,
          cantidad: 1,
          lotes: [{ loteId, cantidad: 1 }],
        })),
        pago: {
          metodo,
          monto: dinero(monto),
          ...(metodo === 'TRANSFERENCIA' ? { referencia: 'Ensayo A14' } : {}),
        },
      });
      if (respuesta.status === 201) {
        if (metodo === 'EFECTIVO') {
          caja.efectivo += monto;
          caja.tienda.ingresos += monto;
        }
        return respuesta;
      }
      return {
        ...respuesta,
        esperado:
          [400, 409].includes(respuesta.status) &&
          /insuficiente/i.test(JSON.stringify(respuesta.json?.message)),
      };
    };
    const enCaja = (caja, tarea) => {
      const operacion = caja.cola.then(tarea);
      caja.cola = operacion.catch(() => {});
      return operacion;
    };
    const leerGym = () => request('gym', '/producto', gymToken);
    const leerInventario = ({ token }) =>
      request('tienda', '/inventario/productos', token);
    for (let segundo = 0; segundo < calentamiento; segundo += 2) {
      const inicio = performance.now();
      const lecturas = await Promise.all([
        leerGym(),
        leerInventario(cajas[segundo % cajas.length]),
      ]);
      assert(
        lecturas.every(({ status }) => status === 200),
        'Falló el calentamiento',
      );
      await esperar(
        Math.max(
          0,
          Math.min(2, calentamiento - segundo) * 1000 -
            (performance.now() - inicio),
        ),
      );
    }
    intervalo = setInterval(async () => {
      if (diagnosticoActivo) return;
      diagnosticoActivo = true;
      try {
        const filas = await db.$queryRaw`
          SELECT application_name AS api, wait_event_type AS espera, wait_event AS evento,
                 cardinality(pg_blocking_pids(pid)) > 0 AS bloqueado, count(*)::int AS conexiones
          FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()
          GROUP BY 1, 2, 3, 4`;
        esperas.push({ fecha: new Date().toISOString(), filas });
      } catch {
        esperas.push({
          fecha: new Date().toISOString(),
          error: 'pg_stat_activity no disponible',
        });
      } finally {
        diagnosticoActivo = false;
      }
    }, 5_000);
    console.log(`Midiendo ${modo} a ${factor}× por ${minutos} min`);
    const inicio = performance.now();
    const en = async (ms, tarea) => {
      await esperar(Math.max(0, inicio + ms - performance.now()));
      return tarea();
    };
    const frecuencia = (tasa, tarea, escala = factor) =>
      Array.from({ length: Math.floor(minutos * tasa * escala) }, (_, i) =>
        en((i * 60_000) / (tasa * escala), () => tarea(i)),
      );
    const trabajos = [
      ...frecuencia(30, (i) => {
        const caja = cajas[i % cajas.length];
        return enCaja(caja, () =>
          tomar('venta', async () => {
            const respuesta = await venta(
              caja,
              caja.tienda.productos.slice(0, 2),
              750,
              Math.floor(i / cajas.length) % 3 ? 'EFECTIVO' : 'TRANSFERENCIA',
            );
            if (respuesta.status === 201) caja.tienda.ventas++;
            return respuesta;
          }),
        );
      }),
      ...frecuencia(60, (i) =>
        tomar('inventario', () => leerInventario(cajas[i % cajas.length])),
      ),
      ...frecuencia(30, () => tomar('gym', leerGym), 1),
      ...cajas.map((caja, i) =>
        en((minutos * 60_000 * (i + 1)) / 7, () =>
          enCaja(caja, async () => {
            await tomar('cierre', async () => {
              const respuesta = await request(
                'tienda',
                `/caja/turnos/${caja.turnoId}/cierre`,
                caja.token,
                { efectivoContado: dinero(caja.efectivo) },
              );
              if (respuesta.status === 200) {
                assert.deepEqual(respuesta.json, {
                  recursoTipo: 'TurnoCaja',
                  recursoId: caja.turnoId,
                });
              }
              return respuesta;
            });
            await tomar('reapertura', async () => {
              caja.turnoId = await abrirCaja(caja.token, caja.cajaId);
              caja.efectivo = 500;
            });
          }),
        ),
      ),
    ];
    if (contrato)
      trabajos.push(
        ...frecuencia(3, (i) =>
          tomar('finanzas', async () => {
            const caja = tiendas[i % tiendas.length].cajas[0];
            const tenantId = caja.tienda.tenantId;
            const respuesta = await request(
              'tienda',
              contrato.finanzas(tenantId),
              caja.token,
            );
            if (respuesta.status === 200)
              await contrato.validarReporte({ tenantId, json: respuesta.json });
            return respuesta;
          }),
        ),
      );
    if (modo !== 'base') {
      for (const [i, tamano] of ['tipico', 'grande'].entries()) {
        trabajos.push(
          en((minutos * 60_000 * (i + 1)) / 3, () =>
            Promise.all(
              tiendas.slice(0, 2).map((tienda) =>
                tomar(tamano, async () => {
                  const respuesta = await request(
                    'tienda',
                    contrato[modo](tienda.tenantId, tamano),
                    tienda.cajas[0].token,
                  );
                  if (respuesta.status === 200) {
                    assert(
                      respuesta.bytes
                        .subarray(0, modo === 'pdf' ? 5 : 2)
                        .equals(Buffer.from(modo === 'pdf' ? '%PDF-' : 'PK')),
                    );
                    await contrato.validarArchivo({
                      tenantId: tienda.tenantId,
                      modo,
                      tamano,
                      bytes: respuesta.bytes,
                    });
                  }
                  return respuesta;
                }),
              ),
            ),
          ),
        );
      }
    }
    await Promise.all(trabajos);
    await en(minutos * 60_000, () => {});
    clearInterval(intervalo);
    const carrera = await Promise.all(
      tiendas[0].cajas.map((caja) =>
        venta(caja, [tiendas[0].productos[2]], 520, 'EFECTIVO'),
      ),
    );
    const conciliacion = [];
    const comprobar = async (nombre, consulta) => {
      try {
        await consulta();
      } catch (error) {
        conciliacion.push({ nombre, error: error.message });
      }
    };
    await comprobar('contencion', () => {
      assert.equal(carrera.filter(({ status }) => status === 201).length, 1);
      assert.equal(carrera.filter(({ esperado }) => esperado).length, 1);
    });
    await comprobar('ventas', async () => {
      const total = await db.venta.count({
        where: { tenantId: { in: tiendas.map(({ tenantId }) => tenantId) } },
      });
      assert.equal(
        total,
        ventasIniciales +
          tiendas.reduce((n, tienda) => n + tienda.ventas, 0) +
          1,
      );
    });
    await comprobar('deuda', async () => {
      const cuentas = await db.cuentaPorCobrar.aggregate({
        where: { tenantId: { in: tiendas.map(({ tenantId }) => tenantId) } },
        _count: true,
        _sum: { saldo: true },
      });
      assert.deepEqual(cuentas, cuentasIniciales);
    });
    await comprobar('stock y caja', async () => {
      for (const tienda of tiendas) {
        for (const [i, producto] of tienda.productos.entries()) {
          const actual = await db.producto.findUniqueOrThrow({
            where: { id: producto.productoId },
          });
          const saldoLote = await db.loteInventario.findUniqueOrThrow({
            where: { id: producto.loteId },
          });
          const esperado =
            producto.cantidad -
            (i < 2 ? tienda.ventas : Number(tienda === tiendas[0]));
          assert.equal(actual.stock, esperado);
          assert.equal(saldoLote.cantidadFisica, esperado);
        }
        const turnos = await db.turnoCaja.findMany({
          where: {
            tenantId: tienda.tenantId,
            cajaId: { in: tienda.cajas.map(({ cajaId }) => cajaId) },
          },
          include: { movimientoCaja_turno: true },
        });
        let ingresos = 0;
        for (const turno of turnos) {
          const movimientos = turno.movimientoCaja_turno.reduce(
            (n, mov) =>
              n + centavos(mov.monto) * (mov.tipo === 'ENTRADA' ? 1 : -1),
            0,
          );
          ingresos += movimientos;
          if (turno.estado === 'CERRADO') {
            assert.equal(centavos(turno.efectivoEsperado), 500 + movimientos);
            assert.equal(centavos(turno.diferencia), 0);
          }
        }
        assert.equal(ingresos, tienda.ingresos);
      }
    });
    await comprobar('aislamiento', comprobarAislamiento);
    const operaciones = [...resultados.entries()].map(([nombre, filas]) => {
      const correctas = filas.filter(({ estado }) => estado === 'ok');
      const p95 = percentil95(correctas.map(({ ms }) => ms));
      const errorTecnico = filas.filter(
        ({ estado }) => estado === 'errorTecnico',
      ).length;
      const rechazoInesperado = filas.filter(
        ({ estado }) => estado === 'rechazoInesperado',
      ).length;
      const inconsistencias = filas.filter(
        ({ estado }) => estado === 'inconsistencia',
      ).length;
      return {
        nombre,
        intentos: filas.length,
        correctas: correctas.length,
        p95,
        errorTecnico,
        rechazoInesperado,
        inconsistencias,
        rechazoEsperado: filas.filter(
          ({ estado }) => estado === 'rechazoEsperado',
        ).length,
        cumple:
          errorTecnico / filas.length <= 0.005 &&
          !rechazoInesperado &&
          !inconsistencias &&
          (limites[nombre] === undefined ||
            (p95 !== null && p95 <= limites[nombre])),
        referenciasFallidas: filas
          .filter(({ estado }) => !['ok', 'rechazoEsperado'].includes(estado))
          .map(({ referencia }) => referencia),
      };
    });
    let impacto;
    if (modo !== 'base') {
      const base = JSON.parse(
        await readFile(`.tmp/a14-base-${factor}.json`, 'utf8'),
      );
      const referencia = base.operaciones.find(
        ({ nombre }) => nombre === 'venta',
      )?.p95;
      const p95 = operaciones.find(({ nombre }) => nombre === 'venta')?.p95;
      impacto = {
        referencia,
        p95,
        cumple:
          base.firma === firma &&
          base.cumple &&
          Number.isFinite(referencia) &&
          Number.isFinite(p95) &&
          p95 <= referencia * 1.2,
      };
    }
    const informe = {
      modo,
      minutos,
      factor,
      conFinanzas: Boolean(contrato),
      entorno,
      firma,
      operaciones,
      conciliacion,
      desconexiones,
      esperas,
      impacto,
      cumple:
        operaciones.every(({ cumple }) => cumple) &&
        !conciliacion.length &&
        !desconexiones &&
        (impacto?.cumple ?? true),
    };
    await writeFile(
      `.tmp/a14-${modo}-${factor}.json`,
      JSON.stringify(informe, null, 2),
    );
    console.log(
      JSON.stringify({ ...informe, esperas: esperas.length }, null, 2),
    );
    if (!informe.cumple) process.exitCode = 1;
  } finally {
    clearInterval(intervalo);
    socket.close();
  }
}

try {
  if (modo === 'preparar') await preparar();
  else if (modo === 'historial') await historial();
  else await medir();
} finally {
  await db.$disconnect();
}
