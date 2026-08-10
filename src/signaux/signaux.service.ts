import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EtatEntite, EtatFait, NatureFait } from '@prisma/client';

import type { AgentCourant } from '../auth/agent-courant';
import type { Environnement } from '../config/environnement';
import { GrapheService } from '../graphe/graphe.service';
import { VisibiliteService } from '../visibilite/visibilite.service';
import type {
  ActiviteDto,
  DossierDeLAgentDto,
  ResultatRechercheDto,
  SignalDto,
} from './signaux.dto';

/** Le niveau « à confirmer », seul concerné par le vieillissement. */
const A_CONFIRMER = 2;

const JOUR = 24 * 60 * 60 * 1000;

/**
 * Signaux de l'accueil.
 *
 * **Calculés après application des règles de visibilité**, jamais avant : un
 * agent ne voit jamais un signal portant sur un objet auquel il n'a pas accès.
 * C'est le cinquième des six vecteurs de fuite par déduction, et le plus facile
 * à commettre — un signal est un raccourci vers une information, et un raccourci
 * vers ce qu'on ne devrait pas voir en révèle l'existence.
 */
@Injectable()
export class SignauxService {
  constructor(
    private readonly visibilite: VisibiliteService,
    private readonly graphe: GrapheService,
    private readonly configuration: ConfigService<Environnement, true>,
  ) {}

  async signaux(agent: AgentCourant): Promise<SignalDto[]> {
    const [recoupements, recurrences, vieillissements] = await Promise.all([
      this.recoupements(agent),
      this.recurrences(agent),
      this.vieillissements(agent),
    ]);

    return [...recoupements, ...recurrences, ...vieillissements];
  }

  /**
   * Recoupement : une entité est suivie par plusieurs dossiers **sans lien
   * direct entre leurs entités pivots**.
   *
   * La réserve compte autant que la règle : si les pivots sont déjà reliés, le
   * rapprochement est connu, et le signaler ne dirait rien de neuf.
   *
   * On part des dossiers dont le **contenu** est lisible, et non de ceux dont
   * l'existence l'est : un dossier restreint affiche son nom mais garde son
   * suivi fermé. Le lire ici dirait qui il surveille.
   */
  private async recoupements(agent: AgentCourant): Promise<SignalDto[]> {
    const client = this.visibilite.clientPour(agent);

    const dossiers = await client.dossier.findMany({
      where: { etat: EtatEntite.actif },
      select: {
        id: true,
        nom: true,
        visibilite: true,
        entitePivotId: true,
        suivis: { select: { entiteId: true } },
      },
    });

    const lisibles = dossiers.filter((dossier) =>
      this.visibilite.contenuDeDossierLisible(agent, dossier),
    );

    /** entité suivie → dossiers qui la suivent. */
    const suivie = new Map<string, typeof lisibles>();

    for (const dossier of lisibles) {
      for (const suivi of dossier.suivis) {
        const deja = suivie.get(suivi.entiteId) ?? [];
        deja.push(dossier);
        suivie.set(suivi.entiteId, deja);
      }
    }

    const candidates = [...suivie.entries()].filter(
      ([, dossiersQuiSuivent]) => dossiersQuiSuivent.length >= 2,
    );

    if (candidates.length === 0) {
      return [];
    }

    // Le client filtré écarte de lui-même les entités que l'agent ne voit pas.
    const entites = await client.entite.findMany({
      where: {
        id: { in: candidates.map(([entiteId]) => entiteId) },
        etat: EtatEntite.actif,
        fusionneeVersId: null,
      },
      include: { typeEntite: { select: { code: true } } },
    });

    const pivots = [
      ...new Set(lisibles.map((dossier) => dossier.entitePivotId)),
    ];
    const voisinages = await this.graphe.voisinsDirects(agent, pivots);

    const signaux: SignalDto[] = [];

    for (const entite of entites) {
      const dossiersQuiSuivent = suivie.get(entite.id)!;

      if (this.pivotsDejaRelies(dossiersQuiSuivent, voisinages)) {
        continue;
      }

      signaux.push({
        id: `recoupement:${entite.id}`,
        famille: 'recoupement',
        entiteId: entite.id,
        entiteLibelle: entite.libelle,
        typeCode: entite.typeEntite.code,
        resume: `${entite.libelle} apparaît dans ${dossiersQuiSuivent.length} dossiers sans rapport connu`,
        detail: dossiersQuiSuivent.map((dossier) => dossier.nom).join(' · '),
        faitId: null,
      });
    }

    return signaux;
  }

