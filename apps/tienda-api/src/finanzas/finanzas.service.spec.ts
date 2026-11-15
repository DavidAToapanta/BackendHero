import { Test, TestingModule } from '@nestjs/testing';
import { FinanzasService } from './finanzas.service';

describe('FinanzasService', () => {
  let service: FinanzasService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FinanzasService],
    }).compile();

    service = module.get<FinanzasService>(FinanzasService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
