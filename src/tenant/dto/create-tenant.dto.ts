import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';
import { ModuleKey, TenantEstado, TipoNegocio } from '@prisma/client';

export class CreateTenantDto {
  @IsNotEmpty()
  @IsString()
  nombre: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsEnum(TipoNegocio)
  tipoNegocio: TipoNegocio;

  @IsOptional()
  @IsEnum(TenantEstado)
  estado?: TenantEstado;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsString()
  ciudad?: string;

  @IsOptional()
  @IsString()
  pais?: string;

  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitud?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitud?: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(ModuleKey, { each: true })
  modules?: ModuleKey[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ownerUserId?: number;
}
