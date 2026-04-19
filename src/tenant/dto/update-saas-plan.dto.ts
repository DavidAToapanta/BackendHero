import { SaasPlan } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateSaasPlanDto {
  @IsEnum(SaasPlan)
  saasPlan: SaasPlan;
}
