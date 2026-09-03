import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EtatEntite,
  NatureRepere,
  Prisma,
  TypeDonnee,
  type Repere,
  type TypeRepere,
} from '@prisma/client';

import type { AgentCourant } from '../auth/agent-courant';
import { JournalAuditService } from '../journal/journal-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { predicatFait, predicatRepere } from '../visibilite/predicats';
import { VisibiliteService } from '../visibilite/visibilite.service';
import type {
  CreationRepereDto,
  CreationTypeRepereDto,
  ModificationRepereDto,
  ModificationTypeRepereDto,
  PointDeDonneeDto,
  RepereDto,
  TypeRepereDto,
} from './carte.dto';

type RepereComplet = Repere & { typeRepere: TypeRepere };

/**
 * L'accent de la centrale, en dur.
 *
 * C'est la couleur d'un point de fiche posé avant que la couleur ne se
 * choisisse. Elle double `--accent` du front : une API ne lit pas de feuille de
 * style, et un point sans couleur devait s'afficher quand même.
 */
const ACCENT = '#6f9dc4';

/** Un point du plan, en coordonnées normalisées. */
interface Point {
  x: number;
  y: number;
}

@Injectable()
export class CarteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibilite: VisibiliteService,
    private readonly audit: JournalAuditService,
  ) {}

  // ───────────────────────── Types de repères ─────────────────────────

  async listerTypes(): Promise<TypeRepereDto[]> {
    const types = await this.prisma.typeRepere.findMany({
      orderBy: { ordre: 'asc' },
    });

    return types.map((type) => this.presenterType(type));
  }

  async creerType(
    auteurId: string,
    donnees: CreationTypeRepereDto,
  ): Promise<TypeRepereDto> {
    const cree = await this.executer(() =>
      this.prisma.$transaction(async (transaction) => {
        const dernier = await transaction.typeRepere.aggregate({
          _max: { ordre: true },
        });

        const type = await transaction.typeRepere.create({
          data: { ...donnees, ordre: (dernier._max.ordre ?? -1) + 1 },
        });

        await this.audit.tracer(
          {
            agentId: auteurId,
            action: 'carte.type_repere.creer',
            cibleTable: 'type_repere',
            cibleId: type.id,
            apres: { code: type.code, nature: type.nature },
          },
          transaction,
        );

        return type;
      }),
    );

    return this.presenterType(cree);
  }

  async modifierType(
    auteurId: string,
    id: string,
    donnees: ModificationTypeRepereDto,
  ): Promise<TypeRepereDto> {
    const avant = await this.chargerType(id);

    const apres = await this.executer(() =>
      this.prisma.$transaction(async (transaction) => {
        const type = await transaction.typeRepere.update({
          where: { id },
          data: donnees,
        });

        await this.audit.tracer(
          {
            agentId: auteurId,
            action: 'carte.type_repere.modifier',
            cibleTable: 'type_repere',
            cibleId: id,
            avant: { libelle: avant.libelle, icone: avant.icone },
            apres: { libelle: type.libelle, icone: type.icone },
          },
          transaction,
        );

        return type;
      }),
    );

    return this.presenterType(apres);
  }

  async supprimerType(auteurId: string, id: string): Promise<void> {
    await this.chargerType(id);
    await this.verifierTypeNonCite(id);

    await this.executer(() =>
      this.prisma.$transaction(async (transaction) => {
        await transaction.typeRepere.delete({ where: { id } });

        await this.audit.tracer(
          {
            agentId: auteurId,
            action: 'carte.type_repere.supprimer',
            cibleTable: 'type_repere',
            cibleId: id,
          },
          transaction,
        );
      }),
    );
  }

  async ordonnerTypes(auteurId: string, ids: string[]): Promise<void> {
    const existants = await this.prisma.typeRepere.findMany({
      select: { id: true },
    });

    const manquants = existants.filter((type) => !ids.includes(type.id));

    if (manquants.length > 0 || ids.length !== existants.length) {
      throw new BadRequestException(
        'le réordonnancement doit porter sur le jeu complet',
      );
    }

    await this.prisma.$transaction(async (transaction) => {
      await Promise.all(
        ids.map((id, rang) =>
          transaction.typeRepere.update({
            where: { id },
            data: { ordre: rang },
          }),
        ),
      );

      await this.audit.tracer(
        {
          agentId: auteurId,
          action: 'carte.type_repere.ordonner',
          cibleTable: 'type_repere',
          cibleId: null,
          apres: { ids },
        },
        transaction,
      );
    });
  }

  // ───────────────────────────── Repères ─────────────────────────────

  /**
   * Les repères visibles de cet agent.
   *
   * **Un repère classé qu'il ne peut pas lire n'est pas montré muet : il est
   * absent.** Sur une carte, la position *est* le renseignement — un marqueur
   * sans libellé à l'emplacement d'un labo dirait déjà l'essentiel.
   */
  async listerReperes(
    agent: AgentCourant,
    options: { archives?: boolean } = {},
  ): Promise<RepereDto[]> {
    const reperes = await this.prisma.sansFiltre.repere.findMany({
      where: {
        AND: [
          predicatRepere(this.visibilite.contexte(agent)),
          options.archives ? {} : { etat: EtatEntite.actif },
        ],
      },
      include: { typeRepere: true },
      orderBy: { creeLe: 'asc' },
    });

    return Promise.all(reperes.map((repere) => this.presenterRepere(repere)));
  }

  async creerRepere(
    agent: AgentCourant,
    donnees: CreationRepereDto,
  ): Promise<RepereDto> {
    const type = await this.chargerType(donnees.typeRepereId);

    if (donnees.visibilite !== undefined) {
      this.visibilite.verifierDroitDeClasser(agent, donnees.visibilite);
    }

    const geometrie = this.validerGeometrie(type.nature, donnees.geometrie);

    const cree = await this.prisma.$transaction(async (transaction) => {
      const repere = await transaction.repere.create({
        data: {
          typeRepereId: type.id,
          geometrie,
          libelle: donnees.libelle,
          note: donnees.note,
          couleur: donnees.couleur,
          opacite: donnees.opacite,
          visibilite: donnees.visibilite,
          creePar: agent.id,
          modifiePar: agent.id,
        },
        include: { typeRepere: true },
      });

      await this.audit.tracer(
        {
          agentId: agent.id,
          action: 'carte.repere.creer',
          cibleTable: 'repere',
          cibleId: repere.id,
          apres: { libelle: repere.libelle, type: type.code },
        },
        transaction,
      );

      return repere;
    });

    return this.presenterRepere(cree);
  }

  async modifierRepere(
    agent: AgentCourant,
    id: string,
    donnees: ModificationRepereDto,
  ): Promise<RepereDto> {
    const avant = await this.repereVisibleOuIntrouvable(agent, id);

    if (donnees.visibilite !== undefined) {
      this.visibilite.verifierDroitDeClasser(agent, donnees.visibilite);
    }

    const geometrie =
      donnees.geometrie === undefined
        ? undefined
        : this.validerGeometrie(avant.typeRepere.nature, donnees.geometrie);

    const apres = await this.prisma.$transaction(async (transaction) => {
      const repere = await transaction.repere.update({
        where: { id },
        data: {
          ...(geometrie !== undefined && { geometrie }),
          libelle: donnees.libelle,
          note: donnees.note,
          couleur: donnees.couleur,
          opacite: donnees.opacite,
          visibilite: donnees.visibilite,
          modifiePar: agent.id,
        },
        include: { typeRepere: true },
      });

      await this.audit.tracer(
        {
          agentId: agent.id,
          action: 'carte.repere.modifier',
          cibleTable: 'repere',
          cibleId: id,
          avant: { libelle: avant.libelle, visibilite: avant.visibilite },
          apres: { libelle: repere.libelle, visibilite: repere.visibilite },
        },
        transaction,
      );

      return repere;
    });

    return this.presenterRepere(apres);
  }

  /**
   * Retrait d'un repère — **archivage, jamais suppression**.
   *
   * Le repère quitte la carte et reste en base : ce qu'on a cru savoir d'un
   * terrain fait partie de l'enquête, même quand on cesse d'y croire.
   */
  async changerEtat(
    agent: AgentCourant,
    id: string,
    etat: EtatEntite,
  ): Promise<RepereDto> {
    const avant = await this.repereVisibleOuIntrouvable(agent, id);

    if (avant.etat === etat) {
      throw new ConflictException(
        etat === EtatEntite.archive ? 'déjà archivé' : 'déjà actif',
      );
    }

    const apres = await this.prisma.$transaction(async (transaction) => {
      const repere = await transaction.repere.update({
        where: { id },
        data: {
          etat,
          archiveLe: etat === EtatEntite.archive ? new Date() : null,
          modifiePar: agent.id,
        },
        include: { typeRepere: true },
      });

      await this.audit.tracer(
        {
          agentId: agent.id,
          action:
            etat === EtatEntite.archive
              ? 'carte.repere.archiver'
              : 'carte.repere.desarchiver',
          cibleTable: 'repere',
          cibleId: id,
          avant: { etat: avant.etat },
          apres: { etat: repere.etat },
        },
        transaction,
      );

      return repere;
    });

    return this.presenterRepere(apres);
  }

  async habiliter(
    agent: AgentCourant,
    id: string,
    agentHabiliteId: string,
  ): Promise<void> {
    const repere = await this.repereVisibleOuIntrouvable(agent, id);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.habilitationRepere.upsert({
        where: {
          repereId_agentId: { repereId: repere.id, agentId: agentHabiliteId },
        },
        create: {
          repereId: repere.id,
          agentId: agentHabiliteId,
          accordePar: agent.id,
        },
        update: {},
      });

      await this.audit.tracer(
        {
          agentId: agent.id,
          action: 'carte.repere.habiliter',
          cibleTable: 'habilitation_repere',
          cibleId: repere.id,
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
    const repere = await this.repereVisibleOuIntrouvable(agent, id);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.habilitationRepere.deleteMany({
        where: { repereId: repere.id, agentId: agentHabiliteId },
      });

      await this.audit.tracer(
        {
          agentId: agent.id,
          action: 'carte.repere.retirer_habilitation',
          cibleTable: 'habilitation_repere',
          cibleId: repere.id,
          avant: { agentHabilite: agentHabiliteId },
        },
        transaction,
      );
    });
  }

  // ─────────────────── Points venus des fiches ───────────────────

  /**
   * Tous les points portés par un champ de type carte.
   *
   * Filtrés par `predicatFait` : un point est un fait, et il suit exactement la
   * même règle des gardiens que le reste. Rien de particulier à écrire ici, et
   * c'est le but — la règle ne vit qu'à un endroit.
   */
  async pointsDesDonnees(agent: AgentCourant): Promise<PointDeDonneeDto[]> {
    const faits = await this.prisma.sansFiltre.fait.findMany({
      where: {
        AND: [
          predicatFait(this.visibilite.contexte(agent)),
          { etat: 'actif' },
          { definitionChamp: { typeDonnee: TypeDonnee.carte } },
          { sujet: { etat: EtatEntite.actif } },
        ],
      },
      include: {
        definitionChamp: true,
        sujet: { include: { typeEntite: true } },
      },
    });

    // Une seule lecture du catalogue pour toute la carte : résoudre le type
    // point par point ferait une requête par fiche posée.
    const types = new Map(
      (await this.prisma.typeRepere.findMany()).map((type) => [type.id, type]),
    );

    return faits.flatMap((fait) => {
      const point = this.lirePoint(fait.valeur);

      if (!point || !fait.definitionChamp || !fait.sujet) {
        return [];
      }

      const marque = this.lireMarque(fait.valeur);
      const type = marque.typeRepereId
        ? types.get(marque.typeRepereId)
        : undefined;

      return [
        {
          entiteId: fait.sujetId,
          entiteLibelle: fait.sujet.libelle,
          typeEntiteCode: fait.sujet.typeEntite.code,
          // Le type de repère quand il y en a un ; sinon le type de donnée,
          // qui est ce que les points posés avant ce choix portaient déjà.
          icone: type?.icone ?? fait.sujet.typeEntite.icone,
          couleur: marque.couleur ?? ACCENT,
          typeRepereId: type?.id ?? null,
          typeRepereLibelle: type?.libelle ?? null,
          champLibelle: fait.definitionChamp.libelle,
          point,
          fiabilite: fait.fiabilite,
          visibilite: fait.visibiliteEffective,
        },
      ];
    });
  }

  // ─────────────────────────── Interne ───────────────────────────

  /**
   * La géométrie correspond-elle à la nature du type ?
   *
   * Un seul endroit, comme la validation d'un fait : la forme dépend d'une
   * donnée connue à l'exécution, aucun décorateur ne peut la tenir.
   */
  private validerGeometrie(
    nature: NatureRepere,
    valeur: unknown,
  ): Prisma.InputJsonValue {
    if (
      typeof valeur !== 'object' ||
      valeur === null ||
      Array.isArray(valeur)
    ) {
      return this.refus('géométrie attendue');
    }

    const forme = valeur as {
      type?: unknown;
      a?: unknown;
      b?: unknown;
      centre?: unknown;
      rayon?: unknown;
    };

    if (nature === NatureRepere.point) {
      if (forme.type !== 'point') {
        return this.refus('ce type de repère attend un point');
      }

      const point = this.lirePoint(valeur);

      if (!point) {
        return this.refus(
          'point invalide — deux coordonnées entre 0 et 1 sont attendues',
        );
      }

      return { type: 'point', x: point.x, y: point.y };
    }

    if (forme.type === 'rectangle') {
      const a = this.lirePoint(forme.a);
      const b = this.lirePoint(forme.b);

      if (!a || !b) {
        return this.refus(
          'rectangle invalide — deux coins entre 0 et 1 sont attendus',
        );
      }

      // Rangés à l'écriture, une fois pour toutes : `a` est le coin haut
      // gauche. Sans ce tri, chaque lecteur devrait redécouvrir quel coin il
      // tient, et le premier qui l'oublierait dessinerait une zone à l'envers.
      const coinA = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
      const coinB = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };

      if (coinA.x === coinB.x || coinA.y === coinB.y) {
        return this.refus('rectangle sans surface');
      }

      return { type: 'rectangle', a: coinA, b: coinB };
    }

    if (forme.type === 'cercle') {
      const centre = this.lirePoint(forme.centre);

      if (!centre) {
        return this.refus(
          'cercle invalide — un centre entre 0 et 1 est attendu',
        );
      }

      const { rayon } = forme;

      if (
        typeof rayon !== 'number' ||
        !Number.isFinite(rayon) ||
        rayon <= 0 ||
        rayon > 1
      ) {
        return this.refus(
          'rayon attendu, strictement au-dessus de 0 et au plus 1',
        );
      }

      return { type: 'cercle', centre: { x: centre.x, y: centre.y }, rayon };
    }

    return this.refus(
      'ce type de repère attend une zone — un rectangle ou un cercle',
    );
  }

  private refus(probleme: string): never {
    throw new BadRequestException(probleme);
  }

  private lirePoint(valeur: unknown): Point | null {
    if (typeof valeur !== 'object' || valeur === null) {
      return null;
    }

    const { x, y } = valeur as { x?: unknown; y?: unknown };

    if (typeof x !== 'number' || typeof y !== 'number') {
      return null;
    }

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    if (x < 0 || x > 1 || y < 0 || y > 1) {
      return null;
    }

    return { x, y };
  }

  /**
   * Ce que le point d'une fiche porte en plus de ses coordonnées.
   *
   * Rien n'est exigé : les points posés avant que le type et la couleur
   * existent restent lisibles, et se complètent à la première correction.
   */
  private lireMarque(valeur: unknown): {
    typeRepereId: string | null;
    couleur: string | null;
  } {
    if (typeof valeur !== 'object' || valeur === null) {
      return { typeRepereId: null, couleur: null };
    }

    const { typeRepereId, couleur } = valeur as {
      typeRepereId?: unknown;
      couleur?: unknown;
    };

    return {
      typeRepereId: typeof typeRepereId === 'string' ? typeRepereId : null,
      couleur: typeof couleur === 'string' ? couleur : null,
    };
  }

  /**
   * Un type de repère encore cité par une fiche ne se supprime pas.
   *
   * `Repere.typeRepereId` est une vraie clé étrangère, et la base refuse déjà
   * pour elle. Le point d'une fiche, lui, vit dans du `jsonb` : aucune clé
   * étrangère ne peut le tenir, et sans cette vérification la suppression
   * passerait en laissant des points orphelins de leur type.
   *
   * On compte **tous** les faits, y compris infirmés et archivés : un point
   * qu'on a cessé de croire reste à relire dans l'historique.
   */
  private async verifierTypeNonCite(id: string): Promise<void> {
    const cites = await this.prisma.sansFiltre.fait.count({
      where: {
        definitionChamp: { typeDonnee: TypeDonnee.carte },
        valeur: { path: ['typeRepereId'], equals: id },
      },
    });

    if (cites > 0) {
      throw new ConflictException(
        `encore utilisé par ${cites} point${cites > 1 ? 's' : ''} de fiche`,
      );
    }
  }

  /**
   * Le 404 plutôt que le 403, comme partout ailleurs.
   *
   * Répondre « interdit » sur un repère classé confirmerait qu'il existe, donc
   * qu'il se passe quelque chose à cet endroit du plan.
   */
  private async repereVisibleOuIntrouvable(
    agent: AgentCourant,
    id: string,
  ): Promise<RepereComplet> {
    const repere = await this.prisma.sansFiltre.repere.findFirst({
      where: {
        AND: [{ id }, predicatRepere(this.visibilite.contexte(agent))],
      },
      include: { typeRepere: true },
    });

    if (!repere) {
      throw new NotFoundException('repère inconnu');
    }

    return repere;
  }

  private async chargerType(id: string): Promise<TypeRepere> {
    const type = await this.prisma.typeRepere.findUnique({ where: { id } });

    if (!type) {
      throw new NotFoundException('type de repère inconnu');
    }

    return type;
  }

  private presenterType(type: TypeRepere): TypeRepereDto {
    return {
      id: type.id,
      code: type.code,
      libelle: type.libelle,
      nature: type.nature,
      icone: type.icone,
      ordre: type.ordre,
    };
  }

  private async presenterRepere(repere: RepereComplet): Promise<RepereDto> {
    const [auteur, habilitations] = await Promise.all([
      this.prisma.sansFiltre.agent.findUnique({
        where: { id: repere.creePar },
      }),
      this.prisma.sansFiltre.habilitationRepere.findMany({
        where: { repereId: repere.id },
        include: { agent: true },
        orderBy: { accordeLe: 'asc' },
      }),
    ]);

    return {
      id: repere.id,
      typeRepereId: repere.typeRepereId,
      typeRepereCode: repere.typeRepere.code,
      typeRepereLibelle: repere.typeRepere.libelle,
      nature: repere.typeRepere.nature,
      icone: repere.typeRepere.icone,
      couleur: repere.couleur,
      opacite: repere.opacite,
      geometrie: repere.geometrie,
      libelle: repere.libelle,
      note: repere.note,
      visibilite: repere.visibilite,
      etat: repere.etat,
      auteurLibelle:
        !auteur || auteur.anonymise
          ? 'agent supprimé'
          : `${auteur.prenom} ${auteur.nom}`,
      creeLe: repere.creeLe.toISOString(),
      modifieLe: repere.modifieLe.toISOString(),
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

  /** Même traduction des refus de la base que le référentiel. */
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
            'type encore utilisé — des repères en dépendent',
          );
        }
      }

      throw erreur;
    }
  }
}
