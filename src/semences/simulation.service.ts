import { Injectable, Logger } from '@nestjs/common';
import { EtatFait, Visibilite } from '@prisma/client';

import type { Permission } from '../agents/permissions';
import type { AgentCourant } from '../auth/agent-courant';
import { DossiersService } from '../dossiers/dossiers.service';
import { EntitesService } from '../entites/entites.service';
import { FaitsService } from '../faits/faits.service';
import { PrismaService } from '../prisma/prisma.service';
import { MadrinaService } from './madrina.service';

/**
 * Jeu de données d'usage — une simulation d'activité réelle du service.
 *
 * Le parcours Madrina est le **test** de la plateforme : onze entités, tendues
 * vers une démonstration. Ce jeu-ci est l'**usage** : quatre organisations,
 * une centaine d'entités, des enquêtes qui se chevauchent, des sources de
 * qualité inégale, des faits infirmés, des fiches archivées, des dossiers
 * privés. C'est ce qu'il faut pour juger un écran, une recherche, un graphe.
 *
 * Ce qui y est délibéré, et qu'il ne faut pas « corriger » :
 *
 * - **des entités partagées entre organisations** — c'est ce qui fait tomber
 *   les signaux de recoupement et de récurrence ;
 * - **de la fiabilité inégale**, jusqu'au douteux, pour que le filtre par
 *   maillon le plus faible ait quelque chose à filtrer ;
 * - **des faits infirmés et des fiches archivées**, pour que l'historique et
 *   les archives ne soient pas vides ;
 * - **un dossier privé et des entités restreintes**, pour que le moteur de
 *   visibilité se voie à l'œil nu selon le compte utilisé.
 */

interface Provenance {
  source: string;
  fiabilite: number;
  dateConstatation: string;
}

const SOURCES: Record<string, Provenance> = {
  fichier: {
    source: 'Centrale SAPD — fichier des immatriculations',
    fiabilite: 4,
    dateConstatation: '2026-07-14',
  },
  planque: {
    source: 'Planque — poste d’observation Vespucci',
    fiabilite: 4,
    dateConstatation: '2026-07-21',
  },
  interpellation: {
    source: 'Rapport d’interpellation n°3140',
    fiabilite: 4,
    dateConstatation: '2026-07-28',
  },
  videosurveillance: {
    source: 'Vidéosurveillance — commerce de la Route 68',
    fiabilite: 3,
    dateConstatation: '2026-08-01',
  },
  temoin: {
    source: 'Témoin identifié — riverain de Grove Street',
    fiabilite: 3,
    dateConstatation: '2026-07-30',
  },
  informateur: {
    source: 'Informateur « Vespucci »',
    fiabilite: 2,
    dateConstatation: '2026-07-18',
  },
  informateur2: {
    source: 'Informateur « Del Perro »',
    fiabilite: 2,
    dateConstatation: '2026-08-03',
  },
  rumeur: {
    source: 'Rumeur relayée en zone Sud',
    fiabilite: 1,
    dateConstatation: '2026-08-05',
  },
  filature: {
    source: 'Filature du 06/08 — véhicule banalisé',
    fiabilite: 4,
    dateConstatation: '2026-08-06',
  },
};

