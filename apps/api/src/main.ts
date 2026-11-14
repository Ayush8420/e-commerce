import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const port = Number(config.get<string>('API_PORT', '4000'));
  const frontendUrl = config.get<string>('FRONTEND_URL', 'http://localhost:3000');
  const allowedOrigins = Array.from(
    new Set([
      ...frontendUrl
        .split(',')
        .map((item) => item.trim().replace(/\/+$/, ''))
        .filter(Boolean),
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ]),
  );

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id'],
  });
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  await app.listen(port);
  Logger.log(`AetherMart API listening on http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();

