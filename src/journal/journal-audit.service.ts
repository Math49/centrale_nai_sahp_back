import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ContexteJournal } from './contexte-journal';

export interface EcritureAudit {
  agentId: string | null;
  action: string;
  cibleTable: string;
  cibleId: string | null;
  avant?: Prisma.InputJsonValue;
  apres?: Prisma.InputJsonValue;
}

@Injectable()
export class JournalAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contexte: ContexteJournal,
  ) {}

  async tracer(
    ecriture: EcritureAudit,
    transaction?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = transaction ?? this.prisma;

    await client.journalAudit.create({
      data: {
        agentId: ecriture.agentId,
        action: ecriture.action,
        cibleTable: ecriture.cibleTable,
        cibleId: ecriture.cibleId,
        avant: ecriture.avant,
        apres: ecriture.apres,
      },
    });

    this.contexte.signalerTrace();
  }
}
