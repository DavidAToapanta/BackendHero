import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  IsEnum,
} from 'class-validator';

export enum UnidadDuracion {
  MESES = 'MESES',
  DIAS = 'DIAS',
}

export class CreatePlanDto {
  @IsNotEmpty()
  @IsString()
  nombre: string;

  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  precio: number;

  @IsNotEmpty()
  @IsInt()
  @IsPositive()
  duracion: number;

  @IsNotEmpty()
  @IsEnum(UnidadDuracion)
  unidadDuracion: UnidadDuracion;
}
