import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';

const notificationsPayload = [
  {
    icon: 'info',
    title: '1 productos con stock bajo',
    message: 'Verificar inventario',
    color: 'bg-blue-50 border-blue-200 text-blue-700',
  },
];

const makeNamespace = () => {
  const rooms = new Map<string, Set<string>>();
  const emitMock = jest.fn();
  const toMock = jest.fn(() => ({
    emit: emitMock,
  }));

  return {
    namespace: {
      adapter: {
        rooms,
      },
      to: toMock,
    },
    rooms,
    toMock,
    emitMock,
  };
};

const makeClient = (overrides?: Partial<any>) => ({
  id: 'socket-1',
  data: {},
  handshake: {
    auth: {
      token: 'Bearer token',
    },
    query: {},
    headers: {},
  },
  join: jest.fn().mockResolvedValue(undefined),
  emit: jest.fn(),
  disconnect: jest.fn(),
  ...overrides,
});

describe('NotificationsGateway', () => {
  let gateway: NotificationsGateway;
  let notificationsService: { getCurrentNotifications: jest.Mock };
  let jwtService: { verify: jest.Mock };

  beforeEach(async () => {
    jest.useFakeTimers();

    notificationsService = {
      getCurrentNotifications: jest.fn(),
    };
    jwtService = {
      verify: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsGateway,
        {
          provide: NotificationsService,
          useValue: notificationsService,
        },
        {
          provide: JwtService,
          useValue: jwtService,
        },
      ],
    }).compile();

    gateway = module.get<NotificationsGateway>(NotificationsGateway);
  });

  afterEach(() => {
    gateway?.onModuleDestroy();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('une el socket al tenant room y emite el snapshot inicial', async () => {
    const { namespace } = makeNamespace();
    const client = makeClient();

    (gateway as any).server = namespace;
    jwtService.verify.mockReturnValue({ tenantId: 9 });
    notificationsService.getCurrentNotifications.mockResolvedValue(
      notificationsPayload,
    );

    await gateway.handleConnection(client as any);

    expect(client.join).toHaveBeenCalledWith('tenant:9');
    expect(client.emit).toHaveBeenCalledWith(
      'notificationsUpdate',
      notificationsPayload,
    );
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('solo limpia snapshot cuando el tenant room ya no existe', () => {
    const { namespace, rooms } = makeNamespace();
    const client = makeClient({
      data: {
        tenantId: 9,
      },
    });

    rooms.set('tenant:9', new Set(['socket-1', 'socket-2']));
    (gateway as any).server = namespace;
    (gateway as any).lastSnapshots.set(9, 'snapshot');

    gateway.handleDisconnect(client as any);

    expect((gateway as any).lastSnapshots.has(9)).toBe(true);

    rooms.delete('tenant:9');
    gateway.handleDisconnect(client as any);

    expect((gateway as any).lastSnapshots.has(9)).toBe(false);
  });

  it('el ciclo periodico no falla cuando no hay tenant rooms activos', async () => {
    const { namespace, rooms, toMock } = makeNamespace();

    rooms.set('socket-1', new Set(['socket-1']));
    (gateway as any).server = namespace;

    await gateway.afterInit();
    await jest.advanceTimersByTimeAsync(10000);

    expect(notificationsService.getCurrentNotifications).not.toHaveBeenCalled();
    expect(toMock).not.toHaveBeenCalled();
  });

  it('solo procesa tenant rooms y omite emisiones duplicadas', async () => {
    const { namespace, rooms, toMock, emitMock } = makeNamespace();

    rooms.set('socket-1', new Set(['socket-1']));
    rooms.set('tenant:9', new Set(['socket-1']));
    (gateway as any).server = namespace;
    notificationsService.getCurrentNotifications.mockResolvedValue(
      notificationsPayload,
    );

    await gateway.afterInit();
    await jest.advanceTimersByTimeAsync(10000);
    await jest.advanceTimersByTimeAsync(10000);

    expect(notificationsService.getCurrentNotifications).toHaveBeenCalledTimes(
      2,
    );
    expect(
      notificationsService.getCurrentNotifications,
    ).toHaveBeenNthCalledWith(1, 9);
    expect(toMock).toHaveBeenCalledTimes(1);
    expect(toMock).toHaveBeenCalledWith('tenant:9');
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith(
      'notificationsUpdate',
      notificationsPayload,
    );
  });

  it('detiene el intervalo al destruir el gateway', async () => {
    const { namespace, rooms } = makeNamespace();

    rooms.set('tenant:9', new Set(['socket-1']));
    (gateway as any).server = namespace;
    notificationsService.getCurrentNotifications.mockResolvedValue(
      notificationsPayload,
    );

    await gateway.afterInit();
    gateway.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(10000);

    expect(notificationsService.getCurrentNotifications).not.toHaveBeenCalled();
  });
});
