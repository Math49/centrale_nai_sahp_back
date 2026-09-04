export const PERMISSIONS = {
  /**
   * Consultation — les trois gestes de lecture.
   *
   * Jusqu'ici toute lecture était ouverte à quiconque était connecté : la seule
   * question posée était « cet objet vous est-il visible ? ». Cela suffisait
   * tant que tout compte appartenait à l'unité. Un grade destiné à l'extérieur
   * demande de pouvoir ouvrir une zone sans les autres — d'où ces trois codes.
   *
   * Ils ne remplacent pas la visibilité, ils s'y ajoutent : la permission dit
   * si l'écran s'ouvre, la visibilité dit ce qu'on y trouve.
   */
  ENTITE_CONSULTER: 'entite.consulter',
  DOSSIER_CONSULTER: 'dossier.consulter',
  GRAPHE_CONSULTER: 'graphe.consulter',
  CARTE_CONSULTER: 'carte.consulter',
  KANBAN_CONSULTER: 'kanban.consulter',

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

  /**
   * Retirer un dossier des écrans courants, ou l'y remettre.
   *
   * Un seul code pour les deux sens, comme `carte.archiver` et
   * `kanban.archiver` : rouvrir une enquête close n'est pas un geste d'une
   * autre portée que la clore. Séparé de `dossier.modifier` en revanche —
   * renommer un dossier et le sortir de la circulation ne se confondent pas,
   * et c'est le partage que les entités font déjà.
   */
  DOSSIER_ARCHIVER: 'dossier.archiver',

  DOSSIER_HABILITER: 'dossier.habiliter',

  VISIBILITE_DEFINIR: 'visibilite.definir',

  ACCES_DEROGATOIRE_RESTREINT: 'acces.derogatoire.restreint',
  ACCES_DEROGATOIRE_PRIVE: 'acces.derogatoire.prive',

  HISTORIQUE_CONSULTER: 'historique.consulter',
  JOURNAL_CONSULTER: 'journal.consulter',

  GRAPHE_REPOSITIONNER: 'graphe.repositionner',

  /**
   * Repères de la carte.
   *
   * Le classement en restreint ou privé reste sous `visibilite.definir`, et
   * l'habilitation nominative sous `dossier.habiliter` : on ne double pas des
   * gestes qui existent. Ces deux-ci décrivent ce que la carte ajoute — poser
   * un repère, et le retirer du plan.
   */
  CARTE_ANNOTER: 'carte.annoter',
  CARTE_ARCHIVER: 'carte.archiver',

  /**
   * Tableau des enquêtes.
   *
   * `kanban.ecrire` couvre aussi l'**assignation** : désigner qui travaille sur
   * quoi est une modification de la carte comme une autre. L'habilitation, elle,
   * reste sous `dossier.habiliter` — un geste d'une tout autre portée, qui ne se
   * délègue pas par la bande.
   */
  KANBAN_ECRIRE: 'kanban.ecrire',
  KANBAN_ARCHIVER: 'kanban.archiver',

  AGENT_GERER: 'agent.gerer',
  ROLE_GERER: 'role.gerer',

  AGENT_ANONYMISER: 'agent.anonymiser',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const TOUTES_LES_PERMISSIONS: readonly Permission[] =
  Object.values(PERMISSIONS);

export const LIBELLES_PERMISSIONS: Record<Permission, string> = {
  [PERMISSIONS.ENTITE_CONSULTER]: 'Consulter l’annuaire et les fiches',
  [PERMISSIONS.DOSSIER_CONSULTER]: 'Consulter les dossiers',
  [PERMISSIONS.GRAPHE_CONSULTER]: 'Consulter le graphe',
  [PERMISSIONS.CARTE_CONSULTER]: 'Consulter la carte',
  [PERMISSIONS.KANBAN_CONSULTER]: 'Consulter le tableau des enquêtes',
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
  [PERMISSIONS.DOSSIER_ARCHIVER]: 'Archiver un dossier, ou le réactiver',
  [PERMISSIONS.DOSSIER_HABILITER]:
    'Habiliter un agent sur un dossier ou une donnée',
  [PERMISSIONS.VISIBILITE_DEFINIR]: 'Classer un objet en restreint ou privé',
  [PERMISSIONS.ACCES_DEROGATOIRE_RESTREINT]:
    'Accès dérogatoire aux objets restreints',
  [PERMISSIONS.ACCES_DEROGATOIRE_PRIVE]: 'Accès dérogatoire aux objets privés',
  [PERMISSIONS.HISTORIQUE_CONSULTER]: "Consulter l'onglet Historique",
  [PERMISSIONS.JOURNAL_CONSULTER]: 'Consulter les journaux',
  [PERMISSIONS.GRAPHE_REPOSITIONNER]: 'Repositionner le graphe pour tous',
  [PERMISSIONS.CARTE_ANNOTER]: 'Poser et modifier un repère sur la carte',
  [PERMISSIONS.CARTE_ARCHIVER]: 'Retirer un repère de la carte',
  [PERMISSIONS.KANBAN_ECRIRE]:
    'Créer, modifier, déplacer et assigner une carte d’enquête',
  [PERMISSIONS.KANBAN_ARCHIVER]: 'Archiver une carte d’enquête',
  [PERMISSIONS.AGENT_GERER]: 'Créer et modifier des comptes',
  [PERMISSIONS.ROLE_GERER]: 'Configurer les grades et leurs permissions',
  [PERMISSIONS.AGENT_ANONYMISER]: 'Anonymiser un compte',
};

export function estUnePermissionConnue(code: string): code is Permission {
  return (TOUTES_LES_PERMISSIONS as readonly string[]).includes(code);
}
