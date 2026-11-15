import { Test, TestingModule } from '@nestjs/testing';
import { PanelController } from './panel.controller';
import { PanelService } from './panel.service';

describe('PanelController', () => {
  let controller: PanelController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PanelController],
      providers: [PanelService],
    }).compile();

    controller = module.get<PanelController>(PanelController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
