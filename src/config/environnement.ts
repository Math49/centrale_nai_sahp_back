import { z } from 'zod';

/**
 * Contrat des variables d'environnement.
 *
 * Toute configuration passe par ici. Le processus refuse de démarrer si une
 * variable est absente ou mal formée : mieux vaut un échec au démarrage qu'une
 * API qui tourne avec une base mal renseignée.
 */
export const schemaEnvironnement = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  PORT: z.coerce.number().int().positive().max(65535).default(3000),

  /** Chaîne de connexion PostgreSQL, consommée aussi par Prisma. */
  DATABASE_URL: z.string().url(),

  /** Origines autorisées pour le front, séparées par des virgules. */
  CORS_ORIGINES: z
    .string()
    .default('http://localhost:3001')
    .transform((valeur) =>
      valeur
        .split(',')
        .map((origine) => origine.trim())
        .filter((origine) => origine.length > 0),
    ),

  /** Expose /documentation. À laisser à false en production. */
  SWAGGER_ACTIF: z
    .enum(['true', 'false'])
    .default('true')
    .transform((valeur) => valeur === 'true'),

  /** Secret de signature des JWT. Aucune valeur par défaut : un secret
   *  d'exemple oublié en production ouvrirait tous les comptes. */
  JWT_SECRET: z
    .string()
    .min(32, 'au moins 32 caractères — ce secret ouvre tous les comptes'),

  /**
   * Durée de validité d'un jeton, au format accepté par @nestjs/jwt.
   *
   * Elle vaut aussi celle du cookie qui le porte : les deux péremptions doivent
   * coïncider, sans quoi le navigateur enverrait un cookie que l'API refuse, ou
   * l'inverse.
   */
  JWT_DUREE: z.string().default('7d'),

  /**
   * Cookie `Secure` — le navigateur ne le renvoie alors que sur HTTPS.
   *
   * Faux en développement, où l'on sert en clair sur localhost ; **vrai en
   * production**, où le proxy TLS est la seule porte d'entrée.
   */
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((valeur) => valeur === 'true'),

  /**
   * Domaine du cookie. Vide en développement — le navigateur retient alors
   * l'hôte exact, ce qui est le comportement voulu sur localhost.
   */
  COOKIE_DOMAINE: z.string().optional(),

  /**
   * Délai au-delà duquel un fait « à confirmer » non revu remonte en signal.
   *
   * La conception technique laisse la valeur initiale à fixer à l'usage : trente
   * jours est un point de départ, pas une vérité. Le paramètre existe pour être
   * ajusté quand le service aura de quoi juger.
   */
  VIEILLISSEMENT_JOURS: z.coerce
    .number()
    .int()
    .positive()
    .max(3650)
    .default(30),

  /**
   * Racine du volume de fichiers.
   *
   * Jamais exposée par le reverse proxy : aucun dossier n'est servi en
   * statique, un contrôleur vérifie les droits avant de renvoyer l'octet.
   */
  FICHIERS_RACINE: z.string().min(1).default('./donnees/fichiers'),

  /**
   * Plafond de taille d'une image déposée, en mégaoctets.
   *
   * La conception laisse la valeur à l'implémentation : huit mégaoctets laissent
   * passer une capture de jeu en pleine résolution sans ouvrir la porte à un
   * dépôt qui n'en serait pas un.
   */
  FICHIER_TAILLE_MAX_MO: z.coerce.number().int().positive().max(64).default(8),
});

export type Environnement = z.infer<typeof schemaEnvironnement>;

export function validerEnvironnement(
  brut: Record<string, unknown>,
): Environnement {
  const resultat = schemaEnvironnement.safeParse(brut);

  if (!resultat.success) {
    const details = resultat.error.issues
      .map((probleme) => `  ${probleme.path.join('.')} — ${probleme.message}`)
      .join('\n');

    throw new Error(`Configuration d'environnement invalide :\n${details}`);
  }

  return resultat.data;
}
