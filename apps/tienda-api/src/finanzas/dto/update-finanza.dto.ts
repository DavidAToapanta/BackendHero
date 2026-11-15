import { PartialType } from '@nestjs/mapped-types';
import { CreateFinanzaDto } from './create-finanza.dto';

export class UpdateFinanzaDto extends PartialType(CreateFinanzaDto) {}
