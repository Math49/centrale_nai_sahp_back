import { Module } from '@nestjs/common';

import { ReferentielController } from './referentiel.controller';
import { ReferentielService } from './referentiel.service';

@Module({
  controllers: [ReferentielController],
  providers: [ReferentielService],
  exports: [ReferentielService],
})
export class ReferentielModule {}
