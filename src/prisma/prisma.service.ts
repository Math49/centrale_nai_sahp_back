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

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  private readonly client: PrismaClient;

  constructor() {
    super();
    this.client = this;
  }

  pourAgent(contexte: ContexteVisibilite): ClientFiltre {
    return construireClientFiltre(this.client, contexte);
  }

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
