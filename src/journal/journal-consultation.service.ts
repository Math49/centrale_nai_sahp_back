import { Injectable, Logger } from '@nestjs/common';
import { Visibilite } from '@prisma/client';

import { PERMISSIONS } from '../agents/permissions';
import type { AgentCourant } from '../auth/agent-courant';
import { PrismaService } from '../prisma/prisma.service';
import type { NatureConsultee } from './decorateurs';

export interface ObjetConsulte {
  id: string;
  visibilite: Visibilite;
}

@Injectable()
export class JournalConsultationService {
  private readonly journal = new Logger(JournalConsultationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async tracer(
    agent: AgentCourant,
    nature: NatureConsultee,
    objet: ObjetConsulte,
  ): Promise<void> {
    try {
      await this.prisma.journalConsultation.create({
        data: {
          agentId: agent.id,
          entiteId: nature === 'entite' ? objet.id : null,
          dossierId: nature === 'dossier' ? objet.id : null,
          derogation: this.parDerogation(agent, nature, objet),
          superAdmin: agent.superAdmin,
        },
      });
    } catch (erreur) {
      this.journal.error(
        `consultation non tracée — ${nature} ${objet.id} par ${agent.id} : ${(erreur as Error).message}`,
      );
    }
  }

  private parDerogation(
    agent: AgentCourant,
    nature: NatureConsultee,
    objet: ObjetConsulte,
  ): boolean {
    if (objet.visibilite === Visibilite.public) {
      return false;
    }

    const habilite =
      nature === 'entite'
        ? agent.entitesHabilitees.includes(objet.id)
        : agent.dossiersHabilites.includes(objet.id);

    if (habilite) {
      return false;
    }

    return (
      agent.superAdmin ||
      agent.permissions.includes(PERMISSIONS.ACCES_DEROGATOIRE_PRIVE) ||
      (objet.visibilite === Visibilite.restreint &&
        agent.permissions.includes(PERMISSIONS.ACCES_DEROGATOIRE_RESTREINT))
    );
  }
}
