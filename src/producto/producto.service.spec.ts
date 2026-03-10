import { Test, TestingModule } from '@nestjs/testing';
import { ProductoService } from './producto.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ProductoService', () => {
  let service: ProductoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductoService,
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<ProductoService>(ProductoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
