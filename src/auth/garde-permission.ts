import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Permission } from '../agents/permissions';
import type { RequeteAuthentifiee } from './agent-courant';
import {
  CLE_PERMISSIONS,
  CLE_PUBLIQUE,
  CLE_SANS_PERMISSION,
  CLE_SUPER_ADMIN,
} from './decorateurs';

/**
 * Garde de permissions — **refus par défaut**.
 *
 * Une route qui ne déclare ni `@Publique()`, ni `@SansPermission()`, ni
 * `@Permissions(...)` est refusée. Un oubli de décorateur doit produire un
 * refus, jamais une ouverture : c'est la propriété qui rend le dispositif
 * robuste au développement futur, et elle est testée explicitement.
 */
@Injectable()
export class GardePermission implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexte: ExecutionContext): boolean {
    const cibles = [contexte.getHandler(), contexte.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(CLE_PUBLIQUE, cibles)) {
      return true;
    }

    if (
      this.reflector.getAllAndOverride<boolean>(CLE_SANS_PERMISSION, cibles)
    ) {
      return true;
    }

    const requete = contexte.switchToHttp().getRequest<RequeteAuthentifiee>();

    // Réservé au super-admin, câblé en dur : aucune permission n'ouvre cette
    // porte, pas même une permission qu'un grade s'accorderait lui-même.
    if (this.reflector.getAllAndOverride<boolean>(CLE_SUPER_ADMIN, cibles)) {
      if (!requete.agent?.superAdmin) {
        throw new ForbiddenException('réservé au super-admin');
      }
      return true;
    }

    const requises = this.reflector.getAllAndOverride<Permission[]>(
      CLE_PERMISSIONS,
      cibles,
    );

    if (!requises || requises.length === 0) {
      throw new ForbiddenException(
        'route sans permission déclarée — refusée par défaut',
      );
    }

    const agent = requete.agent;

    if (!agent) {
      throw new ForbiddenException('agent non résolu');
    }

    // Contournement du super-admin : câblé en dur, non configurable.
    // Ses consultations sont journalisées et signalées (lot 11).
    if (agent.superAdmin) {
      return true;
    }

    const manquantes = requises.filter(
      (permission) => !agent.permissions.includes(permission),
    );

    if (manquantes.length > 0) {
      throw new ForbiddenException(
        `permission requise : ${manquantes.join(', ')}`,
      );
    }

    return true;
  }
}
