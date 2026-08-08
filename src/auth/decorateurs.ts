import { SetMetadata } from '@nestjs/common';

import type { Permission } from '../agents/permissions';

export const CLE_PUBLIQUE = 'route_publique';
export const CLE_PERMISSIONS = 'route_permissions';
export const CLE_SANS_PERMISSION = 'route_sans_permission';
export const CLE_SUPER_ADMIN = 'route_super_admin';
export const CLE_MOT_DE_PASSE_A_CHANGER = 'route_mot_de_passe_a_changer';

/**
 * Route accessible sans jeton.
 *
 * À n'employer que pour la connexion et la santé. Chaque usage est un trou
 * volontaire dans le dispositif et doit se justifier en revue.
 */
export const Publique = () => SetMetadata(CLE_PUBLIQUE, true);

/**
 * Permissions exigées. Plusieurs codes signifient « toutes requises ».
 *
 * Une route authentifiée sans `@Permissions(...)` ni `@SansPermission()` est
 * **refusée** : un oubli doit produire un refus, jamais une ouverture.
 */
export const Permissions = (...permissions: Permission[]) =>
  SetMetadata(CLE_PERMISSIONS, permissions);

/**
 * Route authentifiée que tout agent peut appeler, quelles que soient ses
 * permissions — sa propre identité, son propre mot de passe.
 *
 * Déclaration explicite, pour que l'absence de décorateur reste un refus.
 */
export const SansPermission = () => SetMetadata(CLE_SANS_PERMISSION, true);

/**
 * Route réservée au super-admin, **câblée en dur**.
 *
 * Aucune permission ne l'ouvre : la configuration du modèle métier — types
 * d'entités, champs, types de liens, mise en page des fiches — ne se délègue
 * pas par un jeu de permissions reconfigurable, sous peine qu'un grade puisse
 * s'accorder le droit de la modifier.
 */
export const SuperAdminSeul = () => SetMetadata(CLE_SUPER_ADMIN, true);

/**
 * Route joignable par un agent à qui le changement de mot de passe est imposé.
 *
 * Sans cela, un compte en changement imposé serait enfermé : il détient un
 * jeton valide mais ne peut rien appeler, pas même la route qui le libère.
 */
export const AutoriseeEnChangementImpose = () =>
  SetMetadata(CLE_MOT_DE_PASSE_A_CHANGER, true);
