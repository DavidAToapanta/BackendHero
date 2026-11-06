import { IsInt, IsNotEmpty } from 'class-validator';

export class MarcarAsistenciaDto {
  @IsInt()
  @IsNotEmpty()
  usuarioId: number;
}
