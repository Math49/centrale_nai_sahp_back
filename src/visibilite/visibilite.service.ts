import { Injectable, NotFoundException } from '@nestjs/common';
import { Visibilite } from '@prisma/client';

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

/**
 * Service transversal de visibilité. **N'expose aucune route.**
 *
 * Seul lieu d'implémentation de la règle des gardiens : une seule
 * implémentation, un seul endroit à tester. Tout écran, tout compteur, tout
 * signal passe par ici.
 */
@Injectable()
export class VisibiliteService {
  constructor(private readonly prisma: PrismaService) {}

  contexte(agent: AgentCourant): ContexteVisibilite {
    return contexteDe(agent);
  }

  /** Client Prisma dont chaque lecture porte le prédicat de visibilité. */
  clientPour(agent: AgentCourant): ClientFiltre {
    return this.prisma.pourAgent(this.contexte(agent));
  }

  /**
   * Charge une entité, ou lève un **404**.
   *
   * Jamais 403 : un 403 sur un objet privé confirmerait son existence, ce qui
   * est précisément ce que le niveau privé doit empêcher.
   */
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

  /**
   * Le contenu d'une entité est-il lisible ?
   *
   * Une entité restreinte est un objet visible au contenu inaccessible : son
   * libellé s'affiche, ses faits non. Ce sont d'ailleurs les faits qui portent
   * la restriction, par héritage — cette méthode sert aux écrans qui veulent le
   * dire explicitement.
   */
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

  /**
   * Vérification de sortie, exacte, par relecture.
   *
   * Redondance assumée : on demande à la base quels identifiants, parmi ceux
   * qui s'apprêtent à quitter l'API, sont réellement accessibles. Si l'un
   * manque, c'est un défaut de filtrage en amont.
   */
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

  /** Décision hors base, sur des gardiens déjà résolus. */
  gardiensFranchis(agent: AgentCourant, gardiens: readonly Gardien[]): boolean {
    return contenuAccessible(this.contexte(agent), gardiens);
  }
}
