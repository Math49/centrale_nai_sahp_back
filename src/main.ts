import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import type { Environnement } from './config/environnement';
import { monterSwagger } from './openapi';

async function demarrer(): Promise<void> {
  const application = await NestFactory.create(AppModule);
  const configuration = application.get(ConfigService<Environnement, true>);

  application.enableShutdownHooks();

  application.use(cookieParser());

  application.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  application.enableCors({
    origin: configuration.get('CORS_ORIGINES', { infer: true }),
    credentials: true,
  });

  if (configuration.get('SWAGGER_ACTIF', { infer: true })) {
    monterSwagger(application);
  }

  const port = configuration.get('PORT', { infer: true });
  await application.listen(port, '0.0.0.0');

  new Logger('Amorçage').log(`API à l'écoute sur le port ${port}`);
}

void demarrer();
