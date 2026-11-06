import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateEntrenamientoDto {
  @IsOptional()
  @IsBoolean()
  finalizado?: boolean;
}
