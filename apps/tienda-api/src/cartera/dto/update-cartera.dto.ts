import { PartialType } from '@nestjs/mapped-types';
import { CreateCarteraDto } from './create-cartera.dto';

export class UpdateCarteraDto extends PartialType(CreateCarteraDto) {}
