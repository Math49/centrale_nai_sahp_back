import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EtatEntite,
  Prisma,
  Visibilite,
  type Agent,
  type AssignationCarte,
  type CarteEnquete,
  type ColonneKanban,
  type HabilitationCarteEnquete,
} from '@prisma/client';

import type { AgentCourant } from '../auth/agent-courant';
import { JournalAuditService } from '../journal/journal-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  predicatCarteEnquete,
  predicatDossier,
  predicatEntite,
} from '../visibilite/predicats';
import { VisibiliteService } from '../visibilite/visibilite.service';
import type {
  CarteEnqueteDto,
  ColonneKanbanDto,
  CreationCarteDto,
  CreationColonneDto,
  DeplacementCarteDto,
  ModificationCarteDto,
  ModificationColonneDto,
} from './enquetes.dto';

type CarteComplete = CarteEnquete & {
  assignations: (AssignationCarte & { agent: Agent })[];
  habilitations: (HabilitationCarteEnquete & { agent: Agent })[];
  auteur: Agent;
};

const INCLUSIONS = {
  assignations: { include: { agent: true }, orderBy: { assigneLe: 'asc' } },
  habilitations: { include: { agent: true }, orderBy: { accordeLe: 'asc' } },
  auteur: true,
} as const;

@Injectable()
export class EnquetesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibilite: VisibiliteService,
    private readonly audit: JournalAuditService,
  ) {}

  // ────────────────────────── Colonnes ──────────────────────────

  async listerColonnes(): Promise<ColonneKanbanDto[]> {
    const colonnes = await this.prisma.colonneKanban.findMany({
      orderBy: { ordre: 'asc' },
    });

    return colonnes.map((colonne) => this.presenterColonne(colonne));
  }

  async creerColonne(
    auteurId: string,
    donnees: CreationColonneDto,
  ): Promise<ColonneKanbanDto> {
    const cree = await this.executer(() =>
      this.prisma.$transaction(async (transaction) => {
        const dernier = await transaction.colonneKanban.aggregate({
          _max: { ordre: true },
        });

        const colonne = await transaction.colonneKanban.create({
          data: { ...donnees, ordre: (dernier._max.ordre ?? -1) + 1 },
        });

        await this.audit.tracer(
          {
            agentId: auteurId,
            action: 'kanban.colonne.creer',
            cibleTable: 'colonne_kanban',
            cibleId: colonne.id,
            apres: { code: colonne.code },
          },
          transaction,
        );

        return colonne;
      }),
    );

    return this.presenterColonne(cree);
  }

  async modifierColonne(
    auteurId: string,
    id: string,
    donnees: ModificationColonneDto,
  ): Promise<ColonneKanbanDto> {
    await this.chargerColonne(id);

    const apres = await this.executer(() =>
      this.prisma.$transaction(async (transaction) => {
        const colonne = await transaction.colonneKanban.update({
          where: { id },
          data: donnees,
        });

        await this.audit.tracer(
          {
            agentId: auteurId,
            action: 'kanban.colonne.modifier',
            cibleTable: 'colonne_kanban',
            cibleId: id,
            apres: { libelle: colonne.libelle },
          },
          transaction,
        );

        return colonne;
      }),
    );

    return this.presenterColonne(apres);
  }

  async supprimerColonne(auteurId: string, id: string): Promise<void> {
    await this.chargerColonne(id);

    await this.executer(() =>
      this.prisma.$transaction(async (transaction) => {
        await transaction.colonneKanban.delete({ where: { id } });

        await this.audit.tracer(
          {
            agentId: auteurId,
            action: 'kanban.colonne.supprimer',
            cibleTable: 'colonne_kanban',
            cibleId: id,
          },
          transaction,
        );
      }),
    );
  }

  async ordonnerColonnes(auteurId: string, ids: string[]): Promise<void> {
    const existantes = await this.prisma.colonneKanban.findMany({
      select: { id: true },
    });

    const complet =
      ids.length === existantes.length &&
      existantes.every((colonne) => ids.includes(colonne.id));

    if (!complet) {
      throw new BadRequestException(
        'le réordonnancement doit porter sur le jeu complet',
      );
    }

    await this.prisma.$transaction(async (transaction) => {
      await Promise.all(
        ids.map((id, rang) =>
          transaction.colonneKanban.update({
            where: { id },
            data: { ordre: rang },
          }),
        ),
      );

      await this.audit.tracer(
        {
          agentId: auteurId,
          action: 'kanban.colonne.ordonner',
          cibleTable: 'colonne_kanban',
          cibleId: null,
          apres: { ids },
        },
        transaction,
      );
    });
  }

  // ─────────────────────────── Cartes ───────────────────────────

  async listerCartes(
    agent: AgentCourant,
    options: { archives?: boolean } = {},
  ): Promise<CarteEnqueteDto[]> {
    const cartes = await this.prisma.sansFiltre.carteEnquete.findMany({
      where: {
        AND: [
          predicatCarteEnquete(this.visibilite.contexte(agent)),
          options.archives ? {} : { etat: EtatEntite.actif },
        ],
      },
      include: INCLUSIONS,
      orderBy: [{ colonneId: 'asc' }, { rang: 'asc' }],
    });

    return Promise.all(
      cartes.map((carte) => this.presenterCarte(agent, carte)),
    );
  }

  async creerCarte(
    agent: AgentCourant,
    donnees: CreationCarteDto,
  ): Promise<CarteEnqueteDto> {
    await this.chargerColonne(donnees.colonneId);

    if (donnees.visibilite !== undefined) {
      this.visibilite.verifierDroitDeClasser(agent, donnees.visibilite);
    }

    await this.verifierRattachements(agent, donnees);

    const cree = await this.prisma.$transaction(async (transaction) => {
      const dernier = await transaction.carteEnquete.aggregate({
        where: { colonneId: donnees.colonneId },
        _max: { rang: true },
      });

      const carte = await transaction.carteEnquete.create({
        data: {
          colonneId: donnees.colonneId,
          rang: (dernier._max.rang ?? -1) + 1,
          titre: donnees.titre,
          description: donnees.description,
          echeance: donnees.echeance ? new Date(donnees.echeance) : null,
          dossierId: donnees.dossierId,
          entiteId: donnees.entiteId,
          visibilite: donnees.visibilite,
          creePar: agent.id,
          modifiePar: agent.id,
          assignations: {
            create: (donnees.assignes ?? []).map((agentId) => ({
              agentId,
              assignePar: agent.id,
            })),
          },
        },
        include: INCLUSIONS,
      });

      await this.audit.tracer(
        {
          agentId: agent.id,
          action: 'kanban.carte.creer',
          cibleTable: 'carte_enquete',
          cibleId: carte.id,
          apres: { titre: carte.titre, assignes: donnees.assignes ?? [] },
        },
        transaction,
      );

      return carte;
    });

    return this.presenterCarte(agent, cree);
  }

  async modifierCarte(
    agent: AgentCourant,
    id: string,
    donnees: ModificationCarteDto,
  ): Promise<CarteEnqueteDto> {
    const avant = await this.carteVisibleOuIntrouvable(agent, id);

    if (donnees.visibilite !== undefined) {
      this.visibilite.verifierDroitDeClasser(agent, donnees.visibilite);
    }

    await this.verifierRattachements(agent, donnees);

    const apres = await this.prisma.$transaction(async (transaction) => {
      // Le jeu d'assignations est complet : on remplace plutôt que de
      // différencier, pour qu'il n'existe qu'une façon de décrire l'état.
      if (donnees.assignes !== undefined) {
        await transaction.assignationCarte.deleteMany({
          where: { carteId: id },
        });
        await transaction.assignationCarte.createMany({
          data: donnees.assignes.map((agentId) => ({
            carteId: id,
            agentId,
            assignePar: agent.id,
          })),
        });
      }

      const carte = await transaction.carteEnquete.update({
        where: { id },
        data: {
          titre: donnees.titre,
          description: donnees.description,
          echeance: donnees.echeance ? new Date(donnees.echeance) : undefined,
          dossierId: donnees.dossierId,
          entiteId: donnees.entiteId,
          visibilite: donnees.visibilite,
          modifiePar: agent.id,
        },
        include: INCLUSIONS,
      });

      await this.audit.tracer(
        {
          agentId: agent.id,
          action: 'kanban.carte.modifier',
          cibleTable: 'carte_enquete',
          cibleId: id,
          avant: { titre: avant.titre, visibilite: avant.visibilite },
          apres: { titre: carte.titre, visibilite: carte.visibilite },
        },
        transaction,
      );

      return carte;
    });

    return this.presenterCarte(agent, apres);
  }

  /**
   * Déplacement d'une carte, entre colonnes ou dans la sienne.
   *
   * Les rangs des colonnes touchées sont **réécrits en entier** : c'est le seul
   * moyen d'éviter les trous et les doublons quand plusieurs agents déplacent
   * en même temps. Le tableau n'envoie que la carte et sa destination — lui
   * demander le jeu complet, comme au référentiel, serait pénible à produire au
   * moment d'un dépôt.
   */
  async deplacerCarte(
    agent: AgentCourant,
    id: string,
    donnees: DeplacementCarteDto,
  ): Promise<CarteEnqueteDto> {
    const avant = await this.carteVisibleOuIntrouvable(agent, id);
    await this.chargerColonne(donnees.colonneId);

    const apres = await this.prisma.$transaction(async (transaction) => {
      const restantes = await transaction.carteEnquete.findMany({
        where: {
          colonneId: avant.colonneId,
          etat: EtatEntite.actif,
          id: { not: id },
        },
        orderBy: { rang: 'asc' },
        select: { id: true },
      });

      const arrivee =
        avant.colonneId === donnees.colonneId
          ? restantes
          : await transaction.carteEnquete.findMany({
              where: { colonneId: donnees.colonneId, etat: EtatEntite.actif },
              orderBy: { rang: 'asc' },
              select: { id: true },
            });

      const ordonnee = arrivee.map((carte) => carte.id);
      ordonnee.splice(Math.min(donnees.rang, ordonnee.length), 0, id);

      // Colonne de départ, si elle est distincte : ses rangs se resserrent.
      if (avant.colonneId !== donnees.colonneId) {
        await Promise.all(
          restantes.map((carte, rang) =>
            transaction.carteEnquete.update({
              where: { id: carte.id },
              data: { rang },
            }),
          ),
        );
      }

      await Promise.all(
        ordonnee.map((carteId, rang) =>
          transaction.carteEnquete.update({
            where: { id: carteId },
            data: {
              rang,
              ...(carteId === id
                ? { colonneId: donnees.colonneId, modifiePar: agent.id }
                : {}),
            },
          }),
        ),
      );

      await this.audit.tracer(
        {
          agentId: agent.id,
          action: 'kanban.carte.deplacer',
          cibleTable: 'carte_enquete',
          cibleId: id,
          avant: { colonneId: avant.colonneId, rang: avant.rang },
          apres: { colonneId: donnees.colonneId, rang: donnees.rang },
        },
        transaction,
      );

      return transaction.carteEnquete.findUniqueOrThrow({
        where: { id },
        include: INCLUSIONS,
      });
    });

    return this.presenterCarte(agent, apres);
  }

  async changerEtat(
    agent: AgentCourant,
    id: string,
    etat: EtatEntite,
  ): Promise<CarteEnqueteDto> {
    const avant = await this.carteVisibleOuIntrouvable(agent, id);

    if (avant.etat === etat) {
      throw new ConflictException(
        etat === EtatEntite.archive ? 'déjà archivée' : 'déjà active',
      );
    }

    const apres = await this.prisma.$transaction(async (transaction) => {
      const carte = await transaction.carteEnquete.update({
        where: { id },
        data: {
          etat,
          archiveLe: etat === EtatEntite.archive ? new Date() : null,
          modifiePar: agent.id,
        },
        include: INCLUSIONS,
      });

      await this.audit.tracer(
        {
          agentId: agent.id,
          action:
            etat === EtatEntite.archive
              ? 'kanban.carte.archiver'
              : 'kanban.carte.desarchiver',
          cibleTable: 'carte_enquete',
          cibleId: id,
          avant: { etat: avant.etat },
          apres: { etat: carte.etat },
        },
        transaction,
      );

      return carte;
    });

    return this.presenterCarte(agent, apres);
  }

  async habiliter(
    agent: AgentCourant,
    id: string,
    agentHabiliteId: string,
  ): Promise<void> {
    const carte = await this.carteVisibleOuIntrouvable(agent, id);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.habilitationCarteEnquete.upsert({
        where: {
          carteId_agentId: { carteId: carte.id, agentId: agentHabiliteId },
        },
        create: {
          carteId: carte.id,
          agentId: agentHabiliteId,
          accordePar: agent.id,
        },
        update: {},
      });

      await this.audit.tracer(
        {
          agentId: agent.id,
          action: 'kanban.carte.habiliter',
          cibleTable: 'habilitation_carte_enquete',
          cibleId: carte.id,
          apres: { agentHabilite: agentHabiliteId },
        },
        transaction,
      );
    });
  }

  async retirerHabilitation(
    agent: AgentCourant,
    id: string,
    agentHabiliteId: string,
  ): Promise<void> {
    const carte = await this.carteVisibleOuIntrouvable(agent, id);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.habilitationCarteEnquete.deleteMany({
        where: { carteId: carte.id, agentId: agentHabiliteId },
      });

      await this.audit.tracer(
        {
          agentId: agent.id,
          action: 'kanban.carte.retirer_habilitation',
          cibleTable: 'habilitation_carte_enquete',
          cibleId: carte.id,
          avant: { agentHabilite: agentHabiliteId },
        },
        transaction,
      );
    });
  }

  // ─────────────────────────── Interne ───────────────────────────

  /**
   * Un rattachement ne se pose que vers un objet qu'on voit soi-même.
   *
   * Sans ce contrôle, on pourrait rattacher une carte à un dossier privé qu'on
   * ne peut pas lire, et découvrir son existence par le simple fait que
   * l'écriture passe.
   */
  private async verifierRattachements(
    agent: AgentCourant,
    donnees: { dossierId?: string; entiteId?: string },
  ): Promise<void> {
    const contexte = this.visibilite.contexte(agent);

    if (donnees.dossierId) {
      const dossier = await this.prisma.sansFiltre.dossier.findFirst({
        where: { AND: [{ id: donnees.dossierId }, predicatDossier(contexte)] },
        select: { id: true },
      });

      if (!dossier) {
        throw new NotFoundException('dossier inconnu');
      }
    }

    if (donnees.entiteId) {
      const entite = await this.prisma.sansFiltre.entite.findFirst({
        where: { AND: [{ id: donnees.entiteId }, predicatEntite(contexte)] },
        select: { id: true },
      });

      if (!entite) {
        throw new NotFoundException('donnée inconnue');
      }
    }
  }

  private async carteVisibleOuIntrouvable(
    agent: AgentCourant,
    id: string,
  ): Promise<CarteComplete> {
    const carte = await this.prisma.sansFiltre.carteEnquete.findFirst({
      where: {
        AND: [{ id }, predicatCarteEnquete(this.visibilite.contexte(agent))],
      },
      include: INCLUSIONS,
    });

    if (!carte) {
      throw new NotFoundException('carte inconnue');
    }

    return carte;
  }

  private async chargerColonne(id: string): Promise<ColonneKanban> {
    const colonne = await this.prisma.colonneKanban.findUnique({
      where: { id },
    });

    if (!colonne) {
      throw new NotFoundException('colonne inconnue');
    }

    return colonne;
  }

  private presenterColonne(colonne: ColonneKanban): ColonneKanbanDto {
    return {
      id: colonne.id,
      code: colonne.code,
      libelle: colonne.libelle,
      ordre: colonne.ordre,
    };
  }

  private async presenterCarte(
    agent: AgentCourant,
    carte: CarteComplete,
  ): Promise<CarteEnqueteDto> {
    const contexte = this.visibilite.contexte(agent);

    // Les rattachements se résolvent **filtrés** : le lien existe, son libellé
    // revient nul si l'objet n'est pas consultable — comme le journal le fait.
    const [dossier, entite] = await Promise.all([
      carte.dossierId
        ? this.prisma.sansFiltre.dossier.findFirst({
            where: {
              AND: [{ id: carte.dossierId }, predicatDossier(contexte)],
            },
            select: { nom: true },
          })
        : null,
      carte.entiteId
        ? this.prisma.sansFiltre.entite.findFirst({
            where: { AND: [{ id: carte.entiteId }, predicatEntite(contexte)] },
            select: { libelle: true },
          })
        : null,
    ]);

    const habilites = new Set(
      carte.habilitations.map((habilitation) => habilitation.agentId),
    );

    return {
      id: carte.id,
      colonneId: carte.colonneId,
      rang: carte.rang,
      titre: carte.titre,
      description: carte.description,
      echeance: carte.echeance
        ? carte.echeance.toISOString().slice(0, 10)
        : null,
      dossier: carte.dossierId
        ? { id: carte.dossierId, libelle: dossier?.nom ?? null }
        : null,
      entite: carte.entiteId
        ? { id: carte.entiteId, libelle: entite?.libelle ?? null }
        : null,
      assignes: carte.assignations.map((assignation) => ({
        agentId: assignation.agentId,
        libelle: this.nommer(assignation.agent),
        matricule: assignation.agent.matricule,
        initiales: this.initiales(assignation.agent),
        // Une carte publique est lisible de tous ; sinon, seule l'habilitation
        // — ou une dérogation — ouvre. L'écran s'en sert pour prévenir.
        peutLire:
          carte.visibilite === Visibilite.public ||
          habilites.has(assignation.agentId),
        assigneLe: assignation.assigneLe.toISOString(),
      })),
      visibilite: carte.visibilite,
      etat: carte.etat,
      auteurLibelle: this.nommer(carte.auteur),
      creeLe: carte.creeLe.toISOString(),
      modifieLe: carte.modifieLe.toISOString(),
      habilitations: carte.habilitations.map((habilitation) => ({
        agentId: habilitation.agentId,
        libelle: this.nommer(habilitation.agent),
        matricule: habilitation.agent.matricule,
        accordeLe: habilitation.accordeLe.toISOString(),
      })),
    };
  }

  private nommer(agent: Agent): string {
    return agent.anonymise ? 'agent supprimé' : `${agent.prenom} ${agent.nom}`;
  }

  private initiales(agent: Agent): string {
    if (agent.anonymise) {
      return '?';
    }

    return `${agent.prenom.at(0) ?? ''}${agent.nom.at(0) ?? ''}`.toUpperCase();
  }

  private async executer<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (erreur) {
      if (erreur instanceof Prisma.PrismaClientKnownRequestError) {
        if (erreur.code === 'P2002') {
          throw new ConflictException('code déjà utilisé');
        }
        if (erreur.code === 'P2003' || erreur.code === 'P2014') {
          throw new ConflictException(
            'colonne encore utilisée — des cartes en dépendent',
          );
        }
      }

      throw erreur;
    }
  }
}
