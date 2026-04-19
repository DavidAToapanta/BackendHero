import { IsString, ValidateIf } from 'class-validator';

export class LinkZkbioPersonDto {
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  zkbioPersonId!: string | null;
}
