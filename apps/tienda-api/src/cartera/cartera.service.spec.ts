import { Test, TestingModule } from '@nestjs/testing';
import { CarteraService } from './cartera.service';

describe('CarteraService', () => {
  let service: CarteraService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CarteraService],
    }).compile();

    service = module.get<CarteraService>(CarteraService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
