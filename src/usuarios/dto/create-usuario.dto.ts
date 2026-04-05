import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class CreateUsuarioDto {
  @IsOptional()
  @IsString()
  userName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsNotEmpty()
  @IsString()
  @Length(6)
  password: string;

  @IsNotEmpty()
  @IsString()
  nombres: string;

  @IsNotEmpty()
  @IsString()
  apellidos: string;

  @IsNotEmpty()
  @IsString()
  cedula: string;

  @IsOptional()
  @IsString()
  fechaNacimiento?: string;

  @IsNotEmpty()
  @IsString()
  rol: string;

  @IsOptional()
  @IsString()
  horario?: string;

  @IsOptional()
  @IsNumber()
  sueldo?: number;

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
