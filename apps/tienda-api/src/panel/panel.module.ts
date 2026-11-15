import { Module } from '@nestjs/common';
import { PanelService } from './panel.service';
import { PanelController } from './panel.controller';

@Module({
  controllers: [PanelController],
  providers: [PanelService],
})
export class PanelModule {}
