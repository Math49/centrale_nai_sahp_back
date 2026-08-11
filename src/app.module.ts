import { Module } from '@nestjs/common';

import { AgentsModule } from './agents/agents.module';
import { AuthModule } from './auth/auth.module';
import { ConfigurationModule } from './config/configuration.module';
import { DossiersModule } from './dossiers/dossiers.module';
import { EntitesModule } from './entites/entites.module';
import { FaitsModule } from './faits/faits.module';
import { FichiersModule } from './fichiers/fichiers.module';
import { BusInvalidationModule } from './graphe/bus-invalidation';
import { GrapheModule } from './graphe/graphe.module';
import { JournalModule } from './journal/journal.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReferentielModule } from './referentiel/referentiel.module';
import { SanteModule } from './sante/sante.module';
import { SemencesModule } from './semences/semences.module';
import { SignauxModule } from './signaux/signaux.module';
import { VisibiliteModule } from './visibilite/visibilite.module';

@Module({
  imports: [
    ConfigurationModule,
    PrismaModule,
    JournalModule,
    BusInvalidationModule,
    VisibiliteModule,
    AuthModule,
    AgentsModule,
    ReferentielModule,
    EntitesModule,
    FaitsModule,
    FichiersModule,
    DossiersModule,
    GrapheModule,
    SignauxModule,
    SemencesModule,
    SanteModule,
  ],
})
export class AppModule {}
