import { Global, Injectable, Module } from '@nestjs/common';
import { EventEmitter } from 'node:events';

/**
 * Signal d'écriture, émis par les services qui touchent aux entités, aux faits
 * ou aux dossiers.
 *
 * Le graphe vit en mémoire et doit être invalidé à chaque écriture. Le faire
 * par un bus plutôt que par un appel direct évite que `entites`, `faits` et
 * `dossiers` dépendent du module `graphe` : ils n'ont pas à savoir qui écoute.
 */
@Injectable()
export class BusInvalidation {
  private readonly emetteur = new EventEmitter();

  constructor() {
    // Le graphe n'est pas le seul écouteur possible ; sans limite, un
    // avertissement de fuite apparaîtrait dès le quatrième.
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
