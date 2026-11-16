import { Module } from '@nestjs/common';
import { CuentasService } from './cuentas.service';

@Module({ providers: [CuentasService], exports: [CuentasService] })
export class CuentasModule {}
