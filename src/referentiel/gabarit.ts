import { BadRequestException } from '@nestjs/common';
import { TypeDonnee } from '@prisma/client';

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

/**
 * Le gabarit ne peut pas citer un champ qui ne sait pas se dire.
 *
 * Un point de carte est une paire de coordonnées : le citer donnerait un
 * libellé du genre « Planque 0.5098 · 0.4968 », et ce libellé est le nom sous
 * lequel la donnée apparaît partout — annuaire, graphe, journal, recherche.
 * Mieux vaut le refuser à la configuration, où l'administrateur peut corriger,
 * que le produire à l'exécution, où personne ne comprendra d'où il sort.
 *
 * Le contrôle ne porte que sur `carte`. Le type `fichier` a le même défaut — sa
 * valeur est toujours nulle, donc il s'efface silencieusement du libellé — mais
 * il est antérieur, et l'ajouter ici empêcherait de modifier un type qui le
 * cite déjà. À traiter à part, en connaissance de cause.
 */
export function verifierTypesDuGabarit(
  modele: string,
  champs: readonly { cle: string; typeDonnee: TypeDonnee }[],
): void {
  const citees = extraireCles(modele);

  const impossibles = champs.filter(
    (champ) =>
      champ.typeDonnee === TypeDonnee.carte && citees.includes(champ.cle),
  );

  if (impossibles.length > 0) {
    throw new BadRequestException(
      `le gabarit de libellé cite des champs qui ne peuvent pas nommer une donnée : ${impossibles
        .map((champ) => champ.cle)
        .join(', ')} — un point de carte n'est pas un nom`,
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
