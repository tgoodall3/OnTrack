import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfig } from './config/app.config';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      forbidUnknownValues: false,
    }),
  );

  const configService = app.get(ConfigService);
  const prismaService = app.get(PrismaService);
  prismaService.$on('error', (event) => {
    Logger.error(`[Prisma] ${event.message}`, event.target, PrismaService.name);
  });
  prismaService.$on('warn', (event) => {
    Logger.warn(`[Prisma] ${event.message}`, PrismaService.name);
  });
  await prismaService.enableShutdownHooks(app);

  const appConfig = configService.getOrThrow<AppConfig['app']>('app');
  app.enableCors({
    origin: appConfig.corsOrigins ?? true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Tenant-ID',
      'X-Request-ID',
      'X-User-ID',
    ],
    exposedHeaders: ['X-Request-ID'],
  });
  const { port, host } = appConfig;

  await app.listen(port, host);
  Logger.log(
    `dYs? OnTrack API listening on http://${host}:${port}`,
    'Bootstrap',
  );
}

bootstrap();
