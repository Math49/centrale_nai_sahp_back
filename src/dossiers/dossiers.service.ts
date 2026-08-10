import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Visibilite, type Dossier } from '@prisma/client';

import type { AgentCourant } from '../auth/agent-courant';
import { JournalAuditService } from '../journal/journal-audit.service';
import { BusInvalidation } from '../graphe/bus-invalidation';
import { PrismaService } from '../prisma/prisma.service';
import { VisibiliteService } from '../visibilite/visibilite.service';
import type {
  DossierResumeDto,
  ModificationDossierDto,
  PanneauDossierDto,
  RattachementDto,
} from './dossiers.dto';

/**
 * Dossiers — noyau posé au lot 5, exposé au lot 8.
 *
 * Le moteur de visibilité en dépend : un fait hérite de la visibilité de son
 * dossier de saisie, et la règle des gardiens compte le dossier parmi les
 * quatre objets à franchir. Les routes, le panneau de dossier et la gestion du
 * suivi viennent au lot 8 ; ce service porte ce qu'il faut pour que la
 * visibilité soit vérifiable dès maintenant.
 *
 * **Le dossier ne contient rien.** Il contextualise.
 */
@Injectable()
export class DossiersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibilite: VisibiliteService,
    private readonly audit: JournalAuditService,
    private readonly bus: BusInvalidation,
  ) {}

  async creer(
    agentId: string,
    donnees: {
      nom: string;
      entitePivotId: string;
      visibilite?: Visibilite;
      note?: string;
    },
  ): Promise<Dossier> {
    const pivot = await this.prisma.sansFiltre.entite.findUnique({
      where: { id: donnees.entitePivotId },
    });

    if (!pivot) {
      throw new NotFoundException('entité pivot inconnue');
    }

    try {
      const cree = await this.prisma.$transaction(async (transaction) => {
        const dossier = await transaction.dossier.create({
          data: {
            nom: donnees.nom.trim(),
            entitePivotId: pivot.id,
            visibilite: donnees.visibilite ?? Visibilite.public,
            note: donnees.note,
            creePar: agentId,
          },
        });

        // Le pivot est suivi par son dossier dès la création : c'est ce qui
        // rend « ouvrir le dossier » équivalent à « ouvrir sa fiche ».
        await transaction.suivi.create({
          data: {
            dossierId: dossier.id,
            entiteId: pivot.id,
            ajoutePar: agentId,
          },
        });

        await this.audit.tracer(
          {
            agentId,
            action: 'dossier.creer',
            cibleTable: 'dossier',
            cibleId: dossier.id,
            apres: { nom: dossier.nom, visibilite: dossier.visibilite },
          },
          transaction,
        );

        return dossier;
      });

      // Le pivot entre dans le suivi : les récurrences en dépendent.
      this.bus.signaler();
      return cree;
    } catch (erreur) {
      if (
        erreur instanceof Prisma.PrismaClientKnownRequestError &&
        erreur.code === 'P2002'
      ) {
        throw new ConflictException('un dossier porte déjà ce nom');
      }
      throw erreur;
    }
  }

  /**
   * Change la visibilité d'un dossier.
   *
   * La cascade en base recalcule aussitôt la visibilité effective de tous les
   * faits saisis depuis ce dossier : c'est le cas de référence — l'entité reste
   * publique, le dossier passe en privé, et tout ce qui en vient disparaît.
   */
  async definirVisibilite(
    agentId: string,
    id: string,
    visibilite: Visibilite,
  ): Promise<Dossier> {
    const avant = await this.charger(id);

    const apresTransaction = await this.prisma.$transaction(
      async (transaction) => {
        const apres = await transaction.dossier.update({
          where: { id },
          data: { visibilite },
        });

        await this.audit.tracer(
          {
            agentId,
            action: 'dossier.modifier',
            cibleTable: 'dossier',
            cibleId: id,
            avant: { visibilite: avant.visibilite },
            apres: { visibilite },
          },
          transaction,
        );

        return apres;
      },
    );

    // La cascade en base a déjà recalculé les visibilités effectives ; le
    // graphe en mémoire, lui, les porte en copie et doit être rechargé.
    this.bus.signaler();
    return apresTransaction;
  }

  async suivre(
    agentId: string,
    dossierId: string,
    entiteId: string,
  ): Promise<void> {
    await this.charger(dossierId);

    await this.prisma.suivi.upsert({
      where: { dossierId_entiteId: { dossierId, entiteId } },
      create: { dossierId, entiteId, ajoutePar: agentId },
      update: {},
    });

    this.bus.signaler();
  }

  /** Whitelist : l'habilitation est nominative, jamais déduite d'un grade. */
  async habiliter(
    accordePar: string,
    dossierId: string,
    agentId: string,
  ): Promise<void> {
    await this.charger(dossierId);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.habilitationDossier.upsert({
        where: { dossierId_agentId: { dossierId, agentId } },
        create: { dossierId, agentId, accordePar },
        update: {},
      });

      await this.audit.tracer(
        {
          agentId: accordePar,
          action: 'dossier.habiliter',
          cibleTable: 'habilitation_dossier',
          cibleId: dossierId,
          apres: { agentHabilite: agentId },
        },
        transaction,
      );
    });
  }

  async retirerHabilitation(
    retirePar: string,
    dossierId: string,
    agentId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.habilitationDossier.deleteMany({
        where: { dossierId, agentId },
      });

      await this.audit.tracer(
        {
          agentId: retirePar,
          action: 'dossier.retirer_habilitation',
          cibleTable: 'habilitation_dossier',
          cibleId: dossierId,
          avant: { agentHabilite: agentId },
        },
        transaction,
      );
    });
  }

  /** Habilitation nominative sur une entité, l'autre whitelist. */
  async habiliterSurEntite(
    accordePar: string,
    entiteId: string,
    agentId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.habilitationEntite.upsert({
        where: { entiteId_agentId: { entiteId, agentId } },
        create: { entiteId, agentId, accordePar },
        update: {},
      });

      await this.audit.tracer(
        {
          agentId: accordePar,
          action: 'entite.habiliter',
          cibleTable: 'habilitation_entite',
          cibleId: entiteId,
          apres: { agentHabilite: agentId },
        },
        transaction,
      );
    });
  }

  // ─────────────────────────── Lecture ───────────────────────────

  async lister(agent: AgentCourant): Promise<DossierResumeDto[]> {
    const client = this.visibilite.clientPour(agent);

    const dossiers = await client.dossier.findMany({
      include: { entitePivot: true },
      orderBy: { creeLe: 'desc' },
    });

    return Promise.all(
      dossiers.map(async (dossier) => ({
        ...this.resumer(dossier, dossier.entitePivot.libelle),
        nombreSuivis: await this.compterSuivis(agent, dossier.id),
      })),
    );
  }

  /**
   * Panneau de dossier.
   *
   * Il n'est atteignable que par l'entrée du dossier : une fiche ouverte
   * directement n'en montre rien. Sur un dossier restreint sans habilitation,
   * le nom s'affiche et le reste se tait — objet visible, contenu fermé.
   */
  async panneau(agent: AgentCourant, id: string): Promise<PanneauDossierDto> {
    const controle = await this.visibilite.dossierVisibleOuIntrouvable(
      agent,
      id,
    );

    const dossier = await this.prisma.sansFiltre.dossier.findUniqueOrThrow({
      where: { id: controle.id },
      include: { entitePivot: true },
    });

    const lisible = this.visibilite.contenuDeDossierLisible(agent, dossier);

    if (!lisible) {
      return {
        ...this.resumer(dossier, dossier.entitePivot.libelle),
        nombreSuivis: 0,
        contenuLisible: false,
        note: null,
        suivis: [],
        habilitations: [],
      };
    }

    const client = this.visibilite.clientPour(agent);

    // Le suivi est filtré : une entité privée surveillée par ce dossier ne doit
    // pas se révéler à qui n'y est pas habilité.
    const [entitesVisibles, suivis, habilitations] = await Promise.all([
      client.entite.findMany({
        where: { suivis: { some: { dossierId: id } } },
        include: { typeEntite: true },
      }),
      this.prisma.sansFiltre.suivi.findMany({ where: { dossierId: id } }),
      this.prisma.sansFiltre.habilitationDossier.findMany({
        where: { dossierId: id },
        include: { agent: true },
        orderBy: { accordeLe: 'asc' },
      }),
    ]);

    const ajoutePar = new Map(
      suivis.map((suivi) => [suivi.entiteId, suivi.ajouteLe]),
    );

    return {
      ...this.resumer(dossier, dossier.entitePivot.libelle),
      nombreSuivis: entitesVisibles.length,
      contenuLisible: true,
      note: dossier.note,
      suivis: entitesVisibles
        .map((entite) => ({
          id: entite.id,
          libelle: entite.libelle,
          typeCode: entite.typeEntite.code,
          estPivot: entite.id === dossier.entitePivotId,
          ajouteLe: (ajoutePar.get(entite.id) ?? entite.creeLe).toISOString(),
        }))
        .sort((a, b) => Number(b.estPivot) - Number(a.estPivot)),
      habilitations: habilitations.map((habilitation) => ({
        agentId: habilitation.agentId,
        libelle: habilitation.agent.anonymise
          ? 'agent supprimé'
          : `${habilitation.agent.prenom} ${habilitation.agent.nom}`,
        matricule: habilitation.agent.matricule,
        accordeLe: habilitation.accordeLe.toISOString(),
      })),
    };
  }

  /**
   * Dossiers qui suivent une entité, tels qu'ils s'affichent sur sa fiche.
   *
   * Une entité peut appartenir à plusieurs dossiers, et la fiche l'indique.
   * Filtré : un dossier privé n'apparaît pas, sans mention.
   */
  async rattachements(
    agent: AgentCourant,
    entiteId: string,
  ): Promise<RattachementDto[]> {
    const client = this.visibilite.clientPour(agent);

    const dossiers = await client.dossier.findMany({
      where: { suivis: { some: { entiteId } } },
      orderBy: { nom: 'asc' },
    });

    return dossiers.map((dossier) => ({
      id: dossier.id,
      nom: dossier.nom,
      visibilite: dossier.visibilite,
      estPivot: dossier.entitePivotId === entiteId,
    }));
  }

  // ─────────────────────────── Écriture ───────────────────────────

  async modifier(
    agent: AgentCourant,
    id: string,
    donnees: ModificationDossierDto,
  ): Promise<PanneauDossierDto> {
    await this.visibilite.dossierVisibleOuIntrouvable(agent, id);

    if (donnees.visibilite !== undefined) {
      this.verifierDroitDeClasser(agent, donnees.visibilite);
    }

    const avant = await this.charger(id);

    await this.prisma
      .$transaction(async (transaction) => {
        await transaction.dossier.update({ where: { id }, data: donnees });

        await this.audit.tracer(
          {
            agentId: agent.id,
            action: 'dossier.modifier',
            cibleTable: 'dossier',
            cibleId: id,
            avant: { nom: avant.nom, visibilite: avant.visibilite },
            apres: {
              nom: donnees.nom ?? avant.nom,
              visibilite: donnees.visibilite ?? avant.visibilite,
            },
          },
          transaction,
        );
      })
      .catch((erreur: unknown) => {
        throw this.traduireNomEnDouble(erreur);
      });

    this.bus.signaler();
    return this.panneau(agent, id);
  }

  async nePlusSuivre(
    agent: AgentCourant,
    dossierId: string,
    entiteId: string,
  ): Promise<void> {
    const dossier = await this.charger(dossierId);

    if (dossier.entitePivotId === entiteId) {
      throw new ConflictException(
        'l’entité pivot ne se retire pas du suivi — le dossier s’y ancre',
      );
    }

    await this.prisma.suivi.deleteMany({ where: { dossierId, entiteId } });
    this.bus.signaler();
  }

  /**
   * Classer un objet en restreint ou privé est une permission à part.
   *
   * La règle vit dans `VisibiliteService`, avec toutes les autres décisions de
   * visibilité ; ce relais existe pour les appelants historiques.
   */
  verifierDroitDeClasser(agent: AgentCourant, visibilite: Visibilite): void {
    this.visibilite.verifierDroitDeClasser(agent, visibilite);
  }

  private async compterSuivis(
    agent: AgentCourant,
    dossierId: string,
  ): Promise<number> {
    // Le décompte passe par le client filtré : afficher un total exhaustif
    // révélerait l'existence des entités masquées.
    return this.visibilite.clientPour(agent).entite.count({
      where: { suivis: { some: { dossierId } } },
    });
  }

  private resumer(
    dossier: Dossier,
    entitePivotLibelle: string,
  ): Omit<DossierResumeDto, 'nombreSuivis'> & { nombreSuivis: number } {
    return {
      id: dossier.id,
      nom: dossier.nom,
      visibilite: dossier.visibilite,
      etat: dossier.etat,
      entitePivotId: dossier.entitePivotId,
      entitePivotLibelle,
      nombreSuivis: 0,
      creeLe: dossier.creeLe.toISOString(),
    };
  }

  private traduireNomEnDouble(erreur: unknown): unknown {
    if (
      erreur instanceof Prisma.PrismaClientKnownRequestError &&
      erreur.code === 'P2002'
    ) {
      return new ConflictException('un dossier porte déjà ce nom');
    }

    return erreur;
  }

  private async charger(id: string): Promise<Dossier> {
    const dossier = await this.prisma.sansFiltre.dossier.findUnique({
      where: { id },
    });

    if (!dossier) {
      throw new NotFoundException('dossier inconnu');
    }

    return dossier;
  }
}
