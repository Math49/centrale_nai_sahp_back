import { Module } from '@nestjs/common';

import { DossiersModule } from '../dossiers/dossiers.module';
import { EntitesModule } from '../entites/entites.module';
import { FaitsModule } from '../faits/faits.module';
import { ReferentielModule } from '../referentiel/referentiel.module';
import { MadrinaService } from './madrina.service';
import { SimulationService } from './simulation.service';

/**
 * Jeux de données de développement. Aucune route : ce module n'est sollicité
 * que par les commandes d'exploitation et les tests d'intégration.
 *
 * Deux jeux, deux usages : `MadrinaService` est le **test** — onze entités
 * tendues vers la recette du projet — et `SimulationService` l'**usage**, une
 * centaine d'entités pour juger un écran, une recherche, un graphe.
 */
@Module({
  imports: [ReferentielModule, EntitesModule, FaitsModule, DossiersModule],
  providers: [MadrinaService, SimulationService],
  exports: [MadrinaService, SimulationService],
})
export class SemencesModule {}
