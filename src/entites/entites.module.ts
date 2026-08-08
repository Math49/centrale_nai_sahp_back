import { Module } from '@nestjs/common';

import { EntitesController } from './entites.controller';
import { EntitesService } from './entites.service';
import { UniciteService } from './unicite.service';
import { ValidationDynamiqueService } from './validation-dynamique.service';

@Module({
  controllers: [EntitesController],
  providers: [EntitesService, ValidationDynamiqueService, UniciteService],
  exports: [EntitesService, ValidationDynamiqueService, UniciteService],
})
export class EntitesModule {}
