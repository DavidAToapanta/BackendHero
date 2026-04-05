import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { AUTH_ACCESS_MODES } from '../auth.types';

export class LoginDto {
  @IsNotEmpty()
  @IsString()
  cedula: string;

  @IsNotEmpty()
  @IsString()
  @Length(6)
  password: string;

  @IsOptional()
  @IsIn(AUTH_ACCESS_MODES)
  accessMode?: (typeof AUTH_ACCESS_MODES)[number];
}
