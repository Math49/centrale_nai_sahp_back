import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

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
 * L'intercepteur qui tracera automatiquement toute écriture arrive au lot 11 ;
 * ce service n'est appelé pour l'instant que par l'administration des comptes.
 *
 * Les écritures passent par la transaction de l'appelant lorsqu'il en fournit
 * une : une trace d'audit ne doit pas survivre à un geste annulé.
 */
@Injectable()
export class JournalAuditService {
  constructor(private readonly prisma: PrismaService) {}

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
  }
}
