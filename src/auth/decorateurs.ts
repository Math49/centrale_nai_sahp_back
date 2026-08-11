import { SetMetadata } from '@nestjs/common';

import type { Permission } from '../agents/permissions';

export const CLE_PUBLIQUE = 'route_publique';
export const CLE_PERMISSIONS = 'route_permissions';
export const CLE_SANS_PERMISSION = 'route_sans_permission';
export const CLE_SUPER_ADMIN = 'route_super_admin';
export const CLE_MOT_DE_PASSE_A_CHANGER = 'route_mot_de_passe_a_changer';

export const Publique = () => SetMetadata(CLE_PUBLIQUE, true);

export const Permissions = (...permissions: Permission[]) =>
  SetMetadata(CLE_PERMISSIONS, permissions);

export const SansPermission = () => SetMetadata(CLE_SANS_PERMISSION, true);

export const SuperAdminSeul = () => SetMetadata(CLE_SUPER_ADMIN, true);

export const AutoriseeEnChangementImpose = () =>
  SetMetadata(CLE_MOT_DE_PASSE_A_CHANGER, true);
