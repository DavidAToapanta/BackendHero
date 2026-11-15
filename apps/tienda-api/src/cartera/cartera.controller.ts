import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { CarteraService } from './cartera.service';
import { CreateCarteraDto } from './dto/create-cartera.dto';
import { UpdateCarteraDto } from './dto/update-cartera.dto';

@Controller('cartera')
export class CarteraController {
  constructor(private readonly carteraService: CarteraService) {}

  @Post()
  create(@Body() createCarteraDto: CreateCarteraDto) {
    return this.carteraService.create(createCarteraDto);
  }

  @Get()
  findAll() {
    return this.carteraService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.carteraService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCarteraDto: UpdateCarteraDto) {
    return this.carteraService.update(+id, updateCarteraDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.carteraService.remove(+id);
  }
}
