import { Test, TestingModule } from '@nestjs/testing';
import { DeudaService } from './deuda.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

const makePrisma = () => ({
  clientePlan: {
    findFirst: jest.fn(),
  },
  deuda: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  cliente: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
});

describe('DeudaService', () => {
  let service: DeudaService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeudaService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<DeudaService>(DeudaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('crea deuda con tenantId del contexto', async () => {
    prisma.clientePlan.findFirst.mockResolvedValue({ id: 15 });
    prisma.deuda.create.mockResolvedValue({
      id: 1,
      tenantId: 9,
      clientePlanId: 15,
      monto: 25,
      solventada: false,
    });

    const result = await service.create(
      {
        clientePlanId: 15,
        monto: 25,
        solventada: false,
      },
      9,
    );

    expect(prisma.deuda.create).toHaveBeenCalledWith({
      data: {
        tenantId: 9,
        clientePlanId: 15,
        monto: 25,
        solventada: false,
      },
    });
    expect(result).toEqual(expect.objectContaining({ tenantId: 9 }));
  });

  it('rechaza crear deuda si el clientePlan no pertenece al tenant', async () => {
    prisma.clientePlan.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        {
          clientePlanId: 99,
          monto: 25,
          solventada: false,
        },
        9,
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
