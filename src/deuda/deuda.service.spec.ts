import { Test, TestingModule } from '@nestjs/testing';
import { DeudaService } from './deuda.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DeudaService', () => {
  let service: DeudaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeudaService,
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<DeudaService>(DeudaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
