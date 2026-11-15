import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { FinanzasService } from './finanzas.service';
import { CreateFinanzaDto } from './dto/create-finanza.dto';
import { UpdateFinanzaDto } from './dto/update-finanza.dto';

@Controller('finanzas')
export class FinanzasController {
  constructor(private readonly finanzasService: FinanzasService) {}

  @Post()
  create(@Body() createFinanzaDto: CreateFinanzaDto) {
    return this.finanzasService.create(createFinanzaDto);
  }

  @Get()
  findAll() {
    return this.finanzasService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.finanzasService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateFinanzaDto: UpdateFinanzaDto) {
    return this.finanzasService.update(+id, updateFinanzaDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.finanzasService.remove(+id);
  }
}
