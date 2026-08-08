import { Visibilite } from '@prisma/client';

import { PERMISSIONS } from '../agents/permissions';
import type { AgentCourant } from '../auth/agent-courant';

/**
 * Ce qu'il faut savoir d'un agent pour décider ce qu'il voit.
 *
 * Les trois axes de la conception technique §6.1 s'y retrouvent : la
 * **visibilité** est portée par les objets, l'**habilitation** par les deux
 * whitelists, la **permission** par les deux dérogations.
 */
export interface ContexteVisibilite {
  agentId: string;

  /** Contournement câblé en dur, non configurable. */
  superAdmin: boolean;

  /** Permission `acces.derogatoire.restreint`. */
  derogationRestreint: boolean;

  /** Permission `acces.derogatoire.prive`. */
  derogationPrive: boolean;

  dossiersHabilites: readonly string[];
  entitesHabilitees: readonly string[];
}

export function contexteDe(agent: AgentCourant): ContexteVisibilite {
  return {
    agentId: agent.id,
    superAdmin: agent.superAdmin,
    derogationRestreint: agent.permissions.includes(
      PERMISSIONS.ACCES_DEROGATOIRE_RESTREINT,
    ),
    derogationPrive: agent.permissions.includes(
      PERMISSIONS.ACCES_DEROGATOIRE_PRIVE,
    ),
    dossiersHabilites: agent.dossiersHabilites,
    entitesHabilitees: agent.entitesHabilitees,
  };
}

/**
 * Un gardien classé « privé » ne s'ouvre qu'avec la dérogation privée ; un
 * gardien « restreint » s'ouvre aussi avec elle.
 *
 * La conception technique liste les deux dérogations séparément. Les traiter
 * comme indépendantes produirait l'absurdité d'un agent autorisé sur le privé
 * mais bloqué sur le restreint, qui est moins sensible.
 */
export function derogationCouvre(
  contexte: ContexteVisibilite,
  niveau: Visibilite,
): boolean {
  if (contexte.superAdmin || contexte.derogationPrive) {
    return true;
  }

  return niveau === Visibilite.restreint && contexte.derogationRestreint;
}

/** Le niveau au-delà duquel un gardien exige une habilitation nominative. */
export function niveauxOuverts(contexte: ContexteVisibilite): Visibilite[] {
  if (contexte.superAdmin || contexte.derogationPrive) {
    return [Visibilite.public, Visibilite.restreint, Visibilite.prive];
  }

  if (contexte.derogationRestreint) {
    return [Visibilite.public, Visibilite.restreint];
  }

  return [Visibilite.public];
}
