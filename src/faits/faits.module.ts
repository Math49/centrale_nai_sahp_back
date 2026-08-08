import { Module } from '@nestjs/common';

import { EntitesModule } from '../entites/entites.module';
import { FaitsController } from './faits.controller';
import { FaitsService } from './faits.service';

@Module({
  imports: [EntitesModule],
  controllers: [FaitsController],
  providers: [FaitsService],
  exports: [FaitsService],
})
export class FaitsModule {}
