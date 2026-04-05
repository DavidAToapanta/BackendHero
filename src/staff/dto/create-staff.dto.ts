import {
  IsEmail,
  IsEmpty,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  ValidateIf,
} from 'class-validator';
import { TenantRole } from '@prisma/client';

const requiresLegacyStaffProfile = (role?: TenantRole) =>
  role === TenantRole.ENTRENADOR || role === TenantRole.RECEPCIONISTA;

export class CreateStaffDto {
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

  @IsEnum(TenantRole)
  tenantRole: TenantRole;

  @ValidateIf((dto: CreateStaffDto) =>
    requiresLegacyStaffProfile(dto.tenantRole),
  )
  @IsNotEmpty()
  @IsString()
  horario?: string;

  @ValidateIf((dto: CreateStaffDto) =>
    requiresLegacyStaffProfile(dto.tenantRole),
  )
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
