import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configurarOperacionHttp } from '../../../libs/operacion-http';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 8081);
  const origenesCors = (
    process.env.TIENDA_CORS_ORIGINS ??
    (process.env.NODE_ENV === 'production'
      ? ''
      : 'http://localhost:5173,http://127.0.0.1:5173')
  )
    .split(',')
    .map((origen) => origen.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origenesCors,
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'X-Request-Id',
    ],
    exposedHeaders: ['Content-Disposition', 'X-Request-Id'],
  });
  configurarOperacionHttp(app, 'tienda-api');

  app.useGlobalPipes(new ValidationPipe());
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
