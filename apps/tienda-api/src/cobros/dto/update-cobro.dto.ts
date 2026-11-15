import { PartialType } from '@nestjs/mapped-types';
import { CreateCobroDto } from './create-cobro.dto';

export class UpdateCobroDto extends PartialType(CreateCobroDto) {}
