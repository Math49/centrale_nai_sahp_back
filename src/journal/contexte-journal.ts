import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

interface PorteeRequete {
  /** Nombre de traces d'audit écrites explicitement pendant cette requête. */
  traces: number;
}

/**
 * Portée de journalisation d'une requête.
 *
 * Elle existe pour une seule raison : permettre à l'intercepteur de savoir si
 * le service appelé a déjà tracé lui-même. Un service qui trace, avec un
 * `avant` et un `apres` circonstanciés, prend le pas sur la trace générique ;
 * un service qui ne trace pas en reçoit une, grossière mais réelle.
 *
 * **Le mode de défaillance de l'oubli est donc une trace pauvre, jamais un
 * silence.** C'est le même parti que le refus par défaut du garde de
 * permissions : il n'y a rien à se rappeler de faire.
 *
 * `AsyncLocalStorage` plutôt qu'une propriété sur la requête : la trace part
 * souvent depuis l'intérieur d'une transaction Prisma, à plusieurs appels de
 * profondeur, et personne n'y a la requête HTTP sous la main.
 */
@Injectable()
export class ContexteJournal {
  private readonly portee = new AsyncLocalStorage<PorteeRequete>();

  /** Exécute le traitement d'une requête dans une portée neuve. */
  executer<T>(action: () => T): T {
    return this.portee.run({ traces: 0 }, action);
  }

  /** Signale qu'une trace circonstanciée vient d'être écrite. */
  signalerTrace(): void {
    const portee = this.portee.getStore();

    if (portee) {
      portee.traces += 1;
    }
  }

  /** Le service a-t-il tracé de lui-même ? */
  dejaTrace(): boolean {
    return (this.portee.getStore()?.traces ?? 0) > 0;
  }
}
