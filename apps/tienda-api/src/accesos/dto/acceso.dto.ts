import {
  CATALOGO_PERMISOS_TIENDA,
  type CodigoPermisoTienda,
} from '@app/permisos';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsByteLength,
  IsEmail,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { MAX_PRISMA_INT } from '../../auth/auth.types';

const presente = (_dto: object, valor: unknown) => valor !== undefined;
const codigos = CATALOGO_PERMISOS_TIENDA.map(({ codigo }) => codigo);
const estados = ['ACTIVO', 'INACTIVO', 'PENDIENTE'] as const;

export class ListaPersonalDto {
  @ValidateIf(presente)
  @IsString()
  @MaxLength(120)
  q?: string;

  @ValidateIf(presente)
  @IsIn(estados)
  estado?: (typeof estados)[number];

  @ValidateIf(presente)
  @Matches(/^[A-Z][A-Z0-9_-]{0,39}$/)
  rolCodigo?: string;

  @ValidateIf(presente)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  pagina?: number;

  @ValidateIf(presente)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limite?: number;
}

export class AsignarRolDto {
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  rolId: number;
}

export class MembresiaParamDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  membresiaId: number;
}

export class RolParamDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  rolId: number;
}

export class AltaPersonalDto extends AsignarRolDto {
  @Matches(/\S/)
  @MaxLength(60)
  cedula: string;

  @Matches(/\S/)
  @MaxLength(120)
  nombres: string;

  @Matches(/\S/)
  @MaxLength(120)
  apellidos: string;

  @ValidateIf(presente)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsByteLength(6, 72)
  @Matches(/\S/)
  password: string;
}

export class VincularPersonalDto extends AsignarRolDto {
  @Matches(/\S/)
  @MaxLength(60)
  cedula: string;

  @IsEmail()
  @MaxLength(254)
  email: string;
}

export class PerfilPersonalDto {
  @Matches(/\S/)
  @MaxLength(255)
  horario: string;

  @Matches(/^(0|[1-9][0-9]{0,9})\.[0-9]{2}$/)
  sueldo: string;
}

export class MotivoAccesoDto {
  @Matches(/\S/)
  @MaxLength(500)
  motivo: string;
}

export class EstadoPersonalDto extends MotivoAccesoDto {
  @IsIn(['ACTIVO', 'INACTIVO'])
  estado: 'ACTIVO' | 'INACTIVO';

  @ValidateIf(presente)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  rolId?: number;
}

export class CrearRolTiendaDto {
  @Matches(/^[A-Za-z][A-Za-z0-9_-]{0,39}$/)
  codigo: string;

  @Matches(/\S/)
  @MaxLength(120)
  nombre: string;

  @IsArray()
  @ArrayUnique()
  @IsIn(codigos, { each: true })
  permisos: CodigoPermisoTienda[];
}

export class EditarRolTiendaDto {
  @ValidateIf(presente)
  @Matches(/\S/)
  @MaxLength(120)
  nombre?: string;

  @ValidateIf(presente)
  @IsBoolean()
  activo?: boolean;

  @ValidateIf(presente)
  @IsArray()
  @ArrayUnique()
  @IsIn(codigos, { each: true })
  permisos?: CodigoPermisoTienda[];
}
