import { Prisma, Visibilite } from '@prisma/client';

import { niveauxOuverts, type ContexteVisibilite } from './contexte-visibilite';

/**
 * Prédicats de visibilité, injectés sur chaque lecture.
 *
 * Fonctions pures : elles ne touchent pas la base, ce qui les rend testables
 * une par une. C'est le seul endroit où la règle des gardiens s'écrit — la
 * réimplémenter ailleurs signifierait deux vérités à maintenir.
 */

/** Aucune restriction : l'agent voit tout. */
const TOUT: Record<string, never> = {};

function estOuvert(contexte: ContexteVisibilite): boolean {
  return contexte.superAdmin || contexte.derogationPrive;
}

/**
 * Une entité ne porte que sa visibilité propre : l'appartenance à un dossier ne
 * la restreint pas. Seul le niveau privé la fait disparaître.
 */
export function predicatEntite(
  contexte: ContexteVisibilite,
): Prisma.EntiteWhereInput {
  if (estOuvert(contexte)) {
    return TOUT;
  }

  return {
    OR: [
      { visibilite: { not: Visibilite.prive } },
      { id: { in: [...contexte.entitesHabilitees] } },
    ],
  };
}

/** Même règle pour un dossier : visible sauf s'il est privé. */
export function predicatDossier(
  contexte: ContexteVisibilite,
): Prisma.DossierWhereInput {
  if (estOuvert(contexte)) {
    return TOUT;
  }

  return {
    OR: [
      { visibilite: { not: Visibilite.prive } },
      { id: { in: [...contexte.dossiersHabilites] } },
    ],
  };
}

/**
 * Règle des gardiens.
 *
 * Les gardiens d'un fait sont, parmi {le fait, son dossier de saisie, son
 * sujet, sa cible}, ceux dont le niveau est restreint ou privé. L'accès au
 * contenu exige d'être habilité auprès de **tous** — d'où le `AND`.
 *
 * N'exiger qu'un seul gardien créerait une fuite : être habilité sur le dossier
 * Madrina donnerait accès à un fait pointant vers une entité privée d'une autre
 * enquête.
 *
 * `visibilite_effective` sert de raccourci : lorsqu'elle vaut `public`, les
 * quatre gardiens sont publics et la question ne se pose plus.
 */
export function predicatFait(
  contexte: ContexteVisibilite,
): Prisma.FaitWhereInput {
  if (estOuvert(contexte)) {
    return TOUT;
  }

  const ouverts = niveauxOuverts(contexte);

  // Le fait lui-même n'a pas de whitelist : aucune habilitation ne porte sur un
  // fait, seule une dérogation l'ouvre. Marquer un fait restreint revient donc
  // à le réserver à qui détient la dérogation correspondante.
  const gardienPropre: Prisma.FaitWhereInput = {
    visibilite: { in: ouverts },
  };

  const gardienDossier: Prisma.FaitWhereInput = {
    OR: [
      { dossierId: null },
      { dossier: { visibilite: { in: ouverts } } },
      { dossierId: { in: [...contexte.dossiersHabilites] } },
    ],
  };

  const gardienSujet: Prisma.FaitWhereInput = {
    OR: [
      { sujet: { visibilite: { in: ouverts } } },
      { sujetId: { in: [...contexte.entitesHabilitees] } },
    ],
  };

  const gardienCible: Prisma.FaitWhereInput = {
    OR: [
      { cibleId: null },
      { cible: { visibilite: { in: ouverts } } },
      { cibleId: { in: [...contexte.entitesHabilitees] } },
    ],
  };

  return {
    OR: [
      { visibiliteEffective: Visibilite.public },
      { AND: [gardienPropre, gardienDossier, gardienSujet, gardienCible] },
    ],
  };
}

/** Le gardien tel qu'il se présente à la décision : un niveau, et l'objet qui le porte. */
export interface Gardien {
  niveau: Visibilite;
  /** Vrai si l'agent est nommément habilité auprès de cet objet. */
  habilite: boolean;
}

/**
 * Décision hors base, sur des gardiens déjà résolus.
 *
 * Sert au garde de sortie et aux tests : la même règle, exprimée sur des
 * valeurs plutôt qu'en SQL.
 */
export function contenuAccessible(
  contexte: ContexteVisibilite,
  gardiens: readonly Gardien[],
): boolean {
  if (estOuvert(contexte)) {
    return true;
  }

  const ouverts = niveauxOuverts(contexte);

  return gardiens.every(
    (gardien) => ouverts.includes(gardien.niveau) || gardien.habilite,
  );
}

/**
 * L'objet existe-t-il pour cet agent ?
 *
 * Public et restreint : oui. Privé : non, sauf habilitation ou dérogation. Le
 * refus se traduit par un 404, jamais un 403 — un 403 confirmerait l'existence.
 */
export function objetVisible(
  contexte: ContexteVisibilite,
  niveau: Visibilite,
  habilite: boolean,
): boolean {
  if (estOuvert(contexte)) {
    return true;
  }

  return niveau !== Visibilite.prive || habilite;
}
