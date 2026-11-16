import { Type } from 'class-transformer';
import {
  IsArray,
  IsISO8601,
  IsInt,
  IsObject,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { MAX_PRISMA_INT } from '../../auth/auth.types';
import { presente } from '../../comun/consulta-tienda.dto';

class LoteEntradaDto {
  @IsString()
  @Matches(/\S/)
  codigo: string;

  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  cantidad: number;

  @IsString()
  @Matches(/^0*\d{1,14}(?:\.\d{1,4})?$/)
  costoUnitario: string;

  @ValidateIf(presente)
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2})$/)
  vencimiento?: string;
}

export class RegistrarEntradaInventarioDto {
  @IsString()
  @Matches(/\S/)
  motivo: string;

  @ValidateIf(presente)
  @IsString()
  @Matches(/\S/)
  referenciaExterna?: string;

  @IsArray()
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => LoteEntradaDto)
  lotes: LoteEntradaDto[];
}
