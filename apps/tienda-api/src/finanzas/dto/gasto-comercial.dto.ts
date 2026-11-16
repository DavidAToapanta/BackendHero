import { MetodoCobro } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { MAX_PRISMA_INT } from '../../auth/auth.types';

const presente = (_dto: object, valor: unknown) => valor !== undefined;
const zonaHoraria = /T.+(?:Z|[+-]\d{2}:\d{2})$/;

export class RegistrarGastoDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(300)
  concepto: string;

  @ValidateIf(presente)
  @IsString()
  @MaxLength(120)
  categoria?: string;

  @IsEnum(MetodoCobro)
  metodo: MetodoCobro;

  @Matches(/^\d{1,16}(?:\.\d{1,2})?$/)
  monto: string;

  @ValidateIf(presente)
  @IsString()
  @MaxLength(200)
  referencia?: string;

  @ValidateIf(presente)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  turnoId?: number;

  @ValidateIf(presente)
  @IsISO8601({ strict: true })
  @Matches(zonaHoraria)
  fecha?: string;
}

export class ListaGastosDto {
  @ValidateIf(presente)
  @IsISO8601({ strict: true })
  @Matches(zonaHoraria)
  desde?: string;

  @ValidateIf(presente)
  @IsISO8601({ strict: true })
  @Matches(zonaHoraria)
  hasta?: string;

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
