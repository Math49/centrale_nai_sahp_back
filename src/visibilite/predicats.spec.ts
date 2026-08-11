import { Visibilite } from '@prisma/client';

import type { ContexteVisibilite } from './contexte-visibilite';
import {
  contenuAccessible,
  objetVisible,
  predicatEntite,
  predicatFait,
  type Gardien,
} from './predicats';

const { public: PUBLIC, restreint: RESTREINT, prive: PRIVE } = Visibilite;

function contexte(
  ajustements: Partial<ContexteVisibilite> = {},
): ContexteVisibilite {
  return {
    agentId: 'agent-1',
    superAdmin: false,
    derogationRestreint: false,
    derogationPrive: false,
    dossiersHabilites: [],
    entitesHabilitees: [],
    ...ajustements,
  };
}

const enqueteur = contexte();
const etatMajor = contexte({
  derogationRestreint: true,
  derogationPrive: true,
});
const superAdmin = contexte({ superAdmin: true });

const gardien = (niveau: Visibilite, habilite = false): Gardien => ({
  niveau,
  habilite,
});

describe('règle des gardiens', () => {
  describe('contenuAccessible', () => {
    it('laisse passer quand tout est public', () => {
      expect(
        contenuAccessible(enqueteur, [gardien(PUBLIC), gardien(PUBLIC)]),
      ).toBe(true);
    });

    it('refuse un gardien restreint sans habilitation ni dérogation', () => {
      expect(contenuAccessible(enqueteur, [gardien(RESTREINT)])).toBe(false);
    });

    it('accepte un gardien restreint auprès duquel l’agent est habilité', () => {
      expect(contenuAccessible(enqueteur, [gardien(RESTREINT, true)])).toBe(
        true,
      );
    });

    it('accepte un gardien privé auprès duquel l’agent est habilité', () => {
      expect(contenuAccessible(enqueteur, [gardien(PRIVE, true)])).toBe(true);
    });

    describe('exige TOUS les gardiens, jamais un seul', () => {
      it('refuse si un seul des deux gardiens est franchi', () => {
        expect(
          contenuAccessible(enqueteur, [
            gardien(PRIVE, true),
            gardien(PRIVE, false),
          ]),
        ).toBe(false);
      });

      it('accepte quand les deux le sont', () => {
        expect(
          contenuAccessible(enqueteur, [
            gardien(PRIVE, true),
            gardien(PRIVE, true),
          ]),
        ).toBe(true);
      });

      it('refuse dès qu’un gardien sur quatre manque', () => {
        expect(
          contenuAccessible(enqueteur, [
            gardien(PUBLIC),
            gardien(PUBLIC),
            gardien(PUBLIC),
            gardien(RESTREINT),
          ]),
        ).toBe(false);
      });
    });

    describe('dérogations', () => {
      it('la dérogation restreinte ouvre le restreint', () => {
        expect(
          contenuAccessible(contexte({ derogationRestreint: true }), [
            gardien(RESTREINT),
          ]),
        ).toBe(true);
      });

      it('la dérogation restreinte n’ouvre pas le privé', () => {
        expect(
          contenuAccessible(contexte({ derogationRestreint: true }), [
            gardien(PRIVE),
          ]),
        ).toBe(false);
      });

      it('la dérogation privée ouvre aussi le restreint', () => {
        expect(
          contenuAccessible(contexte({ derogationPrive: true }), [
            gardien(RESTREINT),
            gardien(PRIVE),
          ]),
        ).toBe(true);
      });

      it('l’État-Major franchit tout', () => {
        expect(
          contenuAccessible(etatMajor, [gardien(PRIVE), gardien(RESTREINT)]),
        ).toBe(true);
      });

      it('le super-admin franchit tout', () => {
        expect(contenuAccessible(superAdmin, [gardien(PRIVE)])).toBe(true);
      });
    });
  });

  describe('objetVisible', () => {
    it.each([
      [PUBLIC, true],
      [RESTREINT, true],
      [PRIVE, false],
    ])('niveau %s sans habilitation : %s', (niveau, attendu) => {
      expect(objetVisible(enqueteur, niveau, false)).toBe(attendu);
    });

    it('un objet privé existe pour qui y est habilité', () => {
      expect(objetVisible(enqueteur, PRIVE, true)).toBe(true);
    });

    it('un objet restreint existe pour tous — c’est son contenu qui est fermé', () => {
      expect(objetVisible(enqueteur, RESTREINT, false)).toBe(true);
    });
  });
});

describe('prédicats de requête', () => {
  it('n’impose rien à un super-admin', () => {
    expect(predicatEntite(superAdmin)).toEqual({});
    expect(predicatFait(superAdmin)).toEqual({});
  });

  it('n’impose rien à qui détient la dérogation privée', () => {
    expect(predicatEntite(contexte({ derogationPrive: true }))).toEqual({});
    expect(predicatFait(contexte({ derogationPrive: true }))).toEqual({});
  });

  it('écarte les entités privées d’un enquêteur', () => {
    expect(predicatEntite(enqueteur)).toEqual({
      OR: [{ visibilite: { not: PRIVE } }, { id: { in: [] } }],
    });
  });

  it('rouvre les entités privées auprès desquelles il est habilité', () => {
    const predicat = predicatEntite(
      contexte({ entitesHabilitees: ['entite-secrete'] }),
    );

    expect(predicat).toEqual({
      OR: [{ visibilite: { not: PRIVE } }, { id: { in: ['entite-secrete'] } }],
    });
  });

  describe('predicatFait', () => {
    it('accepte d’emblée ce dont la visibilité effective est publique', () => {
      const predicat = predicatFait(enqueteur);

      expect(predicat.OR?.[0]).toEqual({ visibiliteEffective: PUBLIC });
    });

    it('exige les quatre gardiens ensemble', () => {
      const predicat = predicatFait(enqueteur);
      const conjonction = predicat.OR?.[1]?.AND;

      expect(Array.isArray(conjonction)).toBe(true);
      expect(conjonction).toHaveLength(4);
    });

    it('n’ouvre au fait lui-même que les niveaux dérogés', () => {
      const sansDerogation = predicatFait(enqueteur).OR?.[1]?.AND as Record<
        string,
        unknown
      >[];
      expect(sansDerogation[0]).toEqual({ visibilite: { in: [PUBLIC] } });

      const avecRestreint = predicatFait(
        contexte({ derogationRestreint: true }),
      ).OR?.[1]?.AND as Record<string, unknown>[];
      expect(avecRestreint[0]).toEqual({
        visibilite: { in: [PUBLIC, RESTREINT] },
      });
    });

    it('laisse passer un fait sans dossier de saisie', () => {
      const conjonction = predicatFait(enqueteur).OR?.[1]?.AND as {
        OR?: unknown[];
      }[];

      expect(conjonction[1].OR).toContainEqual({ dossierId: null });
    });

    it('laisse passer un fait sans cible — un champ n’en a pas', () => {
      const conjonction = predicatFait(enqueteur).OR?.[1]?.AND as {
        OR?: unknown[];
      }[];

      expect(conjonction[3].OR).toContainEqual({ cibleId: null });
    });

    it('rouvre par habilitation de dossier', () => {
      const conjonction = predicatFait(
        contexte({ dossiersHabilites: ['dossier-madrina'] }),
      ).OR?.[1]?.AND as { OR?: unknown[] }[];

      expect(conjonction[1].OR).toContainEqual({
        dossierId: { in: ['dossier-madrina'] },
      });
    });
  });
});
