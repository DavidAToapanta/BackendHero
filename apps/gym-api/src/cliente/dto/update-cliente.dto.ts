import { PartialType } from '@nestjs/mapped-types';
import { CreateClienteDto } from './create-cliente.dto';
import {
  IsIBAN,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class UpdateClienteDto extends PartialType(CreateClienteDto) {
  @IsOptional()
  @IsInt()
  @IsPositive()
  usuarioId?: number;

  @IsOptional()
  @IsString()
  horario?: string;

  @IsOptional()
  @IsString()
  sexo?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsOptional()
  @IsString()
  objetivos?: string;

  @IsOptional()
  @IsInt()
  tiempoEntrenar?: number;
}
