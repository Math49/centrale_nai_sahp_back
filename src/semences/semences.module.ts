import { Module } from '@nestjs/common';

import { EntitesModule } from '../entites/entites.module';
import { FaitsModule } from '../faits/faits.module';
import { ReferentielModule } from '../referentiel/referentiel.module';
import { MadrinaService } from './madrina.service';

/**
 * Jeux de données de développement. Aucune route : ce module n'est sollicité
 * que par les commandes d'exploitation et les tests d'intégration.
 */
@Module({
  imports: [ReferentielModule, EntitesModule, FaitsModule],
  providers: [MadrinaService],
  exports: [MadrinaService],
})
export class SemencesModule {}
