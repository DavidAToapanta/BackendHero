import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class RegistroPropietarioDto {
  @Matches(/\S/)
  @MaxLength(60)
  cedula: string;

  @Matches(/\S/)
  password: string;

  @Matches(/\S/)
  @MaxLength(120)
  nombres: string;

  @Matches(/\S/)
  @MaxLength(120)
  apellidos: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

  @Matches(/\S/)
  @MaxLength(120)
  tenantNombre: string;

  @IsOptional()
  @Matches(/\S/)
  @MaxLength(120)
  tenantSlug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  telefono?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  direccion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ciudad?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  pais?: string;
}
