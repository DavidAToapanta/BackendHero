import {
  Controller,
  Get,
  Param,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { RequierePermisoTienda } from '../accesos/accesos.module';
import { ContextoTiendaActual, type ContextoTienda } from '../auth';
import { MAX_PRISMA_INT } from '../auth/auth.types';
import {
  booleanoHttp,
  enteroHttp,
  PaginaTiendaDto,
  presente,
} from '../comun/consulta-tienda.dto';
import { CarteraService } from './cartera.service';

class ClienteCarteraDto {
  @Transform(enteroHttp)
  @ValidateIf(presente)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  clienteComercialId?: number;
}

class PendientesCarteraDto extends PaginaTiendaDto {
  @Transform(enteroHttp)
  @ValidateIf(presente)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  clienteComercialId?: number;

  @Transform(booleanoHttp)
  @ValidateIf(presente)
  @IsBoolean()
  vencida?: boolean;

  @ValidateIf(presente)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  hasta?: string;
}

class CuentaParamDto {
  @Transform(enteroHttp)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  id: number;
}

@Controller('cartera')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class CarteraController {
  constructor(private readonly cartera: CarteraService) {}

  @Get()
  @RequierePermisoTienda('store.receivables.read')
  listar(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Query() filtros: PendientesCarteraDto,
  ) {
    return this.cartera.listarPendientes(contexto.tenantId, filtros);
  }

  @Get('deudores')
  @RequierePermisoTienda('store.receivables.read')
  deudores(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Query() filtros: PaginaTiendaDto,
  ) {
    return this.cartera.listarDeudores(
      contexto.tenantId,
      filtros.pagina,
      filtros.limite,
    );
  }

  @Get('resumen')
  @RequierePermisoTienda('store.receivables.read')
  resumen(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Query() filtros: ClienteCarteraDto,
  ) {
    return this.cartera.resumen(contexto.tenantId, filtros.clienteComercialId);
  }

  @Get(':id')
  @RequierePermisoTienda('store.receivables.read')
  obtener(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { id }: CuentaParamDto,
  ) {
    return this.cartera.obtener(contexto.tenantId, id);
  }
}