/** Personnes : prénom, nom, naissance, groupe, provenance. */
const PERSONNES: [
  string,
  string,
  string,
  string | null,
  keyof typeof SOURCES,
][] = [
  ['Tyron', 'Banks', '2001-04-01', 'madrina', 'fichier'],
  ['Isadora', 'Morales', '1998-11-23', null, 'fichier'],
  ['Denzel', 'Cole', '1995-02-17', 'madrina', 'interpellation'],
  ['Yasmine', 'Karim', '1999-06-08', 'madrina', 'planque'],
  ['Marcus', 'Webb', '1988-09-30', 'madrina', 'informateur'],
  ['Elena', 'Ruiz', '1993-12-11', 'madrina', 'temoin'],
  ['Omar', 'Diallo', '2000-03-25', 'ballas', 'interpellation'],
  ['Keisha', 'Monroe', '1997-08-14', 'ballas', 'planque'],
  ['Travis', 'Nguyen', '1991-01-19', 'ballas', 'fichier'],
  ['Priya', 'Anand', '1996-05-02', 'ballas', 'informateur2'],
  ['Dante', 'Rossi', '1989-10-27', 'ballas', 'videosurveillance'],
  ['Camila', 'Vega', '1994-07-16', 'vagos', 'fichier'],
  ['Hugo', 'Sandoval', '1992-04-09', 'vagos', 'interpellation'],
  ['Nadia', 'Petrov', '2002-02-28', 'vagos', 'planque'],
  ['Rashid', 'Haddad', '1990-11-05', 'vagos', 'informateur'],
  ['Lena', 'Fischer', '1998-03-13', 'vagos', 'temoin'],
  ['Bruno', 'Ferreira', '1987-06-21', 'triades', 'fichier'],
  ['Mei', 'Chen', '1995-09-09', 'triades', 'planque'],
  ['Victor', 'Alvarez', '1993-01-30', 'triades', 'informateur2'],
  ['Sofia', 'Lindqvist', '2001-12-04', 'triades', 'videosurveillance'],
  ['Jamal', 'Okafor', '1986-08-23', 'triades', 'interpellation'],
  ['Ana', 'Silva', '1999-10-18', null, 'temoin'],
  ['Kevin', 'Barnes', '1997-02-06', null, 'rumeur'],
  ['Zoé', 'Marchand', '2000-07-29', null, 'filature'],
  ['Idris', 'Traoré', '1994-05-15', null, 'informateur'],
];

/** Véhicules : plaque, modèle, couleur, propriétaire, provenance. */
const VEHICULES: [
  string,
  string,
  string,
  string | null,
  keyof typeof SOURCES,
][] = [
  ['20DCC874', 'Komoda', 'gris', 'Tyron Banks', 'planque'],
  ['8KLM204', 'Sultan', 'noir', 'Isadora Morales', 'fichier'],
  ['4RTQ118', 'Buffalo', 'blanc', 'Isadora Morales', 'fichier'],
  ['7XPD563', 'Sentinel', 'noir', 'Denzel Cole', 'interpellation'],
  ['2FGH901', 'Elegy', 'rouge', 'Yasmine Karim', 'planque'],
  ['9LMN447', 'Dominator', 'noir', 'Marcus Webb', 'videosurveillance'],
  ['5QRS220', 'Sultan', 'bleu', 'Omar Diallo', 'fichier'],
  ['3TUV886', 'Banshee', 'blanc', 'Keisha Monroe', 'planque'],
  ['6WXY104', 'Futo', 'gris', 'Travis Nguyen', 'fichier'],
  ['1ABC759', 'Kuruma', 'noir', 'Dante Rossi', 'videosurveillance'],
  ['8DEF332', 'Schafter', 'gris', 'Camila Vega', 'fichier'],
  ['4GHI615', 'Blista', 'rouge', 'Hugo Sandoval', 'interpellation'],
  ['7JKL028', 'Rebla', 'blanc', 'Nadia Petrov', 'planque'],
  ['2MNO941', 'Tailgater', 'noir', 'Bruno Ferreira', 'fichier'],
  ['9PQR574', 'Baller', 'gris', 'Mei Chen', 'filature'],
  ['5STU207', 'Oracle', 'bleu', 'Victor Alvarez', 'informateur2'],
  ['6VWX830', 'Jackal', 'noir', 'Jamal Okafor', 'interpellation'],
  ['3YZA463', 'Fugitive', 'blanc', 'Ana Silva', 'temoin'],
  ['1BCD196', 'Warrener', 'rouge', null, 'rumeur'],
  ['8EFG729', 'Panto', 'gris', null, 'informateur'],
];

/** Lieux : nom, adresse, QG de, provenance. */
const LIEUX: [string, string, string | null, keyof typeof SOURCES][] = [
  ['Villa Madrina', 'Vinewood Hills', 'madrina', 'planque'],
  ['Entrepôt Cypress', 'Cypress Flats', 'ballas', 'informateur'],
  ['Garage Sandy', 'Sandy Shores', 'vagos', 'planque'],
  ['Blanchisserie Chinatown', 'Little Seoul', 'triades', 'informateur2'],
  ['Bijouterie Sud', 'Rockford Hills', null, 'interpellation'],
  ['Autoroute Senora', 'Grand Senora Desert', null, 'interpellation'],
  ['Station Route 68', 'Route 68', null, 'videosurveillance'],
  ['Motel Pink Cage', 'Sandy Shores', null, 'informateur'],
  ['Parking Del Perro', 'Del Perro Pier', null, 'planque'],
  ['Docks Elysian', 'Elysian Island', null, 'filature'],
  ['Bar Yellow Jack', 'Sandy Shores', null, 'temoin'],
  ['Dépôt Murrieta', 'Murrieta Heights', null, 'rumeur'],
];

