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

  /** Même règle pour un dossier : 404 plutôt que 403 sur ce qui est privé. */
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

  /**
   * Le contenu d'un dossier est-il lisible ?
   *
   * Un dossier restreint est un objet visible au contenu fermé : son nom
   * s'affiche, sa note, son suivi et sa whitelist non.
   */
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

  /**
   * Classer un objet en restreint ou privé est une permission à part.
   *
   * Sans elle, tout agent pourrait soustraire une enquête au regard des autres,
   * ce qui viderait la traçabilité de son sens : le journal enregistrerait
   * fidèlement des consultations d'un objet que plus personne ne peut lire.
   *
   * La règle vit ici et non dans chaque service : entité, fait et dossier la
   * partagent, et trois exemplaires finiraient par diverger — c'est d'ailleurs
   * ce qui était arrivé, le contrôle n'existant que côté dossier.
   */
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
