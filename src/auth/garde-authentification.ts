import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

import type { Permission } from '../agents/permissions';
import type { Environnement } from '../config/environnement';
import { PrismaService } from '../prisma/prisma.service';
import type { AgentCourant, RequeteAuthentifiee } from './agent-courant';
import { COOKIE_SESSION } from './cookie-session';
import { CLE_MOT_DE_PASSE_A_CHANGER, CLE_PUBLIQUE } from './decorateurs';

export interface ContenuJeton {
  sub: string;

  ver: number;
}

@Injectable()
export class GardeAuthentification implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly configuration: ConfigService<Environnement, true>,
  ) {}

  async canActivate(contexte: ExecutionContext): Promise<boolean> {
    if (this.estPublique(contexte)) {
      return true;
    }

    const requete = contexte.switchToHttp().getRequest<RequeteAuthentifiee>();
    const jeton = this.jetonDeLaRequete(requete);

    if (!jeton) {
      throw new UnauthorizedException('jeton absent');
    }

    const contenu = await this.verifier(jeton);
    const agent = await this.resoudreAgent(contenu);

    requete.agent = agent;

    if (agent.doitChangerMdp && !this.autoriseeEnChangementImpose(contexte)) {
      throw new ForbiddenException(
        'changement de mot de passe imposé — passer par POST /auth/mot-de-passe',
      );
    }

    return true;
  }

  private estPublique(contexte: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(CLE_PUBLIQUE, [
        contexte.getHandler(),
        contexte.getClass(),
      ]) === true
    );
  }

  private autoriseeEnChangementImpose(contexte: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(CLE_MOT_DE_PASSE_A_CHANGER, [
        contexte.getHandler(),
        contexte.getClass(),
      ]) === true
    );
  }

  private jetonDeLaRequete(requete: RequeteAuthentifiee): string | undefined {
    const cookies = requete.cookies as Record<string, string> | undefined;
    const duCookie = cookies?.[COOKIE_SESSION];

    if (duCookie) {
      return duCookie;
    }

    const [schema, valeur] = requete.headers.authorization?.split(' ') ?? [];
    return schema === 'Bearer' && valeur ? valeur : undefined;
  }

  private async verifier(jeton: string): Promise<ContenuJeton> {
    try {
      return await this.jwt.verifyAsync<ContenuJeton>(jeton, {
        secret: this.configuration.get('JWT_SECRET', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('jeton invalide ou expiré');
    }
  }

  private async resoudreAgent(contenu: ContenuJeton): Promise<AgentCourant> {
    const agent = await this.prisma.agent.findUnique({
      where: { id: contenu.sub },
      include: {
        role: true,
        habilitationsDossier: { select: { dossierId: true } },
        habilitationsEntite: { select: { entiteId: true } },
      },
    });

    if (
      !agent ||
      !agent.actif ||
      agent.anonymise ||
      agent.tokenVersion !== contenu.ver
    ) {
      throw new UnauthorizedException('jeton révoqué');
    }

    return {
      dossiersHabilites: agent.habilitationsDossier.map(
        (habilitation) => habilitation.dossierId,
      ),
      entitesHabilitees: agent.habilitationsEntite.map(
        (habilitation) => habilitation.entiteId,
      ),
      id: agent.id,
      matricule: agent.matricule,
      prenom: agent.prenom,
      nom: agent.nom,
      roleId: agent.roleId,
      roleCode: agent.role.code,
      superAdmin: agent.superAdmin,
      doitChangerMdp: agent.doitChangerMdp,
      permissions: agent.role.permissions as Permission[],
    };
  }
}
