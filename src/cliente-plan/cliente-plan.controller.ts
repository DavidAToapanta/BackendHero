import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ClientePlanService } from './cliente-plan.service';
import { CreateClientePlanDto } from './dto/create-cliente-plan.dto';
import { UpdateClientePlanDto } from './dto/update-cliente-plan.dto';
import { CambiarPlanDto } from './dto/cambiar-plan.dto';

@Controller('cliente-plan')
export class ClientePlanController {
    constructor(private readonly clientePlanService: ClientePlanService){}

    @Post()
    create(@Body() dto: CreateClientePlanDto){
        return this.clientePlanService.create(dto);
    }

    @Get()
    findAll(){
        return this.clientePlanService.findAll();
    }

    @Get('activos')
    async obtenerClientesActivos() {
      console.log('→ Llamando a contarClientesActivos');
      const cantidad = await this.clientePlanService.contarClientesActivos();
      return { activos: cantidad };
    }

    // IMPORTANTE: ruta estática antes de :id para evitar conflictos
    @Post(':id/cambiar-plan')
    cambiarPlan(@Param('id') id: string, @Body() dto: CambiarPlanDto) {
      return this.clientePlanService.cambiarPlan(+id, dto);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
      return this.clientePlanService.findOne(+id);
}


@Patch(':id')
update(@Param('id') id: string, @Body() dto: UpdateClientePlanDto) {
  return this.clientePlanService.update(+id, dto);
}

@Delete(':id')
remove(@Param('id') id: string) {
  return this.clientePlanService.remove(+id);
}

@Post('renovar/:clienteId')
async renovarPlan(
  @Param('clienteId') clienteId: string,
  @Body() dto: CreateClientePlanDto
) {
  // Asegurar que el clienteId del DTO coincida con el parámetro
  dto.clienteId = +clienteId;
  return this.clientePlanService.create(dto);
}

}
