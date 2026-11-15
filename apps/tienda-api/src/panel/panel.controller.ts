import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { PanelService } from './panel.service';
import { CreatePanelDto } from './dto/create-panel.dto';
import { UpdatePanelDto } from './dto/update-panel.dto';

@Controller('panel')
export class PanelController {
  constructor(private readonly panelService: PanelService) {}

  @Post()
  create(@Body() createPanelDto: CreatePanelDto) {
    return this.panelService.create(createPanelDto);
  }

  @Get()
  findAll() {
    return this.panelService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.panelService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePanelDto: UpdatePanelDto) {
    return this.panelService.update(+id, updatePanelDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.panelService.remove(+id);
  }
}
