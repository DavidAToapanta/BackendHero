import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class LoginDto {
  @IsString()
  @Matches(/\S/, { message: 'La cédula es obligatoria' })
  cedula: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
