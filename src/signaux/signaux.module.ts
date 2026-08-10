import { Module } from '@nestjs/common';

import { GrapheModule } from '../graphe/graphe.module';
import { SignauxController } from './signaux.controller';
import { SignauxService } from './signaux.service';

@Module({
  imports: [GrapheModule],
  controllers: [SignauxController],
  providers: [SignauxService],
})
export class SignauxModule {}
