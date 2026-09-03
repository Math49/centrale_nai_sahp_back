import { Prisma, Visibilite } from '@prisma/client';

import { niveauxOuverts, type ContexteVisibilite } from './contexte-visibilite';

const TOUT: Record<string, never> = {};

function estOuvert(contexte: ContexteVisibilite): boolean {
  return contexte.superAdmin || contexte.derogationPrive;
}

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
 * Repères de la carte.
 *
 * **Une différence assumée avec les dossiers, et il faut la nommer** : un
 * dossier restreint montre son nom et tait son contenu. Un repère restreint est
 * *absent de la carte*, entièrement. Montrer un marqueur muet à l'emplacement
 * d'un labo révélerait exactement ce qu'on protège — sur une carte, **la
 * position est le renseignement**, pas le libellé.
 *
 * D'où un prédicat calqué sur celui des entités, sans étage « contenu
 * lisible » : soit le repère est visible, soit il n'existe pas pour cet agent.
 *
 * Les niveaux ouverts suivent les dérogations, comme partout : `niveauxOuverts`
 * plutôt que le seul « pas privé » des entités, parce qu'un repère restreint
 * doit déjà disparaître pour qui n'a rien.
 */
export function predicatRepere(
  contexte: ContexteVisibilite,
): Prisma.RepereWhereInput {
  if (estOuvert(contexte)) {
    return TOUT;
  }

  return {
    OR: [
      { visibilite: { in: niveauxOuverts(contexte) } },
      { id: { in: [...contexte.reperesHabilites] } },
    ],
  };
}

/**
 * Cartes d'enquête.
 *
 * Même règle que les repères, et pour une raison voisine : le titre d'une carte
 * nomme souvent ce qu'un dossier restreint protège. Une carte classée hors de
 * portée n'apparaît donc pas sur le tableau, plutôt que d'y figurer anonyme —
 * une colonne « surveillance » qui compterait une carte sans titre dirait déjà
 * qu'il se passe quelque chose.
 *
 * **L'assignation ne figure pas ici, et c'est délibéré.** Être assigné à une
 * carte dit qui travaille, pas qui a le droit de lire : la faire ouvrir l'accès
 * en ferait une porte dérobée dans le moteur de visibilité.
 */
export function predicatCarteEnquete(
  contexte: ContexteVisibilite,
): Prisma.CarteEnqueteWhereInput {
  if (estOuvert(contexte)) {
    return TOUT;
  }

  return {
    OR: [
      { visibilite: { in: niveauxOuverts(contexte) } },
      { id: { in: [...contexte.cartesHabilitees] } },
    ],
  };
}

export function predicatFait(
  contexte: ContexteVisibilite,
): Prisma.FaitWhereInput {
  if (estOuvert(contexte)) {
    return TOUT;
  }

  const ouverts = niveauxOuverts(contexte);

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

export interface Gardien {
  niveau: Visibilite;

  habilite: boolean;
}

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
