import {
  IsInt,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsString,
  IsNumber,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSerieRepDto {
  @IsNotEmpty()
  @IsInt()
  orden: number;

  @IsNotEmpty()
  @IsNumber()
  peso: number;

  @IsNotEmpty()
  @IsInt()
  repeticiones: number;

  @IsNotEmpty()
  @IsString()
  unidadMedida: string;
}

export class CreateSerieTiempoDto {
  @IsNotEmpty()
  @IsInt()
  orden: number;

  @IsNotEmpty()
  @IsNumber()
  peso: number;

  @IsNotEmpty()
  @IsInt()
  tiempo: number;

  @IsNotEmpty()
  @IsString()
  unidadMedida: string;
}

export class CreateEjercicioDto {
  @IsNotEmpty()
  @IsString()
  nombre: string;
}

export class CreateEjercicioMusculoDto {
  @IsNotEmpty()
  @IsInt()
  orden: number;

  @ValidateNested()
  @Type(() => CreateEjercicioDto)
  ejercicio: CreateEjercicioDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSerieRepDto)
  seriesReps?: CreateSerieRepDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSerieTiempoDto)
  seriesTiempos?: CreateSerieTiempoDto[];
}

export class CreateMusculoSemanaDto {
  @IsNotEmpty()
  @IsInt()
  orden: number;

  @IsNotEmpty()
  @IsString()
  musculo: string; // nombre del músculo

  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEjercicioMusculoDto)
  ejercicios: CreateEjercicioMusculoDto[];
}

export class CreateSemanaDto {
  @IsNotEmpty()
  @IsInt()
  numero: number;

  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMusculoSemanaDto)
  musculos: CreateMusculoSemanaDto[];
}

export class CreateEntrenamientoDto {
  @IsNotEmpty()
  @IsInt()
  rutinaId: number;

  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSemanaDto)
  semanas: CreateSemanaDto[];
}
