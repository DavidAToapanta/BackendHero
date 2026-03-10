import { Test, TestingModule } from '@nestjs/testing';
import { AsistenciaService } from './asistencia.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AsistenciaService', () => {
  let service: AsistenciaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AsistenciaService,
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<AsistenciaService>(AsistenciaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
