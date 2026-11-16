import { TipoActorOperacion } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { MAX_PRISMA_INT } from '../../auth/auth.types';
import {
  enteroHttp,
  PaginaTiendaDto,
  presente,
} from '../../comun/consulta-tienda.dto';

const fechaConZona =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export class ConsultaAuditoriaDto extends PaginaTiendaDto {
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(fechaConZona)
  desde: string;

  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(fechaConZona)
  hasta: string;

  @Transform(enteroHttp)
  @ValidateIf(presente)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  productoId?: number;

  @Transform(enteroHttp)
  @ValidateIf(presente)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  usuarioId?: number;

  @ValidateIf(presente)
  @IsEnum(TipoActorOperacion)
  actor?: TipoActorOperacion;

  @ValidateIf(presente)
  @IsString()
  @Matches(/\S/)
  @MaxLength(120)
  rolCodigo?: string;

  @ValidateIf(presente)
  @IsString()
  @Matches(/\S/)
  @MaxLength(120)
  accion?: string;
}
