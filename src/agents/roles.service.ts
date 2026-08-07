import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Role } from '@prisma/client';

import { JournalAuditService } from '../journal/journal-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { GRADES } from './grades';
import {
  estUnePermissionConnue,
  LIBELLES_PERMISSIONS,
  TOUTES_LES_PERMISSIONS,
} from './permissions';
import type {
  ModificationRoleDto,
  PermissionCatalogueeDto,
  RoleDto,
} from './roles.dto';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: JournalAuditService,
  ) {}

  async lister(): Promise<RoleDto[]> {
    const roles = await this.prisma.role.findMany({
      orderBy: { ordre: 'asc' },
    });
    return roles.map((role) => this.presenter(role));
  }

  catalogue(): PermissionCatalogueeDto[] {
    return TOUTES_LES_PERMISSIONS.map((code) => ({
      code,
      libelle: LIBELLES_PERMISSIONS[code],
    }));
  }

  async modifier(
    auteurId: string,
    id: string,
    donnees: ModificationRoleDto,
  ): Promise<RoleDto> {
    const avant = await this.prisma.role.findUnique({ where: { id } });

    if (!avant) {
      throw new NotFoundException('grade inconnu');
    }

    if (donnees.permissions) {
      const inconnues = donnees.permissions.filter(
        (code) => !estUnePermissionConnue(code),
      );

      if (inconnues.length > 0) {
        throw new BadRequestException(
          `permission inconnue : ${inconnues.join(', ')}`,
        );
      }
    }

    const apres = await this.prisma.$transaction(async (transaction) => {
      const misAJour = await transaction.role.update({
        where: { id },
        data: donnees,
      });

      await this.audit.tracer(
        {
          agentId: auteurId,
          action: 'role.modifier',
          cibleTable: 'role',
          cibleId: id,
          avant: { libelle: avant.libelle, permissions: avant.permissions },
          apres: {
            libelle: misAJour.libelle,
            permissions: misAJour.permissions,
          },
        },
        transaction,
      );

      return misAJour;
    });

    return this.presenter(apres);
  }

  /**
   * Crée les grades manquants avec leur répartition initiale de permissions.
   *
   * **Ne touche jamais à un grade existant** : ses permissions ont pu être
   * reconfigurées depuis, et les réécrire au démarrage annulerait silencieusement
   * la configuration de l'administration.
   */
  async initialiserLesGradesManquants(): Promise<string[]> {
    const existants = await this.prisma.role.findMany({
      select: { code: true },
    });
    const connus = new Set(existants.map((role) => role.code));
    const crees: string[] = [];

    for (const grade of GRADES) {
      if (connus.has(grade.code)) {
        continue;
      }

      await this.prisma.role.create({
        data: {
          code: grade.code,
          libelle: grade.libelle,
          ordre: grade.ordre,
          permissions: [...grade.permissions],
        },
      });

      crees.push(grade.code);
    }

    return crees;
  }

  private presenter(role: Role): RoleDto {
    return {
      id: role.id,
      code: role.code,
      libelle: role.libelle,
      permissions: role.permissions,
      ordre: role.ordre,
    };
  }
}
