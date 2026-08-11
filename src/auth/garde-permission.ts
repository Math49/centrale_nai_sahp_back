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
