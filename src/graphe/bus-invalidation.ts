import { Global, Injectable, Module } from '@nestjs/common';
import { EventEmitter } from 'node:events';

@Injectable()
export class BusInvalidation {
  private readonly emetteur = new EventEmitter();

  constructor() {
    this.emetteur.setMaxListeners(32);
  }

  signaler(): void {
    this.emetteur.emit('ecriture');
  }

  auSignal(reaction: () => void): void {
    this.emetteur.on('ecriture', reaction);
  }
}

@Global()
@Module({
  providers: [BusInvalidation],
  exports: [BusInvalidation],
})
export class BusInvalidationModule {}
