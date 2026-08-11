import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Visibilite } from '@prisma/client';

import { PERMISSIONS } from '../agents/permissions';
import type { AgentCourant } from '../auth/agent-courant';
import { PrismaService } from '../prisma/prisma.service';
import type { ClientFiltre } from './client-filtre';
import { contexteDe, type ContexteVisibilite } from './contexte-visibilite';
import {
  contenuAccessible,
  objetVisible,
  predicatEntite,
  predicatFait,
  type Gardien,
} from './predicats';

@Injectable()
export class VisibiliteService {
  constructor(private readonly prisma: PrismaService) {}

  contexte(agent: AgentCourant): ContexteVisibilite {
    return contexteDe(agent);
  }

  clientPour(agent: AgentCourant): ClientFiltre {
    return this.prisma.pourAgent(this.contexte(agent));
  }

  async entiteVisibleOuIntrouvable(
    agent: AgentCourant,
    id: string,
  ): Promise<{ id: string; visibilite: Visibilite; typeEntiteId: string }> {
    const contexte = this.contexte(agent);

    const entite = await this.prisma.sansFiltre.entite.findUnique({
      where: { id },
      select: { id: true, visibilite: true, typeEntiteId: true },
    });

    const habilite = contexte.entitesHabilitees.includes(id);

    if (!entite || !objetVisible(contexte, entite.visibilite, habilite)) {
      throw new NotFoundException('entité inconnue');
    }

    return entite;
  }

  async dossierVisibleOuIntrouvable(
    agent: AgentCourant,
    id: string,
  ): Promise<{ id: string; visibilite: Visibilite }> {
    const contexte = this.contexte(agent);

    const dossier = await this.prisma.sansFiltre.dossier.findUnique({
      where: { id },
      select: { id: true, visibilite: true },
    });

    const habilite = contexte.dossiersHabilites.includes(id);

    if (!dossier || !objetVisible(contexte, dossier.visibilite, habilite)) {
      throw new NotFoundException('dossier inconnu');
    }

    return dossier;
  }

  contenuDeDossierLisible(
    agent: AgentCourant,
    dossier: { id: string; visibilite: Visibilite },
  ): boolean {
    const contexte = this.contexte(agent);

    return contenuAccessible(contexte, [
      {
        niveau: dossier.visibilite,
        habilite: contexte.dossiersHabilites.includes(dossier.id),
      },
    ]);
  }

  contenuDEntiteLisible(
    agent: AgentCourant,
    entite: { id: string; visibilite: Visibilite },
  ): boolean {
    const contexte = this.contexte(agent);

    return contenuAccessible(contexte, [
      {
        niveau: entite.visibilite,
        habilite: contexte.entitesHabilitees.includes(entite.id),
      },
    ]);
  }

  async faitsAccessibles(
    agent: AgentCourant,
    ids: readonly string[],
  ): Promise<Set<string>> {
    if (ids.length === 0) {
      return new Set();
    }

    const accessibles = await this.prisma.sansFiltre.fait.findMany({
      where: {
        AND: [{ id: { in: [...ids] } }, predicatFait(this.contexte(agent))],
      },
      select: { id: true },
    });

    return new Set(accessibles.map((fait) => fait.id));
  }

  async entitesAccessibles(
    agent: AgentCourant,
    ids: readonly string[],
  ): Promise<Set<string>> {
    if (ids.length === 0) {
      return new Set();
    }

    const accessibles = await this.prisma.sansFiltre.entite.findMany({
      where: {
        AND: [{ id: { in: [...ids] } }, predicatEntite(this.contexte(agent))],
      },
      select: { id: true },
    });

    return new Set(accessibles.map((entite) => entite.id));
  }

  gardiensFranchis(agent: AgentCourant, gardiens: readonly Gardien[]): boolean {
    return contenuAccessible(this.contexte(agent), gardiens);
  }

  verifierDroitDeClasser(agent: AgentCourant, visibilite: Visibilite): void {
    if (visibilite === Visibilite.public || agent.superAdmin) {
      return;
    }

    if (!agent.permissions.includes(PERMISSIONS.VISIBILITE_DEFINIR)) {
      throw new ForbiddenException(
        `permission requise : ${PERMISSIONS.VISIBILITE_DEFINIR}`,
      );
    }
  }
}
