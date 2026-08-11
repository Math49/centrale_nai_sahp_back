import { SensLien, TypeDonnee } from '@prisma/client';

export interface DescriptionChamp {
  cle: string;
  libelle: string;
  typeDonnee: TypeDonnee;
  obligatoire?: boolean;
  estUnique?: boolean;
  multiple?: boolean;
  options?: string[];
}

export interface DescriptionOnglet {
  libelle: string;
  liens: { code: string; sens: SensLien }[];
}

export interface DescriptionType {
  code: string;
  libelle: string;
  libellePluriel: string;
  icone: string;
  modeleLibelle: string;
  champs: DescriptionChamp[];
  onglets: DescriptionOnglet[];
}

export interface DescriptionLien {
  code: string;
  libelle: string;
  libelleInverse: string;
  source: string;
  cible: string;
  multiple?: boolean;
}

export const TYPES_ENTITES: DescriptionType[] = [
  {
    code: 'groupe',
    libelle: 'Groupe',
    libellePluriel: 'Groupes',
    icone: 'groupe',
    modeleLibelle: '{nom}',
    champs: [
      {
        cle: 'nom',
        libelle: 'Nom du groupe',
        typeDonnee: TypeDonnee.texte,
        obligatoire: true,
      },
      {
        cle: 'type_de_groupe',
        libelle: 'Type de groupe',
        typeDonnee: TypeDonnee.liste,
        options: ['Orga/Cartel', 'Motor Club', 'Gang'],
      },
      { cle: 'business', libelle: 'Business', typeDonnee: TypeDonnee.texte },
    ],
    onglets: [
      {
        libelle: 'Membres',
        liens: [{ code: 'membre_de', sens: SensLien.inverse }],
      },
      {
        libelle: 'Véhicules',
        liens: [{ code: 'utilise_par', sens: SensLien.inverse }],
      },
      { libelle: 'Lieux', liens: [{ code: 'qg_de', sens: SensLien.inverse }] },
      {
        libelle: 'Événements',
        liens: [{ code: 'revendique_par', sens: SensLien.inverse }],
      },
    ],
  },
  {
    code: 'personne',
    libelle: 'Personne',
    libellePluriel: 'Personnes',
    icone: 'personne',
    modeleLibelle: '{prenom} {nom}',
    champs: [
      {
        cle: 'prenom',
        libelle: 'Prénom',
        typeDonnee: TypeDonnee.texte,
        obligatoire: true,
      },
      {
        cle: 'nom',
        libelle: 'Nom',
        typeDonnee: TypeDonnee.texte,
        obligatoire: true,
      },
      {
        cle: 'date_de_naissance',
        libelle: 'Date de naissance',
        typeDonnee: TypeDonnee.date,
      },
    ],
    onglets: [
      {
        libelle: 'Appartenance',
        liens: [{ code: 'membre_de', sens: SensLien.direct }],
      },
      {
        libelle: 'Véhicules',
        liens: [{ code: 'proprietaire_de', sens: SensLien.direct }],
      },
      {
        libelle: 'Événements',
        liens: [
          { code: 'interpelle_lors_de', sens: SensLien.direct },
          { code: 'present_lors_de', sens: SensLien.direct },
        ],
      },
    ],
  },
  {
    code: 'vehicule',
    libelle: 'Véhicule',
    libellePluriel: 'Véhicules',
    icone: 'vehicule',
    modeleLibelle: '{plaque}',
    champs: [
      {
        cle: 'plaque',
        libelle: 'Plaque',
        typeDonnee: TypeDonnee.texte,
        obligatoire: true,
        estUnique: true,
      },
      { cle: 'modele', libelle: 'Modèle', typeDonnee: TypeDonnee.texte },
      {
        cle: 'couleur',
        libelle: 'Couleur',
        typeDonnee: TypeDonnee.liste,
        options: ['gris', 'noir', 'blanc', 'rouge', 'bleu'],
      },
    ],
    onglets: [
      {
        libelle: 'Propriétaire',
        liens: [{ code: 'proprietaire_de', sens: SensLien.inverse }],
      },
      {
        libelle: 'Groupe',
        liens: [{ code: 'utilise_par', sens: SensLien.direct }],
      },
      {
        libelle: 'Événements',
        liens: [{ code: 'utilise_lors_de', sens: SensLien.direct }],
      },
    ],
  },
  {
    code: 'lieu',
    libelle: 'Lieu',
    libellePluriel: 'Lieux',
    icone: 'lieu',
    modeleLibelle: '{nom}',
    champs: [
      {
        cle: 'nom',
        libelle: 'Nom',
        typeDonnee: TypeDonnee.texte,
        obligatoire: true,
      },
      { cle: 'adresse', libelle: 'Adresse', typeDonnee: TypeDonnee.texte },
    ],
    onglets: [
      { libelle: 'Groupes', liens: [{ code: 'qg_de', sens: SensLien.direct }] },
      {
        libelle: 'Événements',
        liens: [{ code: 'situe_a', sens: SensLien.inverse }],
      },
    ],
  },
  {
    code: 'evenement',
    libelle: 'Événement',
    libellePluriel: 'Événements',
    icone: 'evenement',
    modeleLibelle: '{nom}',
    champs: [
      {
        cle: 'nom',
        libelle: 'Nom',
        typeDonnee: TypeDonnee.texte,
        obligatoire: true,
      },
      {
        cle: 'date_et_heure',
        libelle: 'Date et heure',
        typeDonnee: TypeDonnee.datetime,
      },
    ],
    onglets: [
      {
        libelle: 'Personnes',
        liens: [
          { code: 'interpelle_lors_de', sens: SensLien.inverse },
          { code: 'present_lors_de', sens: SensLien.inverse },
        ],
      },
      {
        libelle: 'Véhicules',
        liens: [{ code: 'utilise_lors_de', sens: SensLien.inverse }],
      },
      { libelle: 'Lieu', liens: [{ code: 'situe_a', sens: SensLien.direct }] },
      {
        libelle: 'Revendication',
        liens: [{ code: 'revendique_par', sens: SensLien.direct }],
      },
    ],
  },
];

