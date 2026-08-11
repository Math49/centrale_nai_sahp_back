import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PERMISSIONS, type Permission } from '../agents/permissions';
import type { AgentCourant } from './agent-courant';
import {
  CLE_PERMISSIONS,
  CLE_PUBLIQUE,
  CLE_SANS_PERMISSION,
} from './decorateurs';
import { GardePermission } from './garde-permission';

type Metadonnees = Partial<{
  [CLE_PUBLIQUE]: boolean;
  [CLE_SANS_PERMISSION]: boolean;
  [CLE_PERMISSIONS]: Permission[];
}>;

function construire(
  metadonnees: Metadonnees,
  agent?: Partial<AgentCourant>,
): [GardePermission, ExecutionContext] {
  const reflector = {
    getAllAndOverride: (cle: string) =>
      (metadonnees as Record<string, unknown>)[cle],
  } as unknown as Reflector;

  const contexte = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => (agent ? { agent } : {}),
    }),
  } as unknown as ExecutionContext;

  return [new GardePermission(reflector), contexte];
}

const enqueteur: Partial<AgentCourant> = {
  superAdmin: false,
  permissions: [PERMISSIONS.ENTITE_CREER, PERMISSIONS.FAIT_CREER],
};

describe('GardePermission', () => {
  describe('refus par défaut', () => {
    it('refuse une route sans aucun décorateur', () => {
      const [garde, contexte] = construire({}, enqueteur);

      expect(() => garde.canActivate(contexte)).toThrow(ForbiddenException);
      expect(() => garde.canActivate(contexte)).toThrow(/refusée par défaut/);
    });

    it('refuse une route décorée avec une liste de permissions vide', () => {
      const [garde, contexte] = construire(
        { [CLE_PERMISSIONS]: [] },
        enqueteur,
      );

      expect(() => garde.canActivate(contexte)).toThrow(ForbiddenException);
    });

    it('refuse même un super-admin sur une route non décorée', () => {
      const [garde, contexte] = construire(
        {},
        {
          superAdmin: true,
          permissions: [],
        },
      );

      expect(() => garde.canActivate(contexte)).toThrow(ForbiddenException);
    });
  });

  it('laisse passer une route publique', () => {
    const [garde, contexte] = construire({ [CLE_PUBLIQUE]: true });

    expect(garde.canActivate(contexte)).toBe(true);
  });

  it('laisse passer une route explicitement sans permission', () => {
    const [garde, contexte] = construire(
      { [CLE_SANS_PERMISSION]: true },
      enqueteur,
    );

    expect(garde.canActivate(contexte)).toBe(true);
  });

  it('laisse passer quand la permission est détenue', () => {
    const [garde, contexte] = construire(
      { [CLE_PERMISSIONS]: [PERMISSIONS.ENTITE_CREER] },
      enqueteur,
    );

    expect(garde.canActivate(contexte)).toBe(true);
  });

  it('refuse quand la permission manque', () => {
    const [garde, contexte] = construire(
      { [CLE_PERMISSIONS]: [PERMISSIONS.AGENT_ANONYMISER] },
      enqueteur,
    );

    expect(() => garde.canActivate(contexte)).toThrow(/agent\.anonymiser/);
  });

  it('exige toutes les permissions listées, pas une seule', () => {
    const [garde, contexte] = construire(
      {
        [CLE_PERMISSIONS]: [
          PERMISSIONS.ENTITE_CREER,
          PERMISSIONS.ENTITE_FUSIONNER,
        ],
      },
      enqueteur,
    );

    expect(() => garde.canActivate(contexte)).toThrow(/entite\.fusionner/);
  });

  it('laisse passer un super-admin sur une route décorée', () => {
    const [garde, contexte] = construire(
      { [CLE_PERMISSIONS]: [PERMISSIONS.AGENT_ANONYMISER] },
      { superAdmin: true, permissions: [] },
    );

    expect(garde.canActivate(contexte)).toBe(true);
  });

  it("refuse quand aucun agent n'a été résolu", () => {
    const [garde, contexte] = construire({
      [CLE_PERMISSIONS]: [PERMISSIONS.ENTITE_CREER],
    });

    expect(() => garde.canActivate(contexte)).toThrow(/agent non résolu/);
  });
});
