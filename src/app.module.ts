import { Module } from '@nestjs/common';

import { ConfigurationModule } from './config/configuration.module';
import { PrismaModule } from './prisma/prisma.module';
import { SanteModule } from './sante/sante.module';

/**
 * Modules métier à venir, dans l'ordre des lots :
 *   lot 1  auth, agents
 *   lot 3  referentiel
 *   lot 4  entites, faits, fichiers
 *   lot 5  visibilite  (service transversal, sans route)
 *   lot 8  dossiers
 *   lot 9  graphe
 *   lot 10 signaux
 *   lot 11 journal
 */
@Module({
  imports: [ConfigurationModule, PrismaModule, SanteModule],
})
export class AppModule {}