/** Événements : nom, date, lieu, revendiqué par, provenance. */
const EVENEMENTS: [
  string,
  string,
  string,
  string | null,
  keyof typeof SOURCES,
][] = [
  [
    'Braquage bijouterie',
    '2026-07-12T22:30:00.000Z',
    'Bijouterie Sud',
    'madrina',
    'interpellation',
  ],
  [
    'Braquage fourgon',
    '2026-07-24T04:15:00.000Z',
    'Autoroute Senora',
    null,
    'interpellation',
  ],
  [
    'Braquage station Route 68',
    '2026-08-01T02:40:00.000Z',
    'Station Route 68',
    'ballas',
    'videosurveillance',
  ],
  [
    'Rixe Yellow Jack',
    '2026-07-19T23:50:00.000Z',
    'Bar Yellow Jack',
    null,
    'temoin',
  ],
  [
    'Saisie Cypress',
    '2026-07-28T06:20:00.000Z',
    'Entrepôt Cypress',
    null,
    'interpellation',
  ],
  [
    'Livraison Docks Elysian',
    '2026-08-06T01:10:00.000Z',
    'Docks Elysian',
    'triades',
    'filature',
  ],
  [
    'Rendez-vous Del Perro',
    '2026-08-03T21:05:00.000Z',
    'Parking Del Perro',
    null,
    'informateur2',
  ],
  [
    'Course sauvage Senora',
    '2026-07-31T01:30:00.000Z',
    'Autoroute Senora',
    'vagos',
    'rumeur',
  ],
];

/** Présences : personne, événement, nature du lien, provenance. */
const PRESENCES: [
  string,
  string,
  'interpelle_lors_de' | 'present_lors_de',
  keyof typeof SOURCES,
][] = [
  [
    'Tyron Banks',
    'Braquage bijouterie',
    'interpelle_lors_de',
    'interpellation',
  ],
  [
    'Denzel Cole',
    'Braquage bijouterie',
    'interpelle_lors_de',
    'interpellation',
  ],
  ['Tyron Banks', 'Braquage fourgon', 'present_lors_de', 'videosurveillance'],
  ['Yasmine Karim', 'Braquage fourgon', 'present_lors_de', 'temoin'],
  [
    'Omar Diallo',
    'Braquage station Route 68',
    'interpelle_lors_de',
    'videosurveillance',
  ],
  [
    'Keisha Monroe',
    'Braquage station Route 68',
    'present_lors_de',
    'informateur2',
  ],
  ['Dante Rossi', 'Rixe Yellow Jack', 'interpelle_lors_de', 'interpellation'],
  ['Hugo Sandoval', 'Rixe Yellow Jack', 'present_lors_de', 'temoin'],
  ['Priya Anand', 'Saisie Cypress', 'interpelle_lors_de', 'interpellation'],
  ['Travis Nguyen', 'Saisie Cypress', 'present_lors_de', 'planque'],
  ['Mei Chen', 'Livraison Docks Elysian', 'present_lors_de', 'filature'],
  ['Bruno Ferreira', 'Livraison Docks Elysian', 'present_lors_de', 'filature'],
  [
    'Victor Alvarez',
    'Rendez-vous Del Perro',
    'present_lors_de',
    'informateur2',
  ],
  // Le fil qui traverse : Isadora est vue à un rendez-vous des Triades sans
  // qu'aucun lien ne la rattache à un groupe.
  [
    'Isadora Morales',
    'Rendez-vous Del Perro',
    'present_lors_de',
    'informateur2',
  ],
  ['Camila Vega', 'Course sauvage Senora', 'present_lors_de', 'rumeur'],
  ['Nadia Petrov', 'Course sauvage Senora', 'present_lors_de', 'rumeur'],
  ['Zoé Marchand', 'Rendez-vous Del Perro', 'present_lors_de', 'filature'],
];

