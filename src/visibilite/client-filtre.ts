import { Prisma, PrismaClient } from '@prisma/client';

import type { ContexteVisibilite } from './contexte-visibilite';
import { predicatDossier, predicatEntite, predicatFait } from './predicats';

type Where = Record<string, unknown> | undefined;
type ArgumentsLecture = Record<string, unknown> & { where?: Where };
type ParametresLecture = {
  args?: ArgumentsLecture;
  query: (args: ArgumentsLecture) => unknown;
};
type ModeleLecture = {
  findFirst: (args: ArgumentsLecture) => unknown;
  findFirstOrThrow: (args: ArgumentsLecture) => unknown;
};

function modeleLecture<Args>(
  findFirst: (args: Args) => unknown,
  findFirstOrThrow: (args: Args) => unknown,
): ModeleLecture {
  return {
    findFirst: (args) => findFirst(args as Args),
    findFirstOrThrow: (args) => findFirstOrThrow(args as Args),
  };
}

function fusionner(where: Where, predicat: object): Record<string, unknown> {
  if (Object.keys(predicat).length === 0) {
    return where ?? {};
  }

  return where === undefined ? { ...predicat } : { AND: [where, predicat] };
}

function lectures(
  modele: ModeleLecture,
  predicat: object,
): Record<string, (arguments_: ParametresLecture) => unknown> {
  return {
    findMany: ({ args, query }) =>
      query({ ...(args ?? {}), where: fusionner(args?.where, predicat) }),

    findFirst: ({ args, query }) =>
      query({ ...(args ?? {}), where: fusionner(args?.where, predicat) }),

    findFirstOrThrow: ({ args, query }) =>
      query({ ...(args ?? {}), where: fusionner(args?.where, predicat) }),

    count: ({ args, query }) =>
      query({ ...(args ?? {}), where: fusionner(args?.where, predicat) }),

    aggregate: ({ args, query }) =>
      query({ ...(args ?? {}), where: fusionner(args?.where, predicat) }),

    findUnique: ({ args }) =>
      modele.findFirst({
        ...(args ?? {}),
        where: fusionner(args?.where, predicat),
      }),

    findUniqueOrThrow: ({ args }) =>
      modele.findFirstOrThrow({
        ...(args ?? {}),
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
      entite: lectures(
        modeleLecture<Prisma.EntiteFindFirstArgs>(
          (args) => base.entite.findFirst(args),
          (args) => base.entite.findFirstOrThrow(args),
        ),
        predicatEntite(contexte),
      ),
      fait: lectures(
        modeleLecture<Prisma.FaitFindFirstArgs>(
          (args) => base.fait.findFirst(args),
          (args) => base.fait.findFirstOrThrow(args),
        ),
        predicatFait(contexte),
      ),
      dossier: lectures(
        modeleLecture<Prisma.DossierFindFirstArgs>(
          (args) => base.dossier.findFirst(args),
          (args) => base.dossier.findFirstOrThrow(args),
        ),
        predicatDossier(contexte),
      ),
    },
  });
}

export type ClientFiltre = ReturnType<typeof construireClientFiltre>;
