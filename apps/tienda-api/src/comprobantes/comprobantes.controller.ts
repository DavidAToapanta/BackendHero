import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  StreamableFile,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { RequierePermisoTienda } from '../accesos/accesos.module';
import { AuditoriaEscrituraService } from '../auditoria/auditoria-escritura';
import { ContextoTiendaActual, type ContextoTienda } from '../auth';
import { MAX_PRISMA_INT } from '../auth/auth.types';
import { EmisionComprobanteService } from './emision-comprobante.service';

class EmitirComprobanteDto {
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  ventaId: number;
}

class ComprobanteParamDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  id: number;
}

class ListaComprobantesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  pagina?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite?: number;
}

@Controller('comprobantes')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class ComprobantesController {
  constructor(
    private readonly comprobantes: EmisionComprobanteService,
    private readonly auditoria: AuditoriaEscrituraService,
  ) {}

  @Post()
  @RequierePermisoTienda('store.receipts.issue')
  emitir(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Body() { ventaId }: EmitirComprobanteDto,
    @Headers('idempotency-key') clave: string | undefined,
  ) {
    return this.comprobantes.emitir(
      this.auditoria.paraOperacion(contexto, randomUUID()),
      ventaId,
      clave,
    );
  }

  @Get()
  @RequierePermisoTienda('store.receipts.read')
  listar(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Query() filtros: ListaComprobantesDto,
  ) {
    return this.comprobantes.listar(
      contexto.tenantId,
      filtros.pagina,
      filtros.limite,
    );
  }

  @Get(':id')
  @RequierePermisoTienda('store.receipts.read')
  obtener(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { id }: ComprobanteParamDto,
  ) {
    return this.comprobantes.obtener(contexto.tenantId, id);
  }

  @Get(':id/pdf')
  @RequierePermisoTienda('store.receipts.read')
  async descargar(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { id }: ComprobanteParamDto,
  ) {
    return new StreamableFile(
      await this.comprobantes.descargarPdf(contexto.tenantId, id),
      {
        type: 'application/pdf',
        disposition: `attachment; filename="comprobante-${id}.pdf"`,
      },
    );
  }
}
