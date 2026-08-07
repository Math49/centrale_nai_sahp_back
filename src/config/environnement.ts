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