/** Véhicules vus lors d'un événement : plaque, événement, provenance. */
const VEHICULES_SUR_EVENEMENT: [string, string, keyof typeof SOURCES][] = [
  ['8KLM204', 'Braquage bijouterie', 'videosurveillance'],
  ['20DCC874', 'Braquage bijouterie', 'planque'],
  ['4RTQ118', 'Braquage fourgon', 'interpellation'],
  ['9LMN447', 'Braquage fourgon', 'temoin'],
  ['5QRS220', 'Braquage station Route 68', 'videosurveillance'],
  ['1ABC759', 'Braquage station Route 68', 'videosurveillance'],
  ['3TUV886', 'Rixe Yellow Jack', 'temoin'],
  ['6WXY104', 'Saisie Cypress', 'interpellation'],
  ['9PQR574', 'Livraison Docks Elysian', 'filature'],
  ['2MNO941', 'Livraison Docks Elysian', 'filature'],
  // 8KLM204 réapparaît sur un troisième événement : c'est le véhicule qui
  // relie trois dossiers et qui doit ressortir en récurrence.
  ['8KLM204', 'Rendez-vous Del Perro', 'informateur2'],
  ['5STU207', 'Rendez-vous Del Perro', 'informateur2'],
  ['8DEF332', 'Course sauvage Senora', 'rumeur'],
  ['7JKL028', 'Course sauvage Senora', 'rumeur'],
  ['1BCD196', 'Rendez-vous Del Perro', 'rumeur'],
];

/** Véhicules utilisés par un groupe : plaque, groupe, provenance. */
const VEHICULES_DE_GROUPE: [string, string, keyof typeof SOURCES][] = [
  ['20DCC874', 'madrina', 'planque'],
  ['2FGH901', 'madrina', 'planque'],
  ['5QRS220', 'ballas', 'informateur'],
  ['3TUV886', 'ballas', 'planque'],
  ['8DEF332', 'vagos', 'informateur'],
  ['7JKL028', 'vagos', 'planque'],
  ['9PQR574', 'triades', 'filature'],
  ['2MNO941', 'triades', 'filature'],
];

/** Dossiers : nom, entité pivot, visibilité, entités suivies. */
const DOSSIERS: [string, string, Visibilite, string[]][] = [
  [
    'Groupe Madrina',
    'Madrina',
    Visibilite.public,
    ['Braquage bijouterie', 'Villa Madrina', 'Tyron Banks', '20DCC874'],
  ],
  [
    'Ballas — Cypress',
    'Ballas',
    Visibilite.public,
    ['Entrepôt Cypress', 'Saisie Cypress', 'Braquage station Route 68'],
  ],
  [
    'Vagos — Sandy Shores',
    'Vagos',
    Visibilite.public,
    ['Garage Sandy', 'Course sauvage Senora'],
  ],
  [
    'Triades — Elysian',
    'Triades',
    Visibilite.restreint,
    ['Blanchisserie Chinatown', 'Livraison Docks Elysian', 'Docks Elysian'],
  ],
  [
    'Morales',
    'Isadora Morales',
    Visibilite.public,
    ['8KLM204', '4RTQ118', 'Rendez-vous Del Perro'],
  ],
  [
    'Braquages en série',
    'Braquage fourgon',
    Visibilite.public,
    ['Braquage bijouterie', 'Braquage station Route 68', 'Autoroute Senora'],
  ],
  // Une enquête interne : le dossier est privé, l'agent visé reste public.
  [
    'Contrôle interne — dossier 41',
    'Kevin Barnes',
    Visibilite.prive,
    ['Motel Pink Cage', 'Dépôt Murrieta'],
  ],
];

@Injectable()
export class SimulationService {
  private readonly journal = new Logger(SimulationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly madrina: MadrinaService,
    private readonly entites: EntitesService,
    private readonly faits: FaitsService,
    private readonly dossiers: DossiersService,
  ) {}

