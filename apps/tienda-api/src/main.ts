import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configurarOperacionHttp } from '../../../libs/operacion-http';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 8081);
  configurarOperacionHttp(app, 'tienda-api');

  app.useGlobalPipes(new ValidationPipe());
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
