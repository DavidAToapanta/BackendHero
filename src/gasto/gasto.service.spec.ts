import { Test, TestingModule } from '@nestjs/testing';
import { GastoService } from './gasto.service';
import { PrismaService } from '../prisma/prisma.service';

describe('GastoService', () => {
  let service: GastoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GastoService,
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<GastoService>(GastoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
