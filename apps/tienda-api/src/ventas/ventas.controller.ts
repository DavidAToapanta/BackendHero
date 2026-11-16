import { randomUUID } from 'node:crypto';
import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Patch,
  Param,
  Delete,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { EstadoVenta } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { RequierePermisoTienda } from '../accesos/accesos.module';
import { AuditoriaEscrituraService } from '../auditoria/auditoria-escritura';
import { ContextoTiendaActual, type ContextoTienda } from '../auth';
import { MAX_PRISMA_INT } from '../auth/auth.types';
import { enteroHttp, presente } from '../comun/consulta-tienda.dto';
import { DevolucionesOperacionService } from '../devoluciones/devoluciones-operacion.service';
import {
  AnularVentaDto,
  DevolucionParamDto,
} from '../devoluciones/dto/create-devolucion.dto';
import { VentaMostradorService } from './venta-mostrador.service';
import { ConsultaVentasService } from './consulta-ventas.service';
import { VentasService } from './ventas.service';
import { CreateVentaCreditoDto, CreateVentaDto } from './dto/create-venta.dto';
import { UpdateVentaDto } from './dto/update-venta.dto';

class FiltrosVentaDto {
  @IsString()
  desde: string;

  @IsString()
  hasta: string;

  @ValidateIf(presente)
  @Transform(enteroHttp)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  categoriaId?: number;

  @ValidateIf(presente)
  @Transform(enteroHttp)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  productoId?: number;

  @ValidateIf(presente)
  @Transform(enteroHttp)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  cajeroId?: number;
}

class ListarVentasDto extends FiltrosVentaDto {
  @ValidateIf(presente)
  @IsEnum(EstadoVenta)
  estado?: EstadoVenta;

  @ValidateIf(presente)
  @Transform(enteroHttp)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  pagina?: number;

  @ValidateIf(presente)
  @Transform(enteroHttp)
  @IsInt()
  @Min(1)
  @Max(100)
  limite?: number;
}

class AnalizarVentasDto extends FiltrosVentaDto {
  @ValidateIf(presente)
  @IsIn(['semana', 'mes'])
  granularidad?: 'semana' | 'mes';
}

class VentaParamDto {
  @Transform(enteroHttp)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  id: number;
}

const validarVenta = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('ventas')
export class VentasController {
  constructor(
    private readonly ventasService: VentasService,
    private readonly mostrador: VentaMostradorService,
    private readonly auditoria: AuditoriaEscrituraService,
    private readonly devoluciones: DevolucionesOperacionService,
    private readonly consultas: ConsultaVentasService,
  ) {}

  @Post()
  @RequierePermisoTienda('store.sales.create')
  @UsePipes(validarVenta)
  confirmar(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Body() datos: CreateVentaDto,
    @Headers('idempotency-key') clave: string | undefined,
  ) {
    const correlacionId = randomUUID();
    return this.mostrador.confirmar(
      this.auditoria.paraOperacion(contexto, correlacionId),
      datos,
      clave,
      correlacionId,
    );
  }

  @Post('credito')
  @RequierePermisoTienda('store.sales.create', 'store.sales.credit')
  @UsePipes(validarVenta)
  confirmarCredito(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Body() datos: CreateVentaCreditoDto,
    @Headers('idempotency-key') clave: string | undefined,
  ) {
    const correlacionId = randomUUID();
    return this.mostrador.confirmar(
      this.auditoria.paraOperacion(contexto, correlacionId),
      datos,
      clave,
      correlacionId,
    );
  }

  @Get()
  @RequierePermisoTienda('store.sales.read')
  @UsePipes(validarVenta)
  listar(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Query() filtros: ListarVentasDto,
  ) {
    return this.consultas.listar(contexto.tenantId, filtros);
  }

  @Get('analisis')
  @RequierePermisoTienda('store.sales.analytics.read')
  @UsePipes(validarVenta)
  analizar(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Query() filtros: AnalizarVentasDto,
  ) {
    return this.consultas.analizar(
      contexto.tenantId,
      filtros,
      filtros.granularidad === 'mes' ? 'month' : 'week',
    );
  }

  @Post(':id/anulacion')
  @RequierePermisoTienda('store.sales.void')
  @UsePipes(validarVenta)
  anular(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { id }: DevolucionParamDto,
    @Body() datos: AnularVentaDto,
    @Headers('idempotency-key') clave: string | undefined,
  ) {
    const correlacionId = randomUUID();
    return this.devoluciones.anular(
      this.auditoria.paraOperacion(contexto, correlacionId),
      {
        ...datos,
        ventaId: id,
        lineas: datos.lineas ?? [],
        liberar: datos.liberar ?? [],
      },
      clave,
      correlacionId,
    );
  }

  @Get(':id')
  @RequierePermisoTienda('store.sales.read')
  @UsePipes(validarVenta)
  obtener(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { id }: VentaParamDto,
  ) {
    return this.consultas.obtener(contexto.tenantId, id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateVentaDto: UpdateVentaDto) {
    return this.ventasService.update(+id, updateVentaDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ventasService.remove(+id);
  }
}
