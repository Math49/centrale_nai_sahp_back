import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Client Prisma partagé.
 *
 * À partir du lot 5, c'est ici que se branche l'extension de filtrage par
 * visibilité. Aucune lecture d'entité, de fait ou de dossier ne doit se faire
 * sur un client nu — le contournement passera par une méthode explicitement
 * nommée `sansFiltre`, réservée à l'administration et au chargement du graphe.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

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
