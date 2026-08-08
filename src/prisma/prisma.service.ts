import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import {
  construireClientFiltre,
  type ClientFiltre,
} from '../visibilite/client-filtre';
import type { ContexteVisibilite } from '../visibilite/contexte-visibilite';

/**
 * Client Prisma partagé.
 *
 * **Aucune lecture d'entité, de fait ou de dossier ne doit passer par le client
 * nu.** On lit par `pourAgent(contexte)`, qui injecte le prédicat de
 * visibilité. Le contournement existe et porte un nom qui se remarque en
 * revue — `sansFiltre` — réservé à l'administration et au chargement du graphe,
 * qui contient tout mais n'est jamais servi brut.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  /**
   * Le client réellement utilisable.
   *
   * PrismaClient renvoie un Proxy depuis son constructeur : les accesseurs de
   * modèles — `typeEntite`, `fait`… — vivent sur ce Proxy, pas sur l'objet
   * qu'il enveloppe. Or `this`, à l'intérieur d'une méthode appelée à travers
   * le Proxy, désigne l'objet enveloppé. Le capturer ici, dans le constructeur
   * où `this` est bien le Proxy, est le seul moyen fiable de le retrouver.
   */
  private readonly client: PrismaClient;

  constructor() {
    super();
    this.client = this;
  }

  /**
   * Client filtré pour un agent : première des trois couches de défense.
   *
   * Construit par requête. Le coût est celui d'un `$extends`, négligeable au
   * regard du trafic attendu, et il achète l'assurance qu'un service qui aurait
   * oublié son prédicat lise quand même filtré.
   */
  pourAgent(contexte: ContexteVisibilite): ClientFiltre {
    return construireClientFiltre(this.client, contexte);
  }

  /**
   * Client non filtré, nommé pour être visible en revue.
   *
   * Chaque appel doit se justifier : administration, chargement du graphe,
   * écritures, ou lecture d'un objet dont on va décider l'accès soi-même.
   */
  get sansFiltre(): PrismaClient {
    return this.client;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('connexion à PostgreSQL établie');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Aller-retour minimal, utilisé par la route de santé. */
  async verifierConnexion(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (erreur) {
      this.logger.error('base injoignable', erreur as Error);
      return false;
    }
  }
}
