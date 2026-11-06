import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIP,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ZkbioDeviceDto {
  @IsString()
  sn: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIP()
  ip?: string;
}

export class ZkbioEventDto {
  @IsString()
  eventId: string;

  @IsDateString()
  occurredAt: string;

  @IsOptional()
  @IsString()
  personId?: string;

  @IsOptional()
  @IsString()
  verifyMode?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  raw?: string[];
}

export class SyncZkbioDto {
  @ValidateNested()
  @Type(() => ZkbioDeviceDto)
  device: ZkbioDeviceDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ZkbioEventDto)
  events: ZkbioEventDto[];
}
