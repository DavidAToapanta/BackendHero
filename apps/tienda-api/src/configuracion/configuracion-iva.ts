import { randomUUID } from 'node:crypto';
import { PermisosModule, PermisosService } from '@app/permisos';
import { PrismaModule, PrismaService } from '@app/prisma';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Module,
  Put,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsOptional, Matches } from 'class-validator';
import {
  ACCIONES_AUDITORIA,
  AuditoriaEscrituraModule,
  AuditoriaEscrituraService,
} from '../auditoria/auditoria-escritura';
import {
  ContextoTiendaActual,
  TiendaJwtGuard,
  type ContextoTienda,
} from '../auth';
import { AuthModule } from '../auth/auth.module';
import { fechaComercial, inicioFechaComercial } from '../comun/fecha-comercial';
import { tarifaIvaVigente } from '../comun/iva-tienda';

class TarifaIvaDto {
  @Matches(/^(?:100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)$/)
  porcentaje: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fecha?: string;
}

@Controller('configuracion/iva')
@UseGuards(TiendaJwtGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
class ConfiguracionIvaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permisos: PermisosService,
    private readonly auditoria: AuditoriaEscrituraService,
  ) {}

  @Get()
  consultar(@ContextoTiendaActual() contexto: ContextoTienda) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.permisos.exigirPropietarioTienda(contexto, tx);
        const ahora = new Date();
        const { tenantId } = contexto;
        const [vigente, programadas] = await Promise.all([
          tarifaIvaVigente(tx, tenantId, ahora),
          tx.tarifaIvaTienda.findMany({
            where: { tenantId, vigenteDesde: { gt: ahora } },
            orderBy: { vigenteDesde: 'asc' },
          }),
        ]);
        return { vigente, programadas };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  @Put()
  async cambiar(
    @ContextoTiendaActual() contexto: ContextoTienda,
    @Body() dto: TarifaIvaDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.permisos.exigirPropietarioTienda(contexto, tx);
      const ahora = new Date();
      const hoy = fechaComercial(ahora);
      if (dto.fecha && dto.fecha < hoy) {
        throw new BadRequestException('Elige hoy o una fecha futura');
      }
      const vigenteDesde =
        dto.fecha && dto.fecha !== hoy
          ? inicioFechaComercial(dto.fecha)
          : ahora;
      const { tenantId } = contexto;
      const porcentaje = new Prisma.Decimal(dto.porcentaje);
      const identidad = { tenantId_vigenteDesde: { tenantId, vigenteDesde } };
      const anterior = await tarifaIvaVigente(tx, tenantId, vigenteDesde);
      if (
        anterior?.porcentaje.eq(porcentaje) &&
        (vigenteDesde === ahora ||
          anterior.vigenteDesde.getTime() === vigenteDesde.getTime())
      ) {
        return anterior;
      }
      const tarifa = await tx.tarifaIvaTienda.upsert({
        where: identidad,
        create: { tenantId, vigenteDesde, porcentaje },
        update: { porcentaje },
      });
      await this.auditoria.registrar(tx, contexto, {
        accion: ACCIONES_AUDITORIA.IVA_CONFIGURAR,
        entidadTipo: 'TarifaIvaTienda',
        entidadId: tarifa.id,
        correlacionId: randomUUID(),
        datos: {
          porcentajeAnterior: anterior?.porcentaje.toFixed(2) ?? null,
          porcentaje: porcentaje.toFixed(2),
          vigenteDesde: vigenteDesde.toISOString(),
        },
      });
      return tarifa;
    });
  }
}

@Module({
  imports: [AuthModule, PrismaModule, PermisosModule, AuditoriaEscrituraModule],
  controllers: [ConfiguracionIvaController],
})
export class ConfiguracionIvaModule {}
