import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_PRISMA_INT } from '../../auth/auth.types';

export class CreateClienteDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(120)
  nombres: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  apellidos?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  razonSocial?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  tipoIdentificacion?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  identificacion?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefono?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  direccion?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  clienteGymId?: number | null;
}
