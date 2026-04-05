import { TenantRole } from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { AUTH_ACCESS_MODES, AUTH_CONTEXT_TYPES } from '../auth.types';

export class SelectContextDto {
  @IsNotEmpty()
  @IsString()
  selectionToken: string;

  @IsIn(AUTH_CONTEXT_TYPES)
  type: (typeof AUTH_CONTEXT_TYPES)[number];

  @IsInt()
  tenantId: number;

  @ValidateIf((dto: SelectContextDto) => dto.type === 'CLIENTE')
  @IsInt()
  clienteId?: number;

  @IsOptional()
  @ValidateIf((dto: SelectContextDto) => dto.type === 'STAFF')
  @IsEnum(TenantRole)
  tenantRole?: TenantRole;

  @IsIn(AUTH_ACCESS_MODES)
  accessMode: (typeof AUTH_ACCESS_MODES)[number];
}
