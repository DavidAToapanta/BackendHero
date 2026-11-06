import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

const makePrisma = () => ({
  deuda: {
    count: jest.fn(),
  },
  clientePlan: {
    count: jest.fn(),
  },
  producto: {
    count: jest.fn(),
  },
});

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('calcula notificaciones filtradas por tenant', async () => {
    prisma.deuda.count.mockResolvedValue(4);
    prisma.clientePlan.count.mockResolvedValue(2);
    prisma.producto.count.mockResolvedValue(3);

    const result = await service.getCurrentNotifications(9);

    expect(prisma.deuda.count).toHaveBeenCalledWith({
      where: { tenantId: 9, solventada: false },
    });
    expect(prisma.clientePlan.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 9 }),
      }),
    );
    expect(prisma.producto.count).toHaveBeenCalledWith({
      where: {
        tenantId: 9,
        estado: true,
        stock: {
          lte: 5,
        },
      },
    });
    expect(result[0].title).toContain('4');
    expect(result[1].title).toContain('2');
    expect(result[2].title).toContain('3');
  });
});
