import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ContexteJournal } from './contexte-journal';

export interface EcritureAudit {
  /** Auteur du geste. Nul lorsque le geste vient d'une commande d'exploitation. */
  agentId: string | null;
  action: string;
  cibleTable: string;
  cibleId: string | null;
  avant?: Prisma.InputJsonValue;
  apres?: Prisma.InputJsonValue;
}

/**
 * Journal d'audit.
 *
 * Applicatif et non trigger : un trigger ne connaît pas l'agent courant.
 *
 * Les écritures passent par la transaction de l'appelant lorsqu'il en fournit
 * une : une trace d'audit ne doit pas survivre à un geste annulé.
 *
 * Chaque appel **signale sa trace à la portée de la requête**, ce qui dispense
 * l'intercepteur d'en écrire une générique par-dessus. Le service qui sait
 * décrire son geste l'emporte sur celui qui ne fait que le constater.
 */
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
