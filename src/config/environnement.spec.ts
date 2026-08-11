import { validerEnvironnement } from './environnement';

const minimal = {
  DATABASE_URL: 'postgresql://ni:ni@localhost:40512/centrale_ni',
  JWT_SECRET: 'secret-de-test-assez-long-pour-passer-le-seuil',
};

describe('validerEnvironnement', () => {
  it('applique les valeurs par défaut', () => {
    const environnement = validerEnvironnement({ ...minimal });

    expect(environnement.NODE_ENV).toBe('development');
    expect(environnement.PORT).toBe(40511);
    expect(environnement.CORS_ORIGINES).toEqual(['http://localhost:40510']);
    expect(environnement.SWAGGER_ACTIF).toBe(true);
    expect(environnement.SUPER_ADMIN_MATRICULE).toBeUndefined();
    expect(environnement.SUPER_ADMIN_GRADE).toBe('etat_major');
  });

  it('refuse de démarrer sans DATABASE_URL', () => {
    expect(() => validerEnvironnement({})).toThrow(
      /Configuration d'environnement invalide/,
    );
  });

  it("refuse une DATABASE_URL qui n'est pas une URL", () => {
    expect(() =>
      validerEnvironnement({ ...minimal, DATABASE_URL: 'centrale_ni' }),
    ).toThrow(/DATABASE_URL/);
  });

  it('refuse de démarrer sans JWT_SECRET', () => {
    expect(() =>
      validerEnvironnement({ DATABASE_URL: minimal.DATABASE_URL }),
    ).toThrow(/JWT_SECRET/);
  });

  it('refuse un JWT_SECRET trop court', () => {
    expect(() =>
      validerEnvironnement({ ...minimal, JWT_SECRET: 'trop-court' }),
    ).toThrow(/JWT_SECRET/);
  });

  it('convertit PORT en nombre', () => {
    expect(validerEnvironnement({ ...minimal, PORT: '4000' }).PORT).toBe(4000);
  });

  it('refuse un PORT hors bornes', () => {
    expect(() => validerEnvironnement({ ...minimal, PORT: '70000' })).toThrow(
      /PORT/,
    );
  });

  it('découpe CORS_ORIGINES sur les virgules', () => {
    const environnement = validerEnvironnement({
      ...minimal,
      CORS_ORIGINES: 'http://localhost:40510, https://ni.example ,',
    });

    expect(environnement.CORS_ORIGINES).toEqual([
      'http://localhost:40510',
      'https://ni.example',
    ]);
  });

  it('valide les champs du premier super-admin quand ils sont fournis', () => {
    const environnement = validerEnvironnement({
      ...minimal,
      SUPER_ADMIN_MATRICULE: '2291',
      SUPER_ADMIN_PRENOM: 'Mathis',
      SUPER_ADMIN_NOM: 'Mercier',
      SUPER_ADMIN_MOT_DE_PASSE: 'mot-de-passe-long',
    });

    expect(environnement.SUPER_ADMIN_MATRICULE).toBe('2291');
    expect(environnement.SUPER_ADMIN_GRADE).toBe('etat_major');
  });

  it('refuse un mot de passe initial super-admin trop court', () => {
    expect(() =>
      validerEnvironnement({
        ...minimal,
        SUPER_ADMIN_MOT_DE_PASSE: 'court',
      }),
    ).toThrow(/SUPER_ADMIN_MOT_DE_PASSE/);
  });
});
