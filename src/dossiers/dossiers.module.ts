import { Module } from '@nestjs/common';

import { DossiersService } from './dossiers.service';

/**
 * Aucun contrôleur au lot 5 : seul le noyau existe, pour que le moteur de
 * visibilité ait un dossier à interroger. Les routes viennent au lot 8.
 */
@Module({
  providers: [DossiersService],
  exports: [DossiersService],
})
export class DossiersModule {}
