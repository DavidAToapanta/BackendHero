import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { BridgeTenantAuthService } from './bridge-tenant-auth.service';

const makePrisma = () => ({
  tenant: {
    findMany: jest.fn(),
  },
});

describe('BridgeTenantAuthService', () => {
  let service: BridgeTenantAuthService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BridgeTenantAuthService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<BridgeTenantAuthService>(BridgeTenantAuthService);
  });

  it('resuelve tenant por x-bridge-key contra hash', async () => {
    prisma.tenant.findMany.mockResolvedValue([
      { id: 4, bridgeKeyHash: 'hash-4' },
      { id: 7, bridgeKeyHash: 'hash-7' },
    ]);
    jest
      .spyOn(bcrypt, 'compare')
      .mockResolvedValueOnce(false as never)
      .mockResolvedValueOnce(true as never);

    const result = await service.resolveTenantByBridgeKey('bridge-secret');

    expect(result).toEqual({ id: 7 });
    expect(bcrypt.compare).toHaveBeenNthCalledWith(
      1,
      'bridge-secret',
      'hash-4',
    );
    expect(bcrypt.compare).toHaveBeenNthCalledWith(
      2,
      'bridge-secret',
      'hash-7',
    );
  });
});
