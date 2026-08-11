export const PERMISSIONS = {
  ENTITE_CREER: 'entite.creer',
  ENTITE_MODIFIER: 'entite.modifier',
  ENTITE_ARCHIVER: 'entite.archiver',
  ENTITE_DESARCHIVER: 'entite.desarchiver',
  ENTITE_FUSIONNER: 'entite.fusionner',

  FAIT_CREER: 'fait.creer',
  FAIT_MODIFIER: 'fait.modifier',
  FAIT_INFIRMER: 'fait.infirmer',

  DOSSIER_CREER: 'dossier.creer',
  DOSSIER_MODIFIER: 'dossier.modifier',
  DOSSIER_HABILITER: 'dossier.habiliter',

  VISIBILITE_DEFINIR: 'visibilite.definir',

  ACCES_DEROGATOIRE_RESTREINT: 'acces.derogatoire.restreint',
  ACCES_DEROGATOIRE_PRIVE: 'acces.derogatoire.prive',

  HISTORIQUE_CONSULTER: 'historique.consulter',
  JOURNAL_CONSULTER: 'journal.consulter',

  GRAPHE_REPOSITIONNER: 'graphe.repositionner',

  AGENT_GERER: 'agent.gerer',
  ROLE_GERER: 'role.gerer',

  AGENT_ANONYMISER: 'agent.anonymiser',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const TOUTES_LES_PERMISSIONS: readonly Permission[] =
  Object.values(PERMISSIONS);

export const LIBELLES_PERMISSIONS: Record<Permission, string> = {
  [PERMISSIONS.ENTITE_CREER]: 'Créer une entité',
  [PERMISSIONS.ENTITE_MODIFIER]: 'Modifier une entité',
  [PERMISSIONS.ENTITE_ARCHIVER]: 'Archiver une entité',
  [PERMISSIONS.ENTITE_DESARCHIVER]: 'Désarchiver une entité',
  [PERMISSIONS.ENTITE_FUSIONNER]: 'Fusionner des doublons',
  [PERMISSIONS.FAIT_CREER]: 'Créer un fait',
  [PERMISSIONS.FAIT_MODIFIER]: "Modifier un fait, y compris celui d'autrui",
  [PERMISSIONS.FAIT_INFIRMER]: 'Infirmer un fait',
  [PERMISSIONS.DOSSIER_CREER]: 'Créer un dossier',
  [PERMISSIONS.DOSSIER_MODIFIER]: 'Modifier un dossier',
  [PERMISSIONS.DOSSIER_HABILITER]: 'Habiliter un agent sur un dossier',
  [PERMISSIONS.VISIBILITE_DEFINIR]: 'Classer un objet en restreint ou privé',
  [PERMISSIONS.ACCES_DEROGATOIRE_RESTREINT]:
    'Accès dérogatoire aux objets restreints',
  [PERMISSIONS.ACCES_DEROGATOIRE_PRIVE]: 'Accès dérogatoire aux objets privés',
  [PERMISSIONS.HISTORIQUE_CONSULTER]: "Consulter l'onglet Historique",
  [PERMISSIONS.JOURNAL_CONSULTER]: 'Consulter les journaux',
  [PERMISSIONS.GRAPHE_REPOSITIONNER]: 'Repositionner le graphe pour tous',
  [PERMISSIONS.AGENT_GERER]: 'Créer et modifier des comptes',
  [PERMISSIONS.ROLE_GERER]: 'Configurer les grades et leurs permissions',
  [PERMISSIONS.AGENT_ANONYMISER]: 'Anonymiser un compte',
};

export function estUnePermissionConnue(code: string): code is Permission {
  return (TOUTES_LES_PERMISSIONS as readonly string[]).includes(code);
}
