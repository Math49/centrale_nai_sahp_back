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
