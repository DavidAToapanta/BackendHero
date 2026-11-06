import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '@app/prisma';
import { createJwtModuleOptions } from '@app/seguridad';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';

@Module({
  imports: [PrismaModule, JwtModule.register(createJwtModuleOptions())],
  providers: [NotificationsGateway, NotificationsService],
})
export class NotificationsModule {}
