import { Module } from '@nestjs/common';

import { AgentsModule } from './agents/agents.module';
import { AuthModule } from './auth/auth.module';
import { ConfigurationModule } from './config/configuration.module';
import { EntitesModule } from './entites/entites.module';
import { FaitsModule } from './faits/faits.module';
import { JournalModule } from './journal/journal.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReferentielModule } from './referentiel/referentiel.module';
import { SanteModule } from './sante/sante.module';
import { SemencesModule } from './semences/semences.module';

/**
 * Modules métier à venir, dans l'ordre des lots :
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
    ReferentielModule,
    EntitesModule,
    FaitsModule,
    SemencesModule,
    SanteModule,
  ],
})
export class AppModule {}
