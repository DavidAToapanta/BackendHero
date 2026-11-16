import { EstadoVenta } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsInt, Max, Min, ValidateIf } from 'class-validator';
import { MAX_PRISMA_INT } from '../../auth/auth.types';
import {
  enteroHttp,
  PeriodoComercialDto,
  presente,
} from '../../comun/consulta-tienda.dto';

class FiltrosVentaDto extends PeriodoComercialDto {
  @ValidateIf(presente)
  @Transform(enteroHttp)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  categoriaId?: number;

  @ValidateIf(presente)
  @Transform(enteroHttp)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  productoId?: number;

  @ValidateIf(presente)
  @Transform(enteroHttp)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  cajeroId?: number;
}

export class ListarVentasDto extends FiltrosVentaDto {
  @ValidateIf(presente)
  @IsEnum(EstadoVenta)
  estado?: EstadoVenta;

  @ValidateIf(presente)
  @Transform(enteroHttp)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  pagina?: number;

  @ValidateIf(presente)
  @Transform(enteroHttp)
  @IsInt()
  @Min(1)
  @Max(100)
  limite?: number;
}

export class AnalizarVentasDto extends FiltrosVentaDto {
  @ValidateIf(presente)
  @IsIn(['semana', 'mes'])
  granularidad?: 'semana' | 'mes';
}

export class VentaParamDto {
  @Transform(enteroHttp)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  id: number;
}
