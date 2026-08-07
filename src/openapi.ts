import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

const configuration = new DocumentBuilder()
  .setTitle('Centrale N&I')
  .setDescription(
    "API du service Narcotics & Investigations de la SAHP. Le référentiel — types d'entités, champs, types de liens, onglets — est dynamique et n'apparaît pas dans ce contrat : il se récupère par GET /referentiel.",
  )
  .setVersion('0.1.0')
  .addBearerAuth(
    { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    'jeton',
  )
  .build();

export function monterSwagger(application: INestApplication): void {
  const document = SwaggerModule.createDocument(application, configuration);
  SwaggerModule.setup('documentation', application, document);
}

/**
 * Produit le contrat sans ouvrir de port et sans base de données.
 *
 * `application.init()` n'est volontairement pas appelé : il déclencherait les
 * hooks de cycle de vie, donc le `$connect` de PrismaService. Générer le
 * contrat en intégration continue ne doit pas exiger un PostgreSQL joignable.
 *
 * Utilisé par scripts/generer-openapi.mjs pour écrire le openapi.json que le
 * dépôt front versionne et dont il dérive son client typé.
 */
export async function construireDocumentOpenApi(): Promise<OpenAPIObject> {
  const application = await NestFactory.create(AppModule, { logger: false });

  const document = SwaggerModule.createDocument(application, configuration);
  await application.close();

  return document;
}
