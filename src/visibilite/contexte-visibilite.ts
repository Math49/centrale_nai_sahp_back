import { Visibilite } from '@prisma/client';

import { PERMISSIONS } from '../agents/permissions';
import type { AgentCourant } from '../auth/agent-courant';

export interface ContexteVisibilite {
  agentId: string;

  superAdmin: boolean;

  derogationRestreint: boolean;

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

export function derogationCouvre(
  contexte: ContexteVisibilite,
  niveau: Visibilite,
): boolean {
  if (contexte.superAdmin || contexte.derogationPrive) {
    return true;
  }

  return niveau === Visibilite.restreint && contexte.derogationRestreint;
}

export function niveauxOuverts(contexte: ContexteVisibilite): Visibilite[] {
  if (contexte.superAdmin || contexte.derogationPrive) {
    return [Visibilite.public, Visibilite.restreint, Visibilite.prive];
  }

  if (contexte.derogationRestreint) {
    return [Visibilite.public, Visibilite.restreint];
  }

  return [Visibilite.public];
}
