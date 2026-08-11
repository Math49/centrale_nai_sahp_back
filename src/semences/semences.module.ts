import { Module } from '@nestjs/common';

import { DossiersModule } from '../dossiers/dossiers.module';
import { EntitesModule } from '../entites/entites.module';
import { FaitsModule } from '../faits/faits.module';
import { ReferentielModule } from '../referentiel/referentiel.module';
import { MadrinaService } from './madrina.service';
import { SimulationService } from './simulation.service';

@Module({
  imports: [ReferentielModule, EntitesModule, FaitsModule, DossiersModule],
  providers: [MadrinaService, SimulationService],
  exports: [MadrinaService, SimulationService],
})
export class SemencesModule {}
