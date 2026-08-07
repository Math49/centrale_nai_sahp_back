/**
 * Catalogue des permissions — conception technique §6.7.
 *
 * Une permission décrit un *geste*, jamais un objet. Le droit de voir un objet
 * relève de la visibilité et de l'habilitation, qui sont deux axes distincts
 * (lot 5). Ne pas mélanger les trois.
 */
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

  /**
   * Gestion des comptes et des grades.
   *
   * Ces deux codes ne figurent pas au catalogue de la conception technique.
   * Ils y sont ajoutés parce que le catalogue accorde `agent.anonymiser` à
   * l'État-Major : lui refuser la création d'un compte tout en lui permettant
   * d'en retirer un serait incohérent. Le retrait garde sa permission propre,
   * l'anonymisation étant un geste plus lourd que la création.
   */
  AGENT_GERER: 'agent.gerer',
  ROLE_GERER: 'role.gerer',

  AGENT_ANONYMISER: 'agent.anonymiser',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const TOUTES_LES_PERMISSIONS: readonly Permission[] =
  Object.values(PERMISSIONS);

/** Libellés destinés à l'écran d'administration des rôles. */
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
