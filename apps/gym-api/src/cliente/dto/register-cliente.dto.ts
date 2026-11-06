import {
  IsEmail,
  IsEmpty,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class RegisterClienteDto {
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
  horario: string;

  @IsNotEmpty()
  @IsString()
  sexo: string;

  @IsNotEmpty()
  @IsString()
  observaciones: string;

  @IsNotEmpty()
  @IsString()
  objetivos: string;

  @IsNotEmpty()
  @IsInt()
  tiempoEntrenar: number;

  @IsOptional()
  @IsEmpty({ message: 'usuarioId no debe enviarse en el body' })
  usuarioId?: never;

  @IsOptional()
  @IsEmpty({ message: 'tenantId no debe enviarse en el body' })
  tenantId?: never;
}
