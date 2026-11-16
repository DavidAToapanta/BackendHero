import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';
import { MAX_PRISMA_INT } from '../auth.types';

export class SelectContextDto {
  @IsString()
  @IsNotEmpty()
  selectionToken: string;

  @IsInt()
  @Min(1)
  @Max(MAX_PRISMA_INT)
  tenantId: number;
}
