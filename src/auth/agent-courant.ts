import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { Permission } from '../agents/permissions';

/**
 * Identité résolue à chaque requête par le garde d'authentification.
 *
 * Le garde relit l'agent en base à chaque appel plutôt que de se fier au
 * contenu du jeton : c'est ce qui rend `token_version`, `actif` et `anonymise`
 * immédiatement opposables. Le trafic attendu est de quelques agents.
 */
export interface AgentCourant {
  id: string;
  matricule: string;
  prenom: string;
  nom: string;
  roleId: string;
  roleCode: string;
  superAdmin: boolean;
  doitChangerMdp: boolean;
  permissions: Permission[];
}

export interface RequeteAuthentifiee extends Request {
  agent?: AgentCourant;
}

/** Injecte l'agent courant dans une méthode de contrôleur. */
export const Agent = createParamDecorator(
  (_donnees: unknown, contexte: ExecutionContext): AgentCourant => {
    const requete = contexte.switchToHttp().getRequest<RequeteAuthentifiee>();

    if (!requete.agent) {
      // Impossible en pratique : le garde s'exécute avant. Le signaler
      // franchement plutôt que de laisser passer un `undefined`.
      throw new Error(
        "@Agent() utilisé sur une route publique — aucun agent n'y est résolu",
      );
    }

    return requete.agent;
  },
);
