import { PermisosService } from '@app/permisos';
import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  StreamableFile,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, Max, Min } from 'class-validator';
import { RequierePermisoTienda } from '../accesos/accesos.module';
import { ContextoTiendaActual, type ContextoTienda } from '../auth';
import { MAX_PRISMA_INT } from '../auth/auth.types';
import { CajaService } from '../caja/caja.service';
import { enteroHttp, PeriodoComercialDto } from '../comun/consulta-tienda.dto';
import { AnalizarVentasDto } from '../ventas/dto/consulta-ventas.dto';
import {
  ExportacionesTiendaService,
  type Formato,
} from './exportaciones-tienda.service';

class ArchivoParamDto {
  @IsIn(['xlsx', 'pdf'])
  formato: Formato;
}

class ArchivoTurnoParamDto extends ArchivoParamDto {
  @Transform(enteroHttp)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  id: number;
}

@Controller('exportaciones')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class ExportacionesController {
  constructor(
    private readonly exportaciones: ExportacionesTiendaService,
    private readonly caja: CajaService,
    private readonly permisos: PermisosService,
  ) {}

  @Get('ventas/:formato')
  @Header('Cache-Control', 'private, no-store')
  @RequierePermisoTienda('store.sales.analytics.read', 'store.reports.export')
  async ventas(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { formato }: ArchivoParamDto,
    @Query() filtros: AnalizarVentasDto,
  ) {
    const archivo = await this.exportaciones.exportarVentas(
      contexto.tenantId,
      filtros,
      filtros.granularidad === 'mes' ? 'month' : 'week',
      formato,
    );
    return this.adjuntar(archivo, `ventas.${formato}`);
  }

  @Get('finanzas/:formato')
  @Header('Cache-Control', 'private, no-store')
  @RequierePermisoTienda('store.reports.read', 'store.reports.export')
  async finanzas(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { formato }: ArchivoParamDto,
    @Query() periodo: PeriodoComercialDto,
  ) {
    const archivo = await this.exportaciones.exportarFinanzas(
      contexto.tenantId,
      periodo,
      formato,
    );
    return this.adjuntar(archivo, `finanzas.${formato}`);
  }

  @Get('caja/turnos/:id/:formato')
  @Header('Cache-Control', 'private, no-store')
  @RequierePermisoTienda('store.cash.read', 'store.reports.export')
  async cierre(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Param() { id, formato }: ArchivoTurnoParamDto,
  ) {
    const turno = await this.caja.obtenerTurno(contexto.tenantId, id);
    if (turno.cajeroId !== contexto.membresiaId) {
      await this.permisos.autorizar(contexto, 'store.cash.manage');
    }
    const archivo = await this.exportaciones.exportarCierre(turno, formato);
    return this.adjuntar(archivo, `cierre-${id}.${formato}`);
  }

  private adjuntar(
    archivo: { contenido: Buffer; contentType: string },
    nombre: string,
  ) {
    return new StreamableFile(archivo.contenido, {
      type: archivo.contentType,
      disposition: `attachment; filename="${nombre}"`,
    });
  }
}
