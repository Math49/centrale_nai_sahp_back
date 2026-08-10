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

/**
 * Journal de consultation.
 *
 * Toute lecture de fiche y laisse une trace, **y compris celle d'un
 * super-admin**, marquée comme telle. Sans cela, l'accès total du développeur
 * serait le point faible du dispositif qu'il est censé protéger.
 */
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
      // Une trace qui échoue ne doit pas faire échouer la consultation : la
      // fiche a déjà été calculée et servie. On le signale bruyamment.
      this.journal.error(
        `consultation non tracée — ${nature} ${objet.id} par ${agent.id} : ${(erreur as Error).message}`,
      );
    }
  }

  /**
   * La lecture n'a-t-elle été possible que par dérogation ?
   *
   * C'est la question à laquelle le journal doit répondre : un agent habilité
   * nommément consulte ce qu'on lui a confié ; un agent qui passe par sa
   * permission dérogatoire consulte ce qu'on ne lui avait pas confié.
   */
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

    // Reste le super-admin, dont le contournement est câblé en dur, et les deux
    // permissions dérogatoires. `prive` ouvre aussi le restreint.
    return (
      agent.superAdmin ||
      agent.permissions.includes(PERMISSIONS.ACCES_DEROGATOIRE_PRIVE) ||
      (objet.visibilite === Visibilite.restreint &&
        agent.permissions.includes(PERMISSIONS.ACCES_DEROGATOIRE_RESTREINT))
    );
  }
}
