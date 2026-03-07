import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PagoService } from './pago.service';
import { CreatePagoDto } from './dto/create-pago.dto';
import { UpdatePagoDto } from './dto/update-pago.dto';

@Controller('pago')
export class PagoController {
    constructor(private readonly pagoService: PagoService) {}

  @Post()
  create(@Body() dto: CreatePagoDto) {
    return this.pagoService.create(dto);
  }

  
  @Get()
  findAll(@Query('page') page = '1', @Query('limit') limit = '10', @Query('search') search = '') {
    return this.pagoService.findAll(+page, +limit, search);
  }

  @Get('Ingresos-mes')
  async ingresosDelMes(){
    const total = await this.pagoService.obtenerIngresoDelMes();
    return { ingresos: total};
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.pagoService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePagoDto) {
    return this.pagoService.update(+id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.pagoService.remove(+id);
  }
}
