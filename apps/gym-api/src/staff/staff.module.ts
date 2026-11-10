import { Module } from '@nestjs/common';
import { IdentidadModule } from '@app/identidad';
import { NegociosModule } from '@app/negocios';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

@Module({
  imports: [IdentidadModule, NegociosModule],
  controllers: [StaffController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
