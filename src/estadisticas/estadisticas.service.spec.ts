import { Test, TestingModule } from '@nestjs/testing';
import { EstadisticasService } from './estadisticas.service';
import { PrismaService } from '../prisma/prisma.service';

describe('EstadisticasService', () => {
  let service: EstadisticasService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EstadisticasService,
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<EstadisticasService>(EstadisticasService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
