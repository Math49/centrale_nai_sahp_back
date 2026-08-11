import { BadRequestException } from '@nestjs/common';

const PLACEHOLDER = /\{([^{}]*)\}/g;
const CLE_VALIDE = /^[a-z][a-z0-9_]*$/;

export function extraireCles(modele: string): string[] {
  const cles = [...modele.matchAll(PLACEHOLDER)].map((trouve) => trouve[1]);
  return [...new Set(cles)];
}

export function verifierSyntaxeGabarit(modele: string): void {
  const accoladesOuvrantes = (modele.match(/\{/g) ?? []).length;
  const accoladesFermantes = (modele.match(/\}/g) ?? []).length;

  if (accoladesOuvrantes !== accoladesFermantes) {
    throw new BadRequestException(
      'gabarit de libellé mal formé : accolades non appariées',
    );
  }

  const cles = extraireCles(modele);

  if (cles.length === 0) {
    throw new BadRequestException(
      'gabarit de libellé sans référence de champ — toutes les fiches porteraient le même nom',
    );
  }

  const invalides = cles.filter((cle) => !CLE_VALIDE.test(cle));

  if (invalides.length > 0) {
    throw new BadRequestException(
      `clé de gabarit invalide : ${invalides.join(', ')} — minuscules, chiffres et tirets bas, commençant par une lettre`,
    );
  }
}

export function verifierClesDuGabarit(
  modele: string,
  clesConnues: readonly string[],
): void {
  if (clesConnues.length === 0) {
    return;
  }

  const inconnues = extraireCles(modele).filter(
    (cle) => !clesConnues.includes(cle),
  );

  if (inconnues.length > 0) {
    throw new BadRequestException(
      `le gabarit de libellé cite des champs inexistants : ${inconnues.join(', ')}`,
    );
  }
}

export function appliquerGabarit(
  modele: string,
  valeurs: Record<string, string | undefined>,
): string {
  return modele
    .replace(PLACEHOLDER, (_entier, cle: string) => valeurs[cle] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}