  /**
   * Peuple une instance vierge.
   *
   * L'ordre suit celui d'une enquête réelle, et celui qu'impose le modèle :
   * une entité doit exister avant qu'un lien ne la désigne.
   */
  async peupler(auteurId: string): Promise<{ entites: number; faits: number }> {
    const { types, champs, liens } =
      await this.madrina.installerReferentiel(auteurId);

    const auteur = await this.resoudreAuteur(auteurId);
    const parNom = new Map<string, string>();

    const champDe = (cle: string, valeur: string | number | boolean) => ({
      definitionChampId: champs[cle],
      valeur,
    });

    // ── 1. Les organisations ──
    const GROUPES: [string, string, string, string, keyof typeof SOURCES][] = [
      [
        'madrina',
        'Madrina',
        'Orga/Cartel',
        'Stupéfiants, blanchiment présumé',
        'informateur',
      ],
      ['ballas', 'Ballas', 'Gang', 'Stupéfiants, armes', 'temoin'],
      ['vagos', 'Vagos', 'Motor Club', 'Trafic de véhicules', 'planque'],
      [
        'triades',
        'Triades',
        'Orga/Cartel',
        'Blanchiment, import',
        'informateur2',
      ],
    ];

    for (const [cle, nom, nature, business, source] of GROUPES) {
      const cree = await this.entites.creer(auteur, {
        typeEntiteId: types.groupe,
        ...SOURCES[source],
        champs: [
          champDe('groupe.nom', nom),
          champDe('groupe.type_de_groupe', nature),
          champDe('groupe.business', business),
        ],
      });

      parNom.set(cle, cree.id);
      parNom.set(nom, cree.id);
    }

    // ── 2. Les lieux, dont les QG ──
    for (const [nom, adresse, groupe, source] of LIEUX) {
      const cree = await this.entites.creer(auteur, {
        typeEntiteId: types.lieu,
        ...SOURCES[source],
        champs: [champDe('lieu.nom', nom), champDe('lieu.adresse', adresse)],
        liens: groupe
          ? [{ typeLienId: liens.qg_de, cibleId: parNom.get(groupe)! }]
          : undefined,
      });

      parNom.set(nom, cree.id);
    }

    // ── 3. Les personnes, rattachées à leur groupe ──
    for (const [prenom, nom, naissance, groupe, source] of PERSONNES) {
      const cree = await this.entites.creer(auteur, {
        typeEntiteId: types.personne,
        ...SOURCES[source],
        champs: [
          champDe('personne.prenom', prenom),
          champDe('personne.nom', nom),
          champDe('personne.date_de_naissance', naissance),
        ],
        liens: groupe
          ? [{ typeLienId: liens.membre_de, cibleId: parNom.get(groupe)! }]
          : undefined,
      });

      parNom.set(`${prenom} ${nom}`, cree.id);
    }

    // ── 4. Les véhicules et leurs propriétaires ──
    for (const [plaque, modele, couleur, proprietaire, source] of VEHICULES) {
      const cree = await this.entites.creer(auteur, {
        typeEntiteId: types.vehicule,
        ...SOURCES[source],
        champs: [
          champDe('vehicule.plaque', plaque),
          champDe('vehicule.modele', modele),
          champDe('vehicule.couleur', couleur),
        ],
      });

      parNom.set(plaque, cree.id);

      if (proprietaire) {
        await this.faits.creer(auteur, {
          sujetId: parNom.get(proprietaire)!,
          nature: 'lien',
          typeLienId: liens.proprietaire_de,
          cibleId: cree.id,
          ...SOURCES.fichier,
        });
      }
    }

    for (const [plaque, groupe, source] of VEHICULES_DE_GROUPE) {
      await this.faits.creer(auteur, {
        sujetId: parNom.get(plaque)!,
        nature: 'lien',
        typeLienId: liens.utilise_par,
        cibleId: parNom.get(groupe)!,
        ...SOURCES[source],
      });
    }

    // ── 5. Les événements ──
    for (const [nom, date, lieu, revendique, source] of EVENEMENTS) {
      const liensEvenement = [
        { typeLienId: liens.situe_a, cibleId: parNom.get(lieu)! },
      ];

      const cree = await this.entites.creer(auteur, {
        typeEntiteId: types.evenement,
        ...SOURCES[source],
        champs: [
          champDe('evenement.nom', nom),
          champDe('evenement.date_et_heure', date),
        ],
        liens: liensEvenement,
      });

      parNom.set(nom, cree.id);

      if (revendique) {
        // Une revendication n'est pas une constatation : elle reste douteuse.
        await this.faits.creer(auteur, {
          sujetId: cree.id,
          nature: 'lien',
          typeLienId: liens.revendique_par,
          cibleId: parNom.get(revendique)!,
          ...SOURCES.rumeur,
        });
      }
    }

    // ── 6. Ce qui relie les gens et les véhicules aux événements ──
    for (const [personne, evenement, type, source] of PRESENCES) {
      await this.faits.creer(auteur, {
        sujetId: parNom.get(personne)!,
        nature: 'lien',
        typeLienId: liens[type],
        cibleId: parNom.get(evenement)!,
        ...SOURCES[source],
      });
    }

    for (const [plaque, evenement, source] of VEHICULES_SUR_EVENEMENT) {
      await this.faits.creer(auteur, {
        sujetId: parNom.get(plaque)!,
        nature: 'lien',
        typeLienId: liens.utilise_lors_de,
        cibleId: parNom.get(evenement)!,
        ...SOURCES[source],
      });
    }

    // ── 7. Les dossiers, leur suivi et leurs habilitations ──
    for (const [nom, pivot, visibilite, suivis] of DOSSIERS) {
      const dossier = await this.dossiers.creer(auteurId, {
        nom,
        entitePivotId: parNom.get(pivot)!,
        visibilite,
        note:
          visibilite === Visibilite.prive
            ? 'Enquête interne. L’entité pivot reste publique — c’est le dossier qui est fermé.'
            : undefined,
      });

      for (const suivi of suivis) {
        const entiteId = parNom.get(suivi);

        if (entiteId) {
          await this.dossiers.suivre(auteurId, dossier.id, entiteId);
        }
      }
    }

    await this.marquerLesExceptions(auteur, parNom);

    const [entites, faits] = await Promise.all([
      this.prisma.sansFiltre.entite.count(),
      this.prisma.sansFiltre.fait.count(),
    ]);

    this.journal.log(`simulation peuplée — ${entites} entités, ${faits} faits`);

    return { entites, faits };
  }

