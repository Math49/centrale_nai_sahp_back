import {
  appliquerGabarit,
  extraireCles,
  verifierClesDuGabarit,
  verifierSyntaxeGabarit,
} from './gabarit';

describe('gabarit de libellé', () => {
  describe('extraireCles', () => {
    it('relève les clés dans l’ordre', () => {
      expect(extraireCles('{prenom} {nom}')).toEqual(['prenom', 'nom']);
    });

    it('ne répète pas une clé citée deux fois', () => {
      expect(extraireCles('{plaque} — {plaque}')).toEqual(['plaque']);
    });

    it('ne trouve rien dans un texte sans accolades', () => {
      expect(extraireCles('Véhicule')).toEqual([]);
    });
  });

  describe('verifierSyntaxeGabarit', () => {
    it('accepte un gabarit courant', () => {
      expect(() => verifierSyntaxeGabarit('{prenom} {nom}')).not.toThrow();
    });

    it('refuse des accolades non appariées', () => {
      expect(() => verifierSyntaxeGabarit('{prenom} {nom')).toThrow(
        /accolades/,
      );
    });

    it('refuse un gabarit sans aucune référence de champ', () => {
      // Sinon toutes les fiches du type porteraient le même libellé.
      expect(() => verifierSyntaxeGabarit('Véhicule')).toThrow(
        /sans référence de champ/,
      );
    });

    it('refuse une clé mal formée', () => {
      expect(() => verifierSyntaxeGabarit('{Prénom}')).toThrow(/invalide/);
    });
  });

  describe('verifierClesDuGabarit', () => {
    it('accepte des clés connues', () => {
      expect(() =>
        verifierClesDuGabarit('{prenom} {nom}', ['prenom', 'nom', 'age']),
      ).not.toThrow();
    });

    it('refuse une clé inconnue', () => {
      expect(() =>
        verifierClesDuGabarit('{prenom} {surnom}', ['prenom', 'nom']),
      ).toThrow(/surnom/);
    });

    it('laisse passer tant que le type n’a aucun champ', () => {
      // À la création, le type n'a pas encore de champ : exiger le contraire
      // rendrait tout type impossible à créer.
      expect(() => verifierClesDuGabarit('{plaque}', [])).not.toThrow();
    });
  });

  describe('appliquerGabarit', () => {
    it('remplace les clés par leurs valeurs', () => {
      expect(
        appliquerGabarit('{prenom} {nom}', {
          prenom: 'Tyron',
          nom: 'Banks',
        }),
      ).toBe('Tyron Banks');
    });

    it('resserre les espaces laissés par une valeur absente', () => {
      expect(appliquerGabarit('{prenom} {nom}', { nom: 'Banks' })).toBe(
        'Banks',
      );
    });
  });
});
