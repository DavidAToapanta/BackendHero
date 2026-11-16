import { TipoMovimientoInventario } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  booleanoHttp,
  PaginaTiendaDto,
  presente,
} from '../../comun/consulta-tienda.dto';

export class ProductosInventarioDto extends PaginaTiendaDto {
  @ValidateIf(presente)
  @IsString()
  @MaxLength(120)
  q?: string;

  @Transform(booleanoHttp)
  @ValidateIf(presente)
  @IsBoolean()
  activo?: boolean;
}

class PaginaConCostosDto extends PaginaTiendaDto {
  @Transform(booleanoHttp)
  @ValidateIf(presente)
  @IsBoolean()
  incluirCostos?: boolean;
}

export class LotesInventarioDto extends PaginaConCostosDto {
  @Transform(booleanoHttp)
  @ValidateIf(presente)
  @IsBoolean()
  soloVendibles?: boolean;
}

export class MovimientosInventarioDto extends PaginaConCostosDto {
  @ValidateIf(presente)
  @IsEnum(TipoMovimientoInventario)
  tipo?: TipoMovimientoInventario;

  @ValidateIf(presente)
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  desde?: string;

  @ValidateIf(presente)
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  hasta?: string;
}
