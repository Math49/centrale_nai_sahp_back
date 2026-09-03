import { Module } from '@nestjs/common';

import { CarteController } from './carte.controller';
import { CarteService } from './carte.service';

@Module({
  controllers: [CarteController],
  providers: [CarteService],
  exports: [CarteService],
})
export class CarteModule {}
