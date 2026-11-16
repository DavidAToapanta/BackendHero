import { MetodoCobro } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
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

export class RegistrarCobroDto {
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  ventaId: number;

  @ValidateIf(presente)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  cuentaId?: number;

  @IsEnum(MetodoCobro)
  metodo: MetodoCobro;

  @Matches(/^\d{1,16}(?:\.\d{1,2})?$/)
  monto: string;

  @ValidateIf(presente)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  turnoId?: number;

  @ValidateIf(presente)
  @IsString()
  @MaxLength(200)
  referencia?: string;
}

export class CobroParamDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  id: number;
}

export class ListaCobrosDto {
  @ValidateIf(presente)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  clienteComercialId?: number;

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