export const TYPES_LIENS: DescriptionLien[] = [
  {
    code: 'membre_de',
    libelle: 'membre de',
    libelleInverse: 'a pour membre',
    source: 'personne',
    cible: 'groupe',
  },
  {
    code: 'proprietaire_de',
    libelle: 'propriétaire de',
    libelleInverse: 'appartient à',
    source: 'personne',
    cible: 'vehicule',
  },
  {
    code: 'utilise_par',
    libelle: 'utilisé par',
    libelleInverse: 'utilise',
    source: 'vehicule',
    cible: 'groupe',
  },
  {
    code: 'qg_de',
    libelle: 'QG de',
    libelleInverse: 'a pour QG',
    source: 'lieu',
    cible: 'groupe',
  },
  {
    code: 'situe_a',
    libelle: 'situé à',
    libelleInverse: 'a été le lieu de',
    source: 'evenement',
    cible: 'lieu',
    multiple: false,
  },
  {
    code: 'interpelle_lors_de',
    libelle: 'interpellé lors de',
    libelleInverse: 'a vu interpeller',
    source: 'personne',
    cible: 'evenement',
  },
  {
    code: 'present_lors_de',
    libelle: 'présent lors de',
    libelleInverse: 'a vu présent',
    source: 'personne',
    cible: 'evenement',
  },
  {
    code: 'utilise_lors_de',
    libelle: 'utilisé lors de',
    libelleInverse: 'a vu utiliser',
    source: 'vehicule',
    cible: 'evenement',
  },
  {
    code: 'revendique_par',
    libelle: 'revendiqué par',
    libelleInverse: 'a revendiqué',
    source: 'evenement',
    cible: 'groupe',
  },
];
