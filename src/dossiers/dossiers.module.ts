import { Module } from '@nestjs/common';

import { DossiersController } from './dossiers.controller';
import { DossiersService } from './dossiers.service';

@Module({
  controllers: [DossiersController],
  providers: [DossiersService],
  exports: [DossiersService],
})
export class DossiersModule {}
