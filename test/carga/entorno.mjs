import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

export const bases = {
  tienda: new URL(process.env.A14_TIENDA_URL ?? 'http://127.0.0.1:8081'),
  gym: new URL(process.env.A14_GYM_URL ?? 'http://127.0.0.1:8080'),
};
const conexion = new URL(process.env.DATABASE_URL ?? '');
assert.equal(conexion.hostname, '127.0.0.1', 'A14 usa PostgreSQL local');
assert.equal(
  conexion.pathname,
  '/hero_a14_test',
  'A14 usa una base desechable hero_a14_test',
);
for (const base of Object.values(bases)) {
  assert.equal(base.hostname, '127.0.0.1', 'A14 solo usa APIs locales');
  assert.equal(base.protocol, 'http:');
}
conexion.searchParams.set('connection_limit', '1');
conexion.searchParams.set('application_name', 'a14-observador');
export const db = new PrismaClient({ datasourceUrl: conexion.href });
const password = 'solo-ensayo-A14';
const archivo = '.tmp/a14-datos.json';

export async function request(
  api,
  ruta,
  token,
  body,
  method = body ? 'POST' : 'GET',
) {
  assert(
    ruta.startsWith('/') && !ruta.startsWith('//'),
    'La ruta debe ser local',
  );
  const url = new URL(ruta, bases[api]);
  assert.equal(url.origin, bases[api].origin);
  const correlacionId = randomUUID();
  const inicio = performance.now();
  const response = await fetch(url, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body
        ? {
            'Content-Type': 'application/json',
            'Idempotency-Key': randomUUID(),
          }
        : {}),
      'X-Request-Id': correlacionId,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  const ms = performance.now() - inicio;
  const json = response.headers
    .get('content-type')
    ?.includes('application/json')
    ? JSON.parse(bytes.toString('utf8'))
    : undefined;
  return { status: response.status, bytes, json, correlacionId, ms };
}

export async function exigir(
  api,
  ruta,
  token,
  body,
  status = body ? 201 : 200,
) {
  const respuesta = await request(api, ruta, token, body);
  assert.equal(
    respuesta.status,
    status,
    `${api} ${ruta} → ${respuesta.status} (${respuesta.correlacionId})`,
  );
  return respuesta.json;
}

export async function login(api, cedula) {
  const sesion = await exigir(
    api,
    '/auth/login',
    null,
    { cedula, password },
    api === 'gym' ? 201 : 200,
  );
  const token = api === 'gym' ? sesion.access_token : sesion.accessToken;
  assert.equal(typeof token, 'string');
  return token;
}

export async function abrirCaja(token, id) {
  return (
    await exigir('tienda', `/caja/${id}/turnos`, token, {
      fondoInicial: '5.00',
    })
  ).recursoId;
}

async function crearCuenta(tenantId, cedula, hash, rolId) {
  const usuario = await db.usuario.create({
    data: { cedula, password: hash, nombres: 'Ensayo', apellidos: 'A14' },
  });
  const membresia = await db.userTenant.create({
    data: { usuarioId: usuario.id, tenantId, role: 'OWNER' },
  });
  if (rolId)
    await db.asignacionRol.create({
      data: { tenantId, rolId, membresiaId: membresia.id },
    });
  return cedula;
}

export async function preparar() {
  assert.equal(
    await db.tenant.count({ where: { slug: { startsWith: 'a14-' } } }),
    0,
    'Restaurar una base vacía antes de preparar',
  );
  const hash = await bcrypt.hash(password, 4);
  const tiendas = [];
  for (let numero = 1; numero <= 3; numero++) {
    const prefijo = `a14-tienda-${numero}`;
    const { id: tenantId } = await db.tenant.create({
      data: {
        slug: prefijo,
        nombre: `Tienda de ensayo ${numero}`,
        tipoNegocio: 'STORE',
        autorizacionVersion: 'PERMISOS',
        modules: { create: { module: 'STORE' } },
      },
    });
    const rol = await db.rolNegocio.create({
      data: {
        tenantId,
        codigo: 'OWNER',
        nombre: 'Propietario de ensayo',
        protegido: true,
        equivalenciaLegacy: 'OWNER',
      },
    });
    const cajas = [];
    for (let indice = 1; indice <= 2; indice++) {
      const cedula = await crearCuenta(
        tenantId,
        `${prefijo}-${indice}`,
        hash,
        rol.id,
      );
      const token = await login('tienda', cedula);
      const caja = await exigir('tienda', '/caja', token, {
        codigo: `A14-${indice}`,
        nombre: `Caja ${indice}`,
      });
      cajas.push({
        cedula,
        cajaId: caja.id,
        turnoId: await abrirCaja(token, caja.id),
      });
    }
    const token = await login('tienda', cajas[0].cedula);
    const productos = [];
    for (const [sku, precio, cantidad] of [
      ['REGULAR', '5.20', 1000],
      ['ADICIONAL', '2.30', 1000],
      ['DEMANDA', '5.20', 1],
    ]) {
      const { productoId } = await exigir(
        'tienda',
        '/catalogo/productos',
        token,
        { nombre: sku, sku, precio },
      );
      await exigir(
        'tienda',
        `/inventario/productos/${productoId}/apertura`,
        token,
        { motivo: 'A14', lotes: [] },
      );
      await exigir(
        'tienda',
        `/inventario/productos/${productoId}/entradas`,
        token,
        {
          motivo: 'A14',
          lotes: [{ codigo: 'A14', cantidad, costoUnitario: '1.0000' }],
        },
      );
      const {
        data: [lote],
      } = await exigir(
        'tienda',
        `/inventario/productos/${productoId}/lotes`,
        token,
      );
      productos.push({ productoId, loteId: lote.loteId, cantidad });
    }
    tiendas.push({ tenantId, cajas, productos });
  }
  const gym = await db.tenant.create({
    data: {
      slug: 'a14-gym',
      nombre: 'Gym de ensayo A14',
      tipoNegocio: 'GYM',
      modules: { create: { module: 'GYM' } },
    },
  });
  const gymCedula = await crearCuenta(gym.id, 'a14-gym-owner', hash);
  await db.producto.create({
    data: {
      tenantId: gym.id,
      nombre: 'Producto Gym',
      precio: '1.00',
      stock: 10,
      estado: true,
    },
  });
  await mkdir('.tmp', { recursive: true });
  await writeFile(archivo, JSON.stringify({ tiendas, gymCedula }, null, 2));
  console.log(`Datos de ensayo guardados en ${archivo}`);
}

export async function leerDatos() {
  return JSON.parse(await readFile(archivo, 'utf8'));
}
