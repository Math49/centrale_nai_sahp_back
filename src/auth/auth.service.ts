import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import type { Environnement } from '../config/environnement';
import { PrismaService } from '../prisma/prisma.service';
import type { AgentCourant } from './agent-courant';
import type { AgentConnecteDto, JetonDto } from './auth.dto';
import type { ContenuJeton } from './garde-authentification';
import { MotDePasseService } from './mot-de-passe.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly motsDePasse: MotDePasseService,
    private readonly jwt: JwtService,
    private readonly configuration: ConfigService<Environnement, true>,
  ) {}

  async connecter(matricule: string, motDePasse: string): Promise<JetonDto> {
    const agent = await this.prisma.agent.findUnique({
      where: { matricule },
      include: { role: true },
    });

    const correspond = await this.motsDePasse.verifier(
      agent?.motDePasseHash ?? null,
      motDePasse,
    );

    // Message unique, quelle que soit la cause : matricule inconnu, mot de
    // passe faux, compte désactivé ou anonymisé. Distinguer ces cas
    // renseignerait un attaquant sur l'existence des comptes.
    if (!agent || !correspond || !agent.actif || agent.anonymise) {
      throw new UnauthorizedException('identifiants invalides');
    }

    return {
      jeton: await this.emettreJeton(agent.id, agent.tokenVersion),
      agent: {
        id: agent.id,
        matricule: agent.matricule,
        prenom: agent.prenom,
        nom: agent.nom,
        roleCode: agent.role.code,
        superAdmin: agent.superAdmin,
        doitChangerMdp: agent.doitChangerMdp,
        permissions: agent.role.permissions,
      },
    };
  }

  /**
   * Change le mot de passe et **invalide tous les jetons existants**, y compris
   * celui qui a servi à l'appel — d'où le jeton neuf renvoyé. Un mot de passe
   * changé parce qu'il était compromis doit couper les sessions ouvertes.
   */
  async changerMotDePasse(
    agentCourant: AgentCourant,
    ancien: string,
    nouveau: string,
  ): Promise<JetonDto> {
    if (ancien === nouveau) {
      throw new BadRequestException(
        "le nouveau mot de passe doit différer de l'ancien",
      );
    }

    const agent = await this.prisma.agent.findUniqueOrThrow({
      where: { id: agentCourant.id },
      include: { role: true },
    });

    const correspond = await this.motsDePasse.verifier(
      agent.motDePasseHash,
      ancien,
    );

    if (!correspond) {
      throw new UnauthorizedException('ancien mot de passe invalide');
    }

    const misAJour = await this.prisma.agent.update({
      where: { id: agent.id },
      data: {
        motDePasseHash: await this.motsDePasse.hacher(nouveau),
        doitChangerMdp: false,
        tokenVersion: { increment: 1 },
      },
      include: { role: true },
    });

    return {
      jeton: await this.emettreJeton(misAJour.id, misAJour.tokenVersion),
      agent: {
        id: misAJour.id,
        matricule: misAJour.matricule,
        prenom: misAJour.prenom,
        nom: misAJour.nom,
        roleCode: misAJour.role.code,
        superAdmin: misAJour.superAdmin,
        doitChangerMdp: misAJour.doitChangerMdp,
        permissions: misAJour.role.permissions,
      },
    };
  }

  decrire(agent: AgentCourant): AgentConnecteDto {
    return {
      id: agent.id,
      matricule: agent.matricule,
      prenom: agent.prenom,
      nom: agent.nom,
      roleCode: agent.roleCode,
      superAdmin: agent.superAdmin,
      doitChangerMdp: agent.doitChangerMdp,
      permissions: agent.permissions,
    };
  }

  private emettreJeton(agentId: string, tokenVersion: number): Promise<string> {
    const contenu: ContenuJeton = { sub: agentId, ver: tokenVersion };

    return this.jwt.signAsync(contenu, {
      secret: this.configuration.get('JWT_SECRET', { infer: true }),
      expiresIn: this.configuration.get('JWT_DUREE', { infer: true }),
    });
  }
}
