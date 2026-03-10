import { Test, TestingModule } from '@nestjs/testing';
import { PagoService } from './pago.service';
import { PrismaService } from '../prisma/prisma.service';
import { FacturaService } from '../factura/factura.service';

describe('PagoService', () => {
  let service: PagoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PagoService,
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: FacturaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<PagoService>(PagoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
