import {
  IsEmail,
  IsEmpty,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { TenantRole } from '@prisma/client';

export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  nombres?: string;

  @IsOptional()
  @IsString()
  apellidos?: string;

  @IsOptional()
  @IsString()
  cedula?: string;

  @IsOptional()
  @IsString()
  fechaNacimiento?: string;

  @IsOptional()
  @IsString()
  userName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Length(6)
  password?: string;

  @IsOptional()
  @IsEnum(TenantRole)
  tenantRole?: TenantRole;

  @IsOptional()
  @IsString()
  horario?: string;

  @IsOptional()
  @IsNumber()
  sueldo?: number;

  @IsOptional()
  @IsEmpty({ message: 'tenantId no debe enviarse en el body' })
  tenantId?: never;

  @IsOptional()
  @IsEmpty({ message: 'usuarioId no debe enviarse en el body' })
  usuarioId?: never;

  @IsOptional()
  @IsEmpty({ message: 'estado no debe enviarse en el body' })
  estado?: never;
}
