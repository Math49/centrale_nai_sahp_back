import { PrismaClient } from '@prisma/client';

import type { ContexteVisibilite } from './contexte-visibilite';
import { predicatDossier, predicatEntite, predicatFait } from './predicats';

/**
 * Extension Prisma de filtrage — première des trois couches de défense.
 *
 * Elle injecte le prédicat de visibilité sur **chaque lecture** d'entité, de
 * fait et de dossier. Un service qui oublierait de filtrer obtient quand même
 * un résultat filtré : c'est tout l'intérêt de le faire ici plutôt que dans
 * chaque requête.
 *
 * Le contournement existe, mais il porte un nom qui se remarque en revue :
 * `prisma.sansFiltre`. Il est réservé à l'administration et au chargement du
 * graphe, qui contient tout mais n'est jamais servi brut.
 */

type Where = Record<string, unknown> | undefined;

function fusionner(where: Where, predicat: object): Record<string, unknown> {
  // Un prédicat vide signifie « aucune restriction » : ne pas alourdir la
  // requête d'un AND inutile.
  if (Object.keys(predicat).length === 0) {
    return where ?? {};
  }

  return where === undefined ? { ...predicat } : { AND: [where, predicat] };
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */

/**
 * Les signatures des opérations Prisma diffèrent d'un modèle à l'autre et d'une
 * opération à l'autre ; l'extension les traite uniformément. Les `any` sont
 * cantonnés à ce fichier, dont le seul rôle est de recopier `args` en y
 * ajoutant un `where`.
 */
function lectures(
  modele: any,
  predicat: object,
): Record<string, (arguments_: any) => unknown> {
  return {
    findMany: ({ args, query }: any) =>
      query({ ...args, where: fusionner(args?.where, predicat) }),

    findFirst: ({ args, query }: any) =>
      query({ ...args, where: fusionner(args?.where, predicat) }),

    findFirstOrThrow: ({ args, query }: any) =>
      query({ ...args, where: fusionner(args?.where, predicat) }),

    count: ({ args, query }: any) =>
      query({ ...args, where: fusionner(args?.where, predicat) }),

    aggregate: ({ args, query }: any) =>
      query({ ...args, where: fusionner(args?.where, predicat) }),

    // `findUnique` n'accepte qu'un identifiant unique dans son `where` : on ne
    // peut pas y ajouter de prédicat. On le rejoue donc en `findFirst` sur le
    // client non étendu, ce qui applique le filtre sans risquer de récursion.
    findUnique: ({ args }: any) =>
      modele.findFirst({ ...args, where: fusionner(args?.where, predicat) }),

    findUniqueOrThrow: ({ args }: any) =>
      modele.findFirstOrThrow({
        ...args,
        where: fusionner(args?.where, predicat),
      }),
  };
}

export function construireClientFiltre(
  base: PrismaClient,
  contexte: ContexteVisibilite,
) {
  return base.$extends({
    name: 'visibilite',
    query: {
      entite: lectures(base.entite, predicatEntite(contexte)),
      fait: lectures(base.fait, predicatFait(contexte)),
      dossier: lectures(base.dossier, predicatDossier(contexte)),
    },
  });
}

/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */

export type ClientFiltre = ReturnType<typeof construireClientFiltre>;
