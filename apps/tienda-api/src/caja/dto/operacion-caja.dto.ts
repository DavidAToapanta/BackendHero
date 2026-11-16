import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { MAX_PRISMA_INT } from '../../auth/auth.types';

const presente = (_dto: object, valor: unknown) => valor !== undefined;
const formatoImporte = /^\d{1,16}(?:\.\d{1,2})?$/;

export class ConfigurarCajaDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(60)
  codigo: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(120)
  nombre: string;

  @ValidateIf(presente)
  @IsBoolean()
  activo?: boolean;
}

export class EditarCajaDto extends PartialType(ConfigurarCajaDto, {
  skipNullProperties: false,
}) {}

export class CajaParamDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  id: number;
}

export class ListaCajasDto {
  @ValidateIf(presente)
  @IsIn(['true', 'false'])
  disponibles?: 'true' | 'false';
}

export class AbrirTurnoDto {
  @Matches(formatoImporte)
  fondoInicial: string;
}

export class ListaMovimientosDto {
  @ValidateIf(presente)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  pagina?: number;

  @ValidateIf(presente)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite?: number;
}

export class MovimientoCajaDto {
  @Matches(formatoImporte)
  monto: string;

  @IsIn(['ENTRADA', 'SALIDA'])
  direccion: 'ENTRADA' | 'SALIDA';

  @IsString()
  @Matches(/\S/)
  @MaxLength(300)
  motivo: string;
}

export class CerrarTurnoDto {
  @Matches(formatoImporte)
  efectivoContado: string;

  @ValidateIf(presente)
  @IsString()
  @MaxLength(300)
  motivo?: string;
}
