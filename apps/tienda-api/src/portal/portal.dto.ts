import { Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { LoginDto } from '../auth/dto/login.dto';
import { MAX_PRISMA_INT } from '../auth/auth.types';

export class LoginPortalDto extends LoginDto {
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  tenantId: number;
}

export class VincularPortalDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  prueba: string;
}

export class IdPortalDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  id: number;
}
