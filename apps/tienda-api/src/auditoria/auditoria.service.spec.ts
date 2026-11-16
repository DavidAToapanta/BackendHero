import { Test, TestingModule } from '@nestjs/testing';
import { PermisosService } from '@app/permisos';
import { PrismaService } from '@app/prisma';
import { AuditoriaService } from './auditoria.service';

describe('AuditoriaService', () => {
  let service: AuditoriaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditoriaService,
        { provide: PrismaService, useValue: {} },
        { provide: PermisosService, useValue: {} },
      ],
    }).compile();

    service = module.get<AuditoriaService>(AuditoriaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
