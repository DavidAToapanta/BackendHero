import { Transform } from 'class-transformer';
import { IsInt, IsString, Matches, Max, Min, NotEquals } from 'class-validator';
import { MAX_PRISMA_INT } from '../../auth/auth.types';
import { enteroHttp, ProductoParamDto } from '../../comun/consulta-tienda.dto';

export class LoteParamDto extends ProductoParamDto {
  @Transform(enteroHttp)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  loteId: number;
}

class MovimientoJustificadoDto {
  @IsString()
  @Matches(/\S/)
  motivo: string;
}

export class AjusteInventarioDto extends MovimientoJustificadoDto {
  @IsInt()
  @Min(-MAX_PRISMA_INT)
  @Max(MAX_PRISMA_INT)
  @NotEquals(0)
  delta: number;
}

export class BajaInventarioDto extends MovimientoJustificadoDto {
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  cantidad: number;
}
