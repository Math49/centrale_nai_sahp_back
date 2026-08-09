import { Module } from '@nestjs/common';

import { ReferentielModule } from '../referentiel/referentiel.module';
import { CacheGrapheService } from './cache-graphe.service';
import { GrapheAssembleurService } from './graphe-assembleur.service';
import { GrapheController } from './graphe.controller';
import { GrapheService } from './graphe.service';

@Module({
  imports: [ReferentielModule],
  controllers: [GrapheController],
  providers: [CacheGrapheService, GrapheService, GrapheAssembleurService],
  exports: [GrapheService, CacheGrapheService],
})
export class GrapheModule {}
