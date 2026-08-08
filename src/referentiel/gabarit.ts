import { BadRequestException } from '@nestjs/common';

/**
 * Gabarit de libellé d'un type d'entité — « {prenom} {nom} », « {plaque} ».
 *
 * Il évite de coder en dur la façon de nommer chaque type. Le libellé lui-même
 * est recalculé par trigger à partir des faits (lot 4) ; ces fonctions servent
 * à valider un gabarit et à l'illustrer dans l'écran d'administration.
 */

const PLACEHOLDER = /\{([^{}]*)\}/g;
const CLE_VALIDE = /^[a-z][a-z0-9_]*$/;

/** Clés citées par un gabarit, dans l'ordre, sans doublon. */
export function extraireCles(modele: string): string[] {
  const cles = [...modele.matchAll(PLACEHOLDER)].map((trouve) => trouve[1]);
  return [...new Set(cles)];
}

/**
 * Vérifie la forme du gabarit, indépendamment des champs existants.
 *
 * Cette vérification-là s'applique toujours, y compris à la création d'un type
 * qui n'a encore aucun champ.
 */
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

/**
 * Vérifie que le gabarit ne cite que des champs existants.
 *
 * N'a de sens qu'une fois le type pourvu de champs : à sa création il n'en a
 * aucun, et exiger le contraire rendrait tout type impossible à créer.
 */
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

/** Rend un gabarit lisible, pour l'aperçu de l'écran d'administration. */
export function appliquerGabarit(
  modele: string,
  valeurs: Record<string, string | undefined>,
): string {
  return modele
    .replace(PLACEHOLDER, (_entier, cle: string) => valeurs[cle] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}
