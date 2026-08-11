import { Injectable } from '@nestjs/common';
import { EtatEntite, NatureFait, Prisma } from '@prisma/client';

import type { AgentCourant } from '../auth/agent-courant';
import { PrismaService } from '../prisma/prisma.service';
import { VisibiliteService } from '../visibilite/visibilite.service';
import type {
  EntiteOrphelineDto,
  EntreeAuditDto,
  EntreeConsultationDto,
} from './journal.dto';

interface AgentTrace {
  prenom: string;
  nom: string;
  anonymise: boolean;
}

@Injectable()
export class JournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibilite: VisibiliteService,
  ) {}

  async audit(
    agent: AgentCourant,
    filtres: {
      agentId?: string;
      cibleId?: string;
      action?: string;
      limite: number;
      decalage: number;
    },
  ): Promise<EntreeAuditDto[]> {
    const entrees = await this.prisma.journalAudit.findMany({
      where: {
        agentId: filtres.agentId,
        cibleId: filtres.cibleId,
        action: filtres.action
          ? { contains: filtres.action, mode: 'insensitive' }
          : undefined,
      },
      include: {
        agent: { select: { prenom: true, nom: true, anonymise: true } },
      },
      orderBy: { effectueLe: 'desc' },
      take: filtres.limite,
      skip: filtres.decalage,
    });

    const libelles = await this.libellesDesCibles(agent, entrees);

    return entrees.map((entree) => ({
      id: entree.id.toString(),
      agentId: entree.agentId,
      agentLibelle: this.nommer(entree.agent),
      action: entree.action,
      cibleTable: entree.cibleTable,
      cibleId: entree.cibleId,
      cibleLibelle: entree.cibleId
        ? (libelles.get(entree.cibleId) ?? null)
        : null,
      avant: entree.avant ?? undefined,
      apres: entree.apres ?? undefined,
      effectueLe: entree.effectueLe.toISOString(),
    }));
  }

  async consultations(
    agent: AgentCourant,
    filtres: {
      agentId?: string;
      objetId?: string;
      superAdminSeulement?: boolean;
      derogationSeulement?: boolean;
      limite: number;
      decalage: number;
    },
  ): Promise<EntreeConsultationDto[]> {
    const entrees = await this.prisma.journalConsultation.findMany({
      where: {
        agentId: filtres.agentId,
        superAdmin: filtres.superAdminSeulement ? true : undefined,
        derogation: filtres.derogationSeulement ? true : undefined,
        ...(filtres.objetId
          ? {
              OR: [
                { entiteId: filtres.objetId },
                { dossierId: filtres.objetId },
              ],
            }
          : {}),
      },
      include: {
        agent: { select: { prenom: true, nom: true, anonymise: true } },
      },
      orderBy: { consulteLe: 'desc' },
      take: filtres.limite,
      skip: filtres.decalage,
    });

    const libelles = await this.libellesDesObjets(agent, entrees);

    return entrees.map((entree) => {
      const nature: 'entite' | 'dossier' = entree.entiteId
        ? 'entite'
        : 'dossier';
      const objetId = entree.entiteId ?? entree.dossierId!;

      return {
        id: entree.id.toString(),
        agentId: entree.agentId,
        agentLibelle: this.nommer(entree.agent),
        nature,
        objetId,
        objetLibelle: libelles.get(objetId) ?? null,
        derogation: entree.derogation,
        superAdmin: entree.superAdmin,
        consulteLe: entree.consulteLe.toISOString(),
      };
    });
  }

  async orphelines(agent: AgentCourant): Promise<EntiteOrphelineDto[]> {
    const entites = await this.visibilite.clientPour(agent).entite.findMany({
      where: {
        etat: EtatEntite.actif,
        fusionneeVersId: null,
        faitsOuElleEstSujet: {
          none: { nature: NatureFait.lien, etat: 'actif' },
        },
        faitsOuElleEstCible: { none: { etat: 'actif' } },
      },
      include: {
        typeEntite: { select: { code: true } },
        auteur: { select: { prenom: true, nom: true, anonymise: true } },
      },
      orderBy: { creeLe: 'desc' },
      take: 200,
    });

    return entites.map((entite) => ({
      id: entite.id,
      libelle: entite.libelle,
      typeCode: entite.typeEntite.code,
      creeLe: entite.creeLe.toISOString(),
      auteur: entite.auteur.anonymise ? null : this.nommer(entite.auteur),
    }));
  }

  private nommer(agent: AgentTrace | null): string {
    if (!agent) {
      return 'la plateforme';
    }

    return agent.anonymise ? 'agent supprimé' : `${agent.prenom} ${agent.nom}`;
  }

  private async libellesDesCibles(
    agent: AgentCourant,
    entrees: { cibleTable: string; cibleId: string | null }[],
  ): Promise<Map<string, string>> {
    const parTable = new Map<string, Set<string>>();

    for (const entree of entrees) {
      if (!entree.cibleId) {
        continue;
      }

      const deja = parTable.get(entree.cibleTable) ?? new Set<string>();
      deja.add(entree.cibleId);
      parTable.set(entree.cibleTable, deja);
    }

    return this.resoudre(
      agent,
      [...(parTable.get('entite') ?? [])],
      [...(parTable.get('dossier') ?? [])],
    );
  }

  private async libellesDesObjets(
    agent: AgentCourant,
    entrees: { entiteId: string | null; dossierId: string | null }[],
  ): Promise<Map<string, string>> {
    return this.resoudre(
      agent,
      entrees.flatMap((entree) => (entree.entiteId ? [entree.entiteId] : [])),
      entrees.flatMap((entree) => (entree.dossierId ? [entree.dossierId] : [])),
    );
  }

  private async resoudre(
    agent: AgentCourant,
    entiteIds: string[],
    dossierIds: string[],
  ): Promise<Map<string, string>> {
    const client = this.visibilite.clientPour(agent);

    const [entites, dossiers] = await Promise.all([
      entiteIds.length > 0
        ? client.entite.findMany({
            where: { id: { in: entiteIds } },
            select: { id: true, libelle: true },
          })
        : Promise.resolve([] as { id: string; libelle: string }[]),
      dossierIds.length > 0
        ? client.dossier.findMany({
            where: { id: { in: dossierIds } },
            select: { id: true, nom: true },
          })
        : Promise.resolve([] as { id: string; nom: string }[]),
    ]);

    return new Map<string, string>([
      ...entites.map(
        (entite) => [entite.id, entite.libelle] as [string, string],
      ),
      ...dossiers.map(
        (dossier) => [dossier.id, dossier.nom] as [string, string],
      ),
    ]);
  }
}

export type ValeurTracee = Prisma.JsonValue;
