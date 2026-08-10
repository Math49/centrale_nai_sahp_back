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

  // Le jeton arrive dans un cookie `httpOnly` : sans analyseur, `req.cookies`
  // resterait vide et le garde ne verrait jamais de session.
  application.use(cookieParser());

  application.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // `credentials: true` est indispensable au cookie de session : sans lui, le
  // navigateur refuse de l'envoyer sur une requête d'origine différente. La
  // liste d'origines reste close — jamais de joker avec des identifiants.
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
