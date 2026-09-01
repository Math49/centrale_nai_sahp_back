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

  /**
   * Accorde des permissions à des grades déjà en base.
   *
   * `initialiserLesGradesManquants` ne touche jamais un grade existant, et
   * c'est voulu : ses permissions sont configurables, les réécrire effacerait
   * le travail de l'administrateur. Mais l'ajout d'un geste *nouveau* au
   * catalogue est un autre cas — un grade qui l'ignore perd un accès qu'il
   * avait, sans que personne ne l'ait décidé. D'où cette montée explicite, qui
   * n'ajoute jamais et ne retire rien.
   *
   * `seulement` restreint la montée aux grades désignés, `exclure` en écarte.
   * Les deux servent la même prudence : on rend à un grade *livré par
   * l'application* ce qu'un nouveau geste vient de lui retirer, et on ne décide
   * jamais à la place de l'administrateur pour un grade qu'il a créé lui-même.
   */
  async accorderAuxGradesExistants(
    codes: readonly string[],
    options: {
      seulement?: readonly string[];
      exclure?: readonly string[];
    } = {},
  ): Promise<{ code: string; ajoutees: string[] }[]> {
    const inconnues = codes.filter((code) => !estUnePermissionConnue(code));

    if (inconnues.length > 0) {
      throw new BadRequestException(
        `permission inconnue : ${inconnues.join(', ')}`,
      );
    }

    const exclus = new Set(options.exclure ?? []);
    const retenus = options.seulement ? new Set(options.seulement) : null;
    const roles = await this.prisma.role.findMany({
      orderBy: { ordre: 'asc' },
    });
    const rapport: { code: string; ajoutees: string[] }[] = [];

    for (const role of roles) {
      if (exclus.has(role.code) || (retenus && !retenus.has(role.code))) {
        continue;
      }

      const ajoutees = codes.filter((code) => !role.permissions.includes(code));

      if (ajoutees.length === 0) {
        continue;
      }

      await this.prisma.role.update({
        where: { id: role.id },
        data: { permissions: [...role.permissions, ...ajoutees] },
      });

      rapport.push({ code: role.code, ajoutees });
    }

    return rapport;
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
