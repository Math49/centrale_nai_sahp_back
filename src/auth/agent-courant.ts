import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { Permission } from '../agents/permissions';

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

  dossiersHabilites: string[];
  entitesHabilitees: string[];
}

export interface RequeteAuthentifiee extends Request {
  agent?: AgentCourant;
}

export const Agent = createParamDecorator(
  (_donnees: unknown, contexte: ExecutionContext): AgentCourant => {
    const requete = contexte.switchToHttp().getRequest<RequeteAuthentifiee>();

    if (!requete.agent) {
      throw new Error(
        "@Agent() utilisé sur une route publique — aucun agent n'y est résolu",
      );
    }

    return requete.agent;
  },
);
