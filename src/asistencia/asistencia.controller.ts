import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { AsistenciaService } from './asistencia.service';
import { MarcarAsistenciaDto } from './dto/marcar-asistencia.dto';

@Controller('asistencia')
export class AsistenciaController {
  constructor(private readonly asistenciaService: AsistenciaService) {}

  //Es un endpoint HTTP POST que recibe un ID de cliente desde la URL
  //y llama al servicio para registrar su asistencia.
  @Post('registrar/:clienteId')
  registrar(@Param('clienteId') clienteId: string) {
    return this.asistenciaService.registrarAsistencia(+clienteId);
  }

  @Post()
  marcarAsistencia(@Body() marcarAsistenciaDto: MarcarAsistenciaDto) {
    return this.asistenciaService.marcarAsistencia(
      marcarAsistenciaDto.usuarioId,
    );
  }

  @Get('historial/:clienteId')
  historial(@Param('clienteId') clienteId: string) {
    return this.asistenciaService.historial(+clienteId);
  }

  // Changed to 'todas' to avoid conflict with findAll @Get()
  @Get('todas')
  todas() {
    return this.asistenciaService.todas();
  }

  @Get()
  findAll() {
    return this.asistenciaService.findAll();
  }

  @Get('estadisticas/:clienteId')
  estadisticas(@Param('clienteId') clienteId: string) {
    return this.asistenciaService.getEstadisticasPorPlan(+clienteId);
  }

  @Get('cliente/:clienteId')
  findByCliente(@Param('clienteId', ParseIntPipe) clienteId: number) {
    return this.asistenciaService.findByCliente(clienteId);
  }
}
