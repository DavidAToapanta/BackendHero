import { PermisosService } from '@app/permisos';
import {
  type ExecutionContext,
  type INestApplication,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { type App } from 'supertest/types';
import { PermisosTiendaGuard } from '../accesos/permisos-tienda';
import { TiendaJwtGuard, type ContextoTienda } from '../auth';
import { AuditoriaEscrituraService } from '../auditoria/auditoria-escritura';
import { DevolucionesController } from './devoluciones.controller';
import { DevolucionesOperacionService } from './devoluciones-operacion.service';
import { DevolucionesService } from './devoluciones.service';

type SolicitudEnsayo = {
  headers: { authorization?: string };
  user?: ContextoTienda;
};

describe('Devoluciones HTTP · vista previa sin base de datos', () => {
  let app: INestApplication<App>;
  const vistaPrevia = jest.fn().mockResolvedValue({ total: '70.00' });
  const devolver = jest.fn();
  const paraOperacion = jest.fn();
  const autorizar = jest.fn(
    (contexto: ContextoTienda, permisos: readonly string[]) => {
      const concedido =
        contexto.rolEfectivo.codigo === 'LECTOR'
          ? 'store.returns.read'
          : 'store.returns.write';
      if (permisos.some((permiso) => permiso !== concedido))
        throw new ForbiddenException();
      return Promise.resolve();
    },
  );
  const contexto = (tenantId: number, codigo = 'LECTOR'): ContextoTienda => ({
    tenantId,
    usuarioId: 1,
    membresiaId: 2,
    tenantNombre: 'Ensayo',
    versionAutorizacion: 1,
    modoAutorizacion: 'PERMISOS',
    rolEfectivo: { codigo, nombre: codigo },
  });
  const lineas = [
    { asignacionVentaId: 42, cantidad: 1, destino: 'REINTEGRO_APTO' },
  ];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [DevolucionesController],
      providers: [
        PermisosTiendaGuard,
        { provide: PermisosService, useValue: { autorizar } },
        { provide: DevolucionesService, useValue: { vistaPrevia } },
        { provide: DevolucionesOperacionService, useValue: { devolver } },
        { provide: AuditoriaEscrituraService, useValue: { paraOperacion } },
      ],
    })
      .overrideGuard(TiendaJwtGuard)
      .useValue({
        canActivate(execution: ExecutionContext) {
          const req = execution.switchToHttp().getRequest<SolicitudEnsayo>();
          const token = req.headers.authorization;
          if (!token) throw new UnauthorizedException();
          req.user = contexto(
            token === 'otra-tienda' ? 5 : 4,
            token === 'escritor' ? 'ESCRITOR' : 'LECTOR',
          );
          return true;
        },
      })
      .compile();
    app = module.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const consultar = (body: object, token = 'lector', id = '15') =>
    request(app.getHttpServer())
      .post(`/devoluciones/ventas/${id}/vista-previa`)
      .set('Authorization', token)
      .send(body);

  it('permite leer sin permiso de escritura ni clave idempotente y no invoca operaciones', async () => {
    await consultar({ lineas }).expect(200, { total: '70.00' });
    expect(vistaPrevia).toHaveBeenCalledWith(4, 15, lineas);
    expect(autorizar).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 4 }),
      ['store.returns.read'],
    );
    expect(devolver).not.toHaveBeenCalled();
    expect(paraOperacion).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .post('/devoluciones')
      .set('Authorization', 'lector')
      .send({ ventaId: 15, motivo: 'Ensayo', lineas })
      .expect(403);
    expect(devolver).not.toHaveBeenCalled();
  });

  it('exige autenticación y permiso de lectura aunque exista permiso de escritura', async () => {
    await request(app.getHttpServer())
      .post('/devoluciones/ventas/15/vista-previa')
      .send({ lineas })
      .expect(401);
    await consultar({ lineas }, 'escritor').expect(403);
    expect(vistaPrevia).not.toHaveBeenCalled();
  });

  it('pasa exclusivamente la tienda de la sesión', async () => {
    await consultar({ lineas }, 'otra-tienda').expect(200);
    expect(vistaPrevia).toHaveBeenCalledWith(5, 15, lineas);
    await consultar({ lineas, tenantId: 4 }, 'otra-tienda').expect(400);
    expect(vistaPrevia).toHaveBeenCalledTimes(1);
  });

  it.each([
    {},
    { lineas: [] },
    { lineas: null },
    { lineas: [{ ...lineas[0], cantidad: 0 }] },
    { lineas: [{ ...lineas[0], cantidad: 1.5 }] },
    { lineas: [{ ...lineas[0], cantidad: '1' }] },
    { lineas: [{ ...lineas[0], asignacionVentaId: -1 }] },
    { lineas: [{ ...lineas[0], destino: 'OTRO' }] },
    { lineas: [{ ...lineas[0], tenantId: 9 }] },
    { lineas, ventaId: 9 },
    { lineas, liberar: [] },
    { lineas, motivo: 'Extra' },
    {
      lineas: Array.from({ length: 101 }, (_, i) => ({
        ...lineas[0],
        asignacionVentaId: i + 1,
      })),
    },
  ])('rechaza un cuerpo inválido (%#)', async (body) => {
    await consultar(body).expect(400);
    expect(vistaPrevia).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', '1.5', 'texto', '2147483648'])(
    'rechaza identificador de venta inválido %s',
    async (id) => {
      await consultar({ lineas }, 'lector', id).expect(400);
      expect(vistaPrevia).not.toHaveBeenCalled();
    },
  );
});