  /**
   * Ce qui rend le jeu vivant plutôt que régulier : un fait infirmé, une fiche
   * archivée, des entités classées. Sans cela, l'historique, les archives et le
   * moteur de visibilité resteraient vides à l'écran.
   */
  private async marquerLesExceptions(
    auteur: AgentCourant,
    parNom: Map<string, string>,
  ): Promise<void> {
    // Un lien contredit par la vidéosurveillance.
    const aInfirmer = await this.prisma.sansFiltre.fait.findFirst({
      where: {
        sujetId: parNom.get('Kevin Barnes'),
        nature: 'lien',
        etat: EtatFait.actif,
      },
    });

    if (aInfirmer) {
      await this.faits.infirmer(
        auteur,
        aInfirmer.id,
        'Vidéosurveillance du 02/08 — la personne mise en cause était ailleurs',
      );
    }

    // Une fiche qui n'a plus lieu d'être suivie.
    const aArchiver = parNom.get('Dépôt Murrieta');

    if (aArchiver) {
      await this.entites.changerEtat(auteur, aArchiver, 'archive');
    }

    // Deux entités classées : le moteur de visibilité doit se voir à l'œil nu
    // selon le compte utilisé.
    for (const [nom, niveau] of [
      ['Motel Pink Cage', Visibilite.restreint],
      ['Blanchisserie Chinatown', Visibilite.prive],
    ] as const) {
      const id = parNom.get(nom);

      if (id) {
        await this.entites.modifier(auteur, id, { visibilite: niveau });
      }
    }
  }

  /** Reconstitue l'agent courant depuis son compte, comme le fait le garde. */
  private async resoudreAuteur(id: string): Promise<AgentCourant> {
    const agent = await this.prisma.sansFiltre.agent.findUniqueOrThrow({
      where: { id },
      include: {
        role: true,
        habilitationsDossier: { select: { dossierId: true } },
        habilitationsEntite: { select: { entiteId: true } },
      },
    });

    return {
      id: agent.id,
      matricule: agent.matricule,
      prenom: agent.prenom,
      nom: agent.nom,
      roleId: agent.roleId,
      roleCode: agent.role.code,
      superAdmin: agent.superAdmin,
      doitChangerMdp: agent.doitChangerMdp,
      permissions: agent.role.permissions as Permission[],
      dossiersHabilites: agent.habilitationsDossier.map(
        (habilitation) => habilitation.dossierId,
      ),
      entitesHabilitees: agent.habilitationsEntite.map(
        (habilitation) => habilitation.entiteId,
      ),
    };
  }
}
