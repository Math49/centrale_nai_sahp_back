import { Module } from '@nestjs/common';

import { AgentsModule } from './agents/agents.module';
import { AuthModule } from './auth/auth.module';
import { ConfigurationModule } from './config/configuration.module';
import { JournalModule } from './journal/journal.module';
import { PrismaModule } from './prisma/prisma.module';
import { SanteModule } from './sante/sante.module';

/**
 * Modules métier à venir, dans l'ordre des lots :
 *   lot 3  referentiel
 *   lot 4  entites, faits, fichiers
 *   lot 5  visibilite  (service transversal, sans route)
 *   lot 8  dossiers
 *   lot 9  graphe
 *   lot 10 signaux
 *   lot 11 journal — consultation, intercepteur générique, routes de lecture
 */
@Module({
  imports: [
    ConfigurationModule,
    PrismaModule,
    JournalModule,
    AuthModule,
    AgentsModule,
    SanteModule,
  ],
})
export class AppModule {}
