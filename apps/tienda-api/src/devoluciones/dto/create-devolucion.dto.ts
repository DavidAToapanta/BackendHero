import { DestinoDevolucionVenta, MetodoCobro } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { MAX_PRISMA_INT } from '../../auth/auth.types';
import {
  enteroHttp,
  PaginaTiendaDto,
  presente,
} from '../../comun/consulta-tienda.dto';

class LineaDevolucionDto {
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  asignacionVentaId: number;

  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  cantidad: number;

  @IsEnum(DestinoDevolucionVenta)
  destino: DestinoDevolucionVenta;
}

class MedioReembolsoDto {
  @IsEnum(MetodoCobro)
  metodo: MetodoCobro;

  @ValidateIf(presente)
  @IsString()
  @MaxLength(200)
  referencia?: string;
}

class LiberacionCobroDto {
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  aplicacionId: number;

  @IsString()
  @Matches(/^\d{1,16}(?:\.\d{1,2})?$/)
  monto: string;

  @ValidateIf(presente)
  @IsObject()
  @ValidateNested()
  @Type(() => MedioReembolsoDto)
  reembolso?: MedioReembolsoDto;
}

class TurnosDevolucionDto {
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  reembolso: number;
}

export class CreateDevolucionDto {
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  ventaId: number;

  @IsString()
  @MaxLength(200)
  motivo: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => LineaDevolucionDto)
  lineas: LineaDevolucionDto[];

  @ValidateIf(presente)
  @IsArray()
  @ArrayMaxSize(100)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => LiberacionCobroDto)
  liberar?: LiberacionCobroDto[];

  @ValidateIf(presente)
  @IsObject()
  @ValidateNested()
  @Type(() => TurnosDevolucionDto)
  turnos?: TurnosDevolucionDto;
}

export class ListaDevolucionesDto extends PaginaTiendaDto {
  @Transform(enteroHttp)
  @ValidateIf(presente)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  ventaId?: number;
}

export class DevolucionParamDto {
  @Transform(enteroHttp)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  id: number;
}
