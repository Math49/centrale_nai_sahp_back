import { validerEnvironnement } from './environnement';

const minimal = {
  DATABASE_URL: 'postgresql://ni:ni@localhost:5432/centrale_ni',
};

describe('validerEnvironnement', () => {
  it('applique les valeurs par défaut', () => {
    const environnement = validerEnvironnement({ ...minimal });

    expect(environnement.NODE_ENV).toBe('development');
    expect(environnement.PORT).toBe(3000);
    expect(environnement.CORS_ORIGINES).toEqual(['http://localhost:3001']);
    expect(environnement.SWAGGER_ACTIF).toBe(true);
  });

  it('refuse de démarrer sans DATABASE_URL', () => {
    expect(() => validerEnvironnement({})).toThrow(
      /Configuration d'environnement invalide/,
    );
  });

  it("refuse une DATABASE_URL qui n'est pas une URL", () => {
    expect(() => validerEnvironnement({ DATABASE_URL: 'centrale_ni' })).toThrow(
      /DATABASE_URL/,
    );
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
      CORS_ORIGINES: 'http://localhost:3001, https://ni.example ,',
    });

    expect(environnement.CORS_ORIGINES).toEqual([
      'http://localhost:3001',
      'https://ni.example',
    ]);
  });
});