  /** Un lien direct entre deux pivots suffit à rendre le recoupement banal. */
  private pivotsDejaRelies(
    dossiers: readonly { entitePivotId: string }[],
    voisinages: Map<string, Set<string>>,
  ): boolean {
    for (let premier = 0; premier < dossiers.length; premier += 1) {
      for (let second = premier + 1; second < dossiers.length; second += 1) {
        const a = dossiers[premier].entitePivotId;
        const b = dossiers[second].entitePivotId;

        if (a === b || voisinages.get(a)?.has(b)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Récurrence : une entité relie des entités suivies par des dossiers
   * différents. Le graphe la calcule déjà, sur la vue élaguée de cet agent.
   */
  private async recurrences(agent: AgentCourant): Promise<SignalDto[]> {
    const recurrentes = await this.graphe.recurrences(agent);

    if (recurrentes.size === 0) {
      return [];
    }

    const entites = await this.visibilite.clientPour(agent).entite.findMany({
      where: { id: { in: [...recurrentes] }, etat: EtatEntite.actif },
      include: { typeEntite: { select: { code: true } } },
    });

    return entites.map((entite) => ({
      id: `recurrence:${entite.id}`,
      famille: 'recurrence' as const,
      entiteId: entite.id,
      entiteLibelle: entite.libelle,
      typeCode: entite.typeEntite.code,
      resume: `${entite.libelle} relie des entités suivies par des dossiers différents`,
      detail: 'Le rapprochement tombe seul, par le graphe.',
      faitId: null,
    }));
  }

  /**
   * Vieillissement : un fait « à confirmer » non revu au-delà du délai.
   *
   * « Revu » se lit sur `modifie_le` : reprendre un fait, ne serait-ce que pour
   * en corriger la source, suffit à le sortir du signal. C'est exactement le
   * geste que le signal appelle.
   */
  private async vieillissements(agent: AgentCourant): Promise<SignalDto[]> {
    const jours = this.configuration.get('VIEILLISSEMENT_JOURS', {
      infer: true,
    });

    const limite = new Date(Date.now() - jours * JOUR);

    const faits = await this.visibilite.clientPour(agent).fait.findMany({
      where: {
        etat: EtatFait.actif,
        fiabilite: A_CONFIRMER,
        modifieLe: { lt: limite },
      },
      include: {
        sujet: { include: { typeEntite: { select: { code: true } } } },
        definitionChamp: { select: { libelle: true } },
        typeLien: { select: { libelle: true } },
      },
      orderBy: { modifieLe: 'asc' },
      take: 50,
    });

    return faits.map((fait) => {
      const age = Math.floor((Date.now() - fait.modifieLe.getTime()) / JOUR);

      const quoi =
        fait.nature === NatureFait.champ
          ? (fait.definitionChamp?.libelle ?? 'un champ')
          : (fait.typeLien?.libelle ?? 'un lien');

      return {
        id: `vieillissement:${fait.id}`,
        famille: 'vieillissement' as const,
        entiteId: fait.sujetId,
        entiteLibelle: fait.sujet.libelle,
        typeCode: fait.sujet.typeEntite.code,
        resume: `${quoi} — ${fait.sujet.libelle} : à confirmer depuis ${age} jours`,
        detail: `Source — ${fait.source}`,
        faitId: fait.id,
      };
    });
  }

  /**
   * « Mes dossiers » : ceux que l'agent a ouverts, et ceux où il est nommément
   * habilité. Les deux motifs se distinguent à l'affichage.
   */
  async mesDossiers(agent: AgentCourant): Promise<DossierDeLAgentDto[]> {
    const dossiers = await this.visibilite.clientPour(agent).dossier.findMany({
      where: {
        etat: EtatEntite.actif,
        OR: [
          { creePar: agent.id },
          { habilitations: { some: { agentId: agent.id } } },
        ],
      },
      include: { entitePivot: { select: { libelle: true } } },
      orderBy: { creeLe: 'desc' },
    });

    return dossiers.map((dossier) => ({
      id: dossier.id,
      nom: dossier.nom,
      visibilite: dossier.visibilite,
      entitePivotId: dossier.entitePivotId,
      entitePivotLibelle: dossier.entitePivot.libelle,
      motif:
        dossier.creePar === agent.id
          ? ('creation' as const)
          : ('habilitation' as const),
    }));
  }

  /** Dernière activité : les faits récemment saisis, filtrés comme le reste. */
  async derniereActivite(agent: AgentCourant): Promise<ActiviteDto[]> {
    const faits = await this.visibilite.clientPour(agent).fait.findMany({
      where: { etat: EtatFait.actif },
      include: {
        sujet: { select: { libelle: true } },
        cible: { select: { libelle: true } },
        definitionChamp: { select: { libelle: true } },
        typeLien: { select: { libelle: true } },
        auteur: { select: { prenom: true, nom: true, anonymise: true } },
      },
      orderBy: { creeLe: 'desc' },
      take: 15,
    });

    return faits.map((fait) => ({
      faitId: fait.id,
      entiteId: fait.sujetId,
      entiteLibelle: fait.sujet.libelle,
      resume:
        fait.nature === NatureFait.champ
          ? `${fait.definitionChamp?.libelle ?? 'champ'} renseigné`
          : `${fait.typeLien?.libelle ?? 'lien'} ${fait.cible?.libelle ?? ''}`.trim(),
      source: fait.source,
      fiabilite: fait.fiabilite,
      auteur: fait.auteur.anonymise
        ? null
        : `${fait.auteur.prenom} ${fait.auteur.nom}`,
      survenuLe: fait.creeLe.toISOString(),
    }));
  }

  /**
   * Recherche globale.
   *
   * Les objets privés en sont **absents, sans mention** : un décompte qui ne
   * tombe pas juste est déjà une information.
   */
  async rechercher(
    agent: AgentCourant,
    q: string,
  ): Promise<ResultatRechercheDto[]> {
    const recherche = q.trim();

    if (recherche.length < 2) {
      return [];
    }

    const client = this.visibilite.clientPour(agent);

    const [entites, dossiers] = await Promise.all([
      client.entite.findMany({
        where: {
          libelle: { contains: recherche, mode: 'insensitive' },
          etat: EtatEntite.actif,
          fusionneeVersId: null,
        },
        include: { typeEntite: { select: { code: true } } },
        orderBy: { libelle: 'asc' },
        take: 10,
      }),
      client.dossier.findMany({
        where: {
          nom: { contains: recherche, mode: 'insensitive' },
          etat: EtatEntite.actif,
        },
        orderBy: { nom: 'asc' },
        take: 5,
      }),
    ]);

    return [
      ...entites.map((entite) => ({
        id: entite.id,
        libelle: entite.libelle,
        nature: 'entite' as const,
        typeCode: entite.typeEntite.code,
        visibilite: entite.visibilite,
      })),
      ...dossiers.map((dossier) => ({
        id: dossier.id,
        libelle: dossier.nom,
        nature: 'dossier' as const,
        typeCode: null,
        visibilite: dossier.visibilite,
      })),
    ];
  }
}
