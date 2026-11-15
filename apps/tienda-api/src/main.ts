import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 8081);

  app.useGlobalPipes(new ValidationPipe());
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
