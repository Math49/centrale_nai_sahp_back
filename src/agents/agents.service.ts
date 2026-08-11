import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Agent, Role } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { MotDePasseService } from '../auth/mot-de-passe.service';
import { JournalAuditService } from '../journal/journal-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AgentAvecMotDePasseDto, AgentDto } from './agents.dto';
import type { CreationAgentDto, ModificationAgentDto } from './agents.dto';

type AgentAvecRole = Agent & { role: Role };

export const LIBELLE_AGENT_ANONYMISE = 'agent supprimé';

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly motsDePasse: MotDePasseService,
    private readonly audit: JournalAuditService,
  ) {}

  async lister(inclureAnonymises = false): Promise<AgentDto[]> {
    const agents = await this.prisma.agent.findMany({
      where: inclureAnonymises ? {} : { anonymise: false },
      include: { role: true },
      orderBy: [{ anonymise: 'asc' }, { matricule: 'asc' }],
    });

    return agents.map((agent) => this.presenter(agent));
  }

  async lire(id: string): Promise<AgentDto> {
    return this.presenter(await this.charger(id));
  }

  async creer(
    auteurId: string | null,
    donnees: CreationAgentDto,
  ): Promise<AgentAvecMotDePasseDto> {
    const role = await this.prisma.role.findUnique({
      where: { id: donnees.roleId },
    });

    if (!role) {
      throw new BadRequestException('grade inconnu');
    }

    const provisoire = donnees.motDePasse
      ? null
      : this.motsDePasse.engendrerProvisoire();

    const agent = await this.prisma
      .$transaction(async (transaction) => {
        const cree = await transaction.agent.create({
          data: {
            matricule: donnees.matricule,
            prenom: donnees.prenom,
            nom: donnees.nom,
            roleId: donnees.roleId,
            superAdmin: donnees.superAdmin ?? false,
            motDePasseHash: await this.motsDePasse.hacher(
              donnees.motDePasse ?? provisoire!,
            ),

            doitChangerMdp: true,
          },
          include: { role: true },
        });

        await this.audit.tracer(
          {
            agentId: auteurId,
            action: 'agent.creer',
            cibleTable: 'agent',
            cibleId: cree.id,
            apres: {
              roleCode: cree.role.code,
              superAdmin: cree.superAdmin,
            },
          },
          transaction,
        );

        return cree;
      })
      .catch((erreur: unknown) => {
        throw this.traduireMatriculeEnDouble(erreur);
      });

    return {
      agent: this.presenter(agent),
      motDePasseProvisoire: provisoire,
    };
  }

  async modifier(
    auteurId: string,
    id: string,
    donnees: ModificationAgentDto,
  ): Promise<AgentDto> {
    const avant = await this.charger(id);

    if (avant.anonymise) {
      throw new ConflictException('compte anonymisé — modification impossible');
    }

    const perdSonRangDAdmin =
      (donnees.superAdmin === false && avant.superAdmin) ||
      (donnees.actif === false && avant.actif);

    if (perdSonRangDAdmin) {
      await this.refuserSiDernierSuperAdmin(avant);
    }

    if (donnees.roleId && donnees.roleId !== avant.roleId) {
      const role = await this.prisma.role.findUnique({
        where: { id: donnees.roleId },
      });

      if (!role) {
        throw new BadRequestException('grade inconnu');
      }
    }

    const revoquerLesJetons = donnees.actif === false && avant.actif;

    const apres = await this.prisma.$transaction(async (transaction) => {
      const misAJour = await transaction.agent.update({
        where: { id },
        data: {
          ...donnees,
          ...(revoquerLesJetons ? { tokenVersion: { increment: 1 } } : {}),
        },
        include: { role: true },
      });

      await this.audit.tracer(
        {
          agentId: auteurId,
          action: 'agent.modifier',
          cibleTable: 'agent',
          cibleId: id,
          avant: {
            roleId: avant.roleId,
            actif: avant.actif,
            superAdmin: avant.superAdmin,
          },
          apres: {
            roleId: misAJour.roleId,
            actif: misAJour.actif,
            superAdmin: misAJour.superAdmin,
          },
        },
        transaction,
      );

      return misAJour;
    });

    return this.presenter(apres);
  }

  async reinitialiserMotDePasse(
    auteurId: string,
    id: string,
  ): Promise<AgentAvecMotDePasseDto> {
    const agent = await this.charger(id);

    if (agent.anonymise) {
      throw new ConflictException('compte anonymisé — aucun accès à rendre');
    }

    const provisoire = this.motsDePasse.engendrerProvisoire();

    const misAJour = await this.prisma.$transaction(async (transaction) => {
      const resultat = await transaction.agent.update({
        where: { id },
        data: {
          motDePasseHash: await this.motsDePasse.hacher(provisoire),
          doitChangerMdp: true,
          tokenVersion: { increment: 1 },
        },
        include: { role: true },
      });

      await this.audit.tracer(
        {
          agentId: auteurId,
          action: 'agent.reinitialiser_mot_de_passe',
          cibleTable: 'agent',
          cibleId: id,
        },
        transaction,
      );

      return resultat;
    });

    return {
      agent: this.presenter(misAJour),
      motDePasseProvisoire: provisoire,
    };
  }

  async anonymiser(auteurId: string, id: string): Promise<AgentDto> {
    const agent = await this.charger(id);

    if (agent.anonymise) {
      throw new ConflictException('compte déjà anonymisé');
    }

    if (agent.id === auteurId) {
      throw new BadRequestException(
        'un agent ne peut pas anonymiser son propre compte',
      );
    }

    await this.refuserSiDernierSuperAdmin(agent);

    const anonymise = await this.prisma.$transaction(async (transaction) => {
      const resultat = await transaction.agent.update({
        where: { id },
        data: {
          matricule: `anonyme-${id}`,
          prenom: '',
          nom: '',
          motDePasseHash: null,
          actif: false,
          anonymise: true,
          anonymiseLe: new Date(),
          tokenVersion: { increment: 1 },
        },
        include: { role: true },
      });

      await this.audit.tracer(
        {
          agentId: auteurId,
          action: 'agent.anonymiser',
          cibleTable: 'agent',
          cibleId: id,
          apres: { anonymise: true },
        },
        transaction,
      );

      return resultat;
    });

    return this.presenter(anonymise);
  }

  private async charger(id: string): Promise<AgentAvecRole> {
    const agent = await this.prisma.agent.findUnique({
      where: { id },
      include: { role: true },
    });

    if (!agent) {
      throw new NotFoundException('agent inconnu');
    }

    return agent;
  }

  private async refuserSiDernierSuperAdmin(agent: Agent): Promise<void> {
    if (!agent.superAdmin || !agent.actif) {
      return;
    }

    const restants = await this.prisma.agent.count({
      where: { superAdmin: true, actif: true, anonymise: false },
    });

    if (restants <= 1) {
      throw new ConflictException(
        "dernier super-admin actif — en désigner un autre d'abord",
      );
    }
  }

  private traduireMatriculeEnDouble(erreur: unknown): unknown {
    if (
      erreur instanceof Prisma.PrismaClientKnownRequestError &&
      erreur.code === 'P2002'
    ) {
      return new ConflictException('matricule déjà attribué');
    }

    return erreur;
  }

  private presenter(agent: AgentAvecRole): AgentDto {
    return {
      id: agent.id,
      matricule: agent.matricule,
      prenom: agent.prenom,
      nom: agent.nom,
      libelle: agent.anonymise
        ? LIBELLE_AGENT_ANONYMISE
        : `${agent.prenom} ${agent.nom}`,
      roleId: agent.roleId,
      roleCode: agent.role.code,
      roleLibelle: agent.role.libelle,
      superAdmin: agent.superAdmin,
      actif: agent.actif,
      doitChangerMdp: agent.doitChangerMdp,
      anonymise: agent.anonymise,
      anonymiseLe: agent.anonymiseLe?.toISOString() ?? null,
      creeLe: agent.creeLe.toISOString(),
    };
  }
}
