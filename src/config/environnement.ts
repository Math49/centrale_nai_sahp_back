import { z } from 'zod';

const LONGUEUR_MINIMALE_MOT_DE_PASSE = 12;

export const schemaEnvironnement = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  PORT: z.coerce.number().int().positive().max(65535).default(3000),

  DATABASE_URL: z.string().url(),

  CORS_ORIGINES: z
    .string()
    .default('http://localhost:3001')
    .transform((valeur) =>
      valeur
        .split(',')
        .map((origine) => origine.trim())
        .filter((origine) => origine.length > 0),
    ),

  SWAGGER_ACTIF: z
    .enum(['true', 'false'])
    .default('true')
    .transform((valeur) => valeur === 'true'),

  JWT_SECRET: z
    .string()
    .min(32, 'au moins 32 caractères — ce secret ouvre tous les comptes'),

  JWT_DUREE: z.string().default('7d'),

  SUPER_ADMIN_MATRICULE: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9-]+$/, 'lettres, chiffres et tirets uniquement')
    .optional(),
  SUPER_ADMIN_PRENOM: z.string().min(1).max(128).optional(),
  SUPER_ADMIN_NOM: z.string().min(1).max(128).optional(),
  SUPER_ADMIN_MOT_DE_PASSE: z
    .string()
    .min(LONGUEUR_MINIMALE_MOT_DE_PASSE)
    .max(256)
    .optional(),
  SUPER_ADMIN_GRADE: z.string().min(1).default('etat_major'),

  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((valeur) => valeur === 'true'),

  COOKIE_DOMAINE: z.string().optional(),

  VIEILLISSEMENT_JOURS: z.coerce
    .number()
    .int()
    .positive()
    .max(3650)
    .default(30),

  FICHIERS_RACINE: z.string().min(1).default('./donnees/fichiers'),

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
