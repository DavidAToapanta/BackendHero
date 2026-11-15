import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { DevolucionesService } from './devoluciones.service';
import { CreateDevolucionDto } from './dto/create-devolucion.dto';
import { UpdateDevolucionDto } from './dto/update-devolucion.dto';

@Controller('devoluciones')
export class DevolucionesController {
  constructor(private readonly devolucionesService: DevolucionesService) {}

  @Post()
  create(@Body() createDevolucionDto: CreateDevolucionDto) {
    return this.devolucionesService.create(createDevolucionDto);
  }

  @Get()
  findAll() {
    return this.devolucionesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.devolucionesService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateDevolucionDto: UpdateDevolucionDto,
  ) {
    return this.devolucionesService.update(+id, updateDevolucionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.devolucionesService.remove(+id);
  }
}
