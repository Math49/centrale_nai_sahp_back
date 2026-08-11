import { PERMISSIONS, type Permission } from './permissions';

export interface DefinitionGrade {
  code: string;
  libelle: string;
  ordre: number;
  permissions: Permission[];
}

const JUNIOR: Permission[] = [
  PERMISSIONS.ENTITE_CREER,
  PERMISSIONS.ENTITE_MODIFIER,
  PERMISSIONS.FAIT_CREER,
  PERMISSIONS.FAIT_MODIFIER,
  PERMISSIONS.DOSSIER_CREER,
  PERMISSIONS.DOSSIER_MODIFIER,
];

const SENIOR: Permission[] = [
  ...JUNIOR,
  PERMISSIONS.ENTITE_ARCHIVER,
  PERMISSIONS.ENTITE_DESARCHIVER,
  PERMISSIONS.ENTITE_FUSIONNER,
  PERMISSIONS.FAIT_INFIRMER,
  PERMISSIONS.HISTORIQUE_CONSULTER,
  PERMISSIONS.GRAPHE_REPOSITIONNER,
];

const ETAT_MAJOR: Permission[] = [
  ...SENIOR,
  PERMISSIONS.VISIBILITE_DEFINIR,
  PERMISSIONS.ACCES_DEROGATOIRE_RESTREINT,
  PERMISSIONS.ACCES_DEROGATOIRE_PRIVE,
  PERMISSIONS.DOSSIER_HABILITER,
  PERMISSIONS.JOURNAL_CONSULTER,
  PERMISSIONS.AGENT_GERER,
  PERMISSIONS.ROLE_GERER,
  PERMISSIONS.AGENT_ANONYMISER,
];

export const CODE_JUNIOR = 'junior_investigator';
export const CODE_SENIOR = 'senior_investigator';
export const CODE_ETAT_MAJOR = 'etat_major';

export const GRADES: readonly DefinitionGrade[] = [
  {
    code: CODE_JUNIOR,
    libelle: 'Junior Investigator',
    ordre: 1,
    permissions: JUNIOR,
  },
  {
    code: CODE_SENIOR,
    libelle: 'Senior Investigator',
    ordre: 2,
    permissions: SENIOR,
  },
  {
    code: CODE_ETAT_MAJOR,
    libelle: 'État-Major',
    ordre: 3,
    permissions: ETAT_MAJOR,
  },
];
