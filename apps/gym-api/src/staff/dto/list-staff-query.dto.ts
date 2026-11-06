import { TenantRole, UserTenantEstado } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListStaffQueryDto {
  @IsOptional()
  @IsEnum(TenantRole)
  role?: TenantRole;

  @IsOptional()
  @IsEnum(UserTenantEstado)
  estado?: UserTenantEstado;
}
