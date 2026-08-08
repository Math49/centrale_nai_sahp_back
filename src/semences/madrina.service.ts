import { Injectable, Logger } from '@nestjs/common';

import type { Permission } from '../agents/permissions';
import type { AgentCourant } from '../auth/agent-courant';
import { EntitesService } from '../entites/entites.service';
import { FaitsService } from '../faits/faits.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReferentielService } from '../referentiel/referentiel.service';
import { TYPES_ENTITES, TYPES_LIENS } from '../commandes/referentiel-madrina';

/**
 * Jeu de données de développement : le parcours Madrina.
 *
 * C'est le test de non-régression du modèle, et le critère de réussite du
 * projet — Isadora Morales doit ressortir sans qu'aucun agent n'ait tracé de
 * lien entre elle et Tyron Banks. Il sert donc à la fois de données de travail
 * et de scénario de recette, jusqu'à celle d'ensemble du lot 12.
 */

/** Les sources du parcours, avec leur fiabilité et leur date de constatation. */
const SOURCES = {
  informateur: {
    source: 'Informateur — installation d’un nouveau groupe',
    fiabilite: 2,
    dateConstatation: '2026-08-05',
  },
  planque: {
    source: 'Planque du 06/08 — QG présumé',
    fiabilite: 4,
    dateConstatation: '2026-08-06',
  },
  centrale: {
    source: 'Centrale SAPD — fichier des immatriculations',
    fiabilite: 4,
    dateConstatation: '2026-08-06',
  },
  bijouterie: {
    source: 'Rapport d’intervention n°2291 — braquage bijouterie',
    fiabilite: 4,
    dateConstatation: '2026-08-07',
  },
  fourgon: {
    source: 'Rapport d’intervention n°2318 — braquage fourgon',
    fiabilite: 4,
    dateConstatation: '2026-08-13',
  },
} as const;

export interface ReferentielInstalle {
  /** Identifiant de type d'entité, par code. */
  types: Record<string, string>;
  /** Identifiant de champ, par « code_type.cle ». */
  champs: Record<string, string>;
  /** Identifiant de type de lien, par code. */
  liens: Record<string, string>;
}

@Injectable()
export class MadrinaService {
  private readonly journal = new Logger(MadrinaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly referentiel: ReferentielService,
    private readonly entites: EntitesService,
    private readonly faits: FaitsService,
  ) {}

  /** Installe types, champs, types de liens et onglets. Idempotent. */
  async installerReferentiel(auteurId: string): Promise<ReferentielInstalle> {
    const deja = await this.prisma.typeEntite.count();

    if (deja > 0) {
      this.journal.log('référentiel déjà présent — installation ignorée');
      return this.relever();
    }

    for (const description of TYPES_ENTITES) {
      const type = await this.referentiel.creerTypeEntite(auteurId, {
        code: description.code,
        libelle: description.libelle,
        libellePluriel: description.libellePluriel,
        icone: description.icone,
        modeleLibelle: description.modeleLibelle,
      });

      for (const champ of description.champs) {
        await this.referentiel.creerChamp(auteurId, {
          typeEntiteId: type.id,
          cle: champ.cle,
          libelle: champ.libelle,
          typeDonnee: champ.typeDonnee,
          obligatoire: champ.obligatoire ?? false,
          estUnique: champ.estUnique ?? false,
          multiple: champ.multiple ?? false,
          options: champ.options,
        });
      }
    }

    const types = await this.releverTypes();

    for (const description of TYPES_LIENS) {
      await this.referentiel.creerTypeLien(auteurId, {
        code: description.code,
        libelle: description.libelle,
        libelleInverse: description.libelleInverse,
        typeEntiteSourceId: types[description.source],
        typeEntiteCibleId: types[description.cible],
        multiple: description.multiple ?? true,
      });
    }

    const liens = await this.releverLiens();

    for (const description of TYPES_ENTITES) {
      for (const onglet of description.onglets) {
        const cree = await this.referentiel.creerOnglet(auteurId, {
          typeEntiteId: types[description.code],
          libelle: onglet.libelle,
        });

        await this.referentiel.composerOnglet(auteurId, cree.id, {
          typesLiens: onglet.liens.map((lien) => ({
            typeLienId: liens[lien.code],
            sens: lien.sens,
          })),
        });
      }
    }

    this.journal.log(
      `référentiel installé : ${TYPES_ENTITES.length} types, ${TYPES_LIENS.length} types de liens`,
    );

    return this.relever();
  }

  /**
   * Rejoue le parcours de l'annexe B.
   *
   * L'ordre de création est contraint : une entité doit exister avant qu'un
   * lien ne la désigne. C'est la même contrainte que celle de la création en
   * cascade côté front, où l'entité créée est persistée avant le lien.
   */
  async peuplerParcours(auteurId: string): Promise<Record<string, string>> {
    const { types, champs, liens } = await this.relever();
    const entites: Record<string, string> = {};

    // Les services d'écriture prennent l'agent courant, pas son identifiant :
    // ils contrôlent la visibilité de ce qu'ils touchent. On le reconstitue
    // depuis le compte, comme le ferait le garde d'authentification.
    const auteur = await this.resoudreAuteur(auteurId);

    const champ = (cle: string, valeur: string | number | boolean) => ({
      definitionChampId: champs[cle],
      valeur,
    });

    // 1 — le groupe, point de départ de l'enquête
    const madrina = await this.entites.creer(auteur, {
      typeEntiteId: types.groupe,
      ...SOURCES.informateur,
      note: 'Nouveau groupe, très discret, cherche des informations sur la SAPD. À surveiller.',
      champs: [
        champ('groupe.nom', 'Madrina'),
        champ('groupe.type_de_groupe', 'Orga/Cartel'),
      ],
    });
    entites.madrina = madrina.id;

    // 2 — le QG relevé lors de la planque
    const villa = await this.entites.creer(auteur, {
      typeEntiteId: types.lieu,
      ...SOURCES.planque,
      champs: [
        champ('lieu.nom', 'Villa Madrina'),
        champ('lieu.adresse', 'Vinewood Hills'),
      ],
      liens: [{ typeLienId: liens.qg_de, cibleId: madrina.id }],
    });
    entites.villa = villa.id;

    // 3 — une plaque relevée devant la villa
    const komoda = await this.entites.creer(auteur, {
      typeEntiteId: types.vehicule,
      ...SOURCES.planque,
      champs: [
        champ('vehicule.plaque', '20DCC874'),
        champ('vehicule.modele', 'Komoda'),
        champ('vehicule.couleur', 'gris'),
      ],
      liens: [{ typeLienId: liens.utilise_par, cibleId: madrina.id }],
    });
    entites.komoda = komoda.id;

    // 4 — son propriétaire, trouvé à la centrale SAPD
    const tyron = await this.entites.creer(auteur, {
      typeEntiteId: types.personne,
      ...SOURCES.centrale,
      champs: [
        champ('personne.prenom', 'Tyron'),
        champ('personne.nom', 'Banks'),
        champ('personne.date_de_naissance', '2001-04-01'),
      ],
      liens: [
        { typeLienId: liens.proprietaire_de, cibleId: komoda.id },
        {
          typeLienId: liens.membre_de,
          cibleId: madrina.id,
          ...SOURCES.planque,
        },
      ],
    });
    entites.tyron = tyron.id;

    // 5 — premier braquage
    const bijouterie = await this.entites.creer(auteur, {
      typeEntiteId: types.lieu,
      ...SOURCES.bijouterie,
      champs: [
        champ('lieu.nom', 'Bijouterie Sud'),
        champ('lieu.adresse', 'Rockford Hills'),
      ],
    });
    entites.bijouterie = bijouterie.id;

    const braquageBijouterie = await this.entites.creer(auteur, {
      typeEntiteId: types.evenement,
      ...SOURCES.bijouterie,
      champs: [
        champ('evenement.nom', 'Braquage bijouterie'),
        champ('evenement.date_et_heure', '2026-08-01T22:30:00.000Z'),
      ],
      liens: [
        { typeLienId: liens.situe_a, cibleId: bijouterie.id },
        {
          typeLienId: liens.revendique_par,
          cibleId: madrina.id,
          // Une revendication n'est pas une constatation.
          source: 'Rumeur relayée par un informateur',
          fiabilite: 2,
          dateConstatation: '2026-08-08',
        },
      ],
    });
    entites.braquageBijouterie = braquageBijouterie.id;

    // 6 — un véhicule présent au braquage, et sa propriétaire
    const sultan = await this.entites.creer(auteur, {
      typeEntiteId: types.vehicule,
      ...SOURCES.bijouterie,
      champs: [
        champ('vehicule.plaque', '8KLM204'),
        champ('vehicule.modele', 'Sultan'),
        champ('vehicule.couleur', 'noir'),
      ],
      liens: [
        { typeLienId: liens.utilise_lors_de, cibleId: braquageBijouterie.id },
      ],
    });
    entites.sultan = sultan.id;

    const isadora = await this.entites.creer(auteur, {
      typeEntiteId: types.personne,
      ...SOURCES.centrale,
      champs: [
        champ('personne.prenom', 'Isadora'),
        champ('personne.nom', 'Morales'),
        champ('personne.date_de_naissance', '1998-11-23'),
      ],
      liens: [{ typeLienId: liens.proprietaire_de, cibleId: sultan.id }],
    });
    entites.isadora = isadora.id;

    // 7 — second braquage, un mois plus tard
    const autoroute = await this.entites.creer(auteur, {
      typeEntiteId: types.lieu,
      ...SOURCES.fourgon,
      champs: [champ('lieu.nom', 'Autoroute Senora')],
    });
    entites.autoroute = autoroute.id;

    const braquageFourgon = await this.entites.creer(auteur, {
      typeEntiteId: types.evenement,
      ...SOURCES.fourgon,
      champs: [
        champ('evenement.nom', 'Braquage fourgon'),
        champ('evenement.date_et_heure', '2026-08-12T04:15:00.000Z'),
      ],
      liens: [{ typeLienId: liens.situe_a, cibleId: autoroute.id }],
    });
    entites.braquageFourgon = braquageFourgon.id;

    const buffalo = await this.entites.creer(auteur, {
      typeEntiteId: types.vehicule,
      ...SOURCES.fourgon,
      champs: [
        champ('vehicule.plaque', '4RTQ118'),
        champ('vehicule.modele', 'Buffalo'),
        champ('vehicule.couleur', 'blanc'),
      ],
      liens: [
        { typeLienId: liens.utilise_lors_de, cibleId: braquageFourgon.id },
      ],
    });
    entites.buffalo = buffalo.id;

    // 8 — les faits qui referment la boucle, saisis depuis les rapports
    //
    // Aucun ne relie Isadora à Tyron. Le rapprochement tombera seul, par le
    // graphe : les véhicules d'Isadora sont présents aux deux événements où
    // Tyron apparaît.
    await this.faits.creer(auteur, {
      sujetId: tyron.id,
      nature: 'lien',
      typeLienId: liens.interpelle_lors_de,
      cibleId: braquageBijouterie.id,
      ...SOURCES.bijouterie,
    });

    await this.faits.creer(auteur, {
      sujetId: tyron.id,
      nature: 'lien',
      typeLienId: liens.present_lors_de,
      cibleId: braquageFourgon.id,
      ...SOURCES.fourgon,
    });

    await this.faits.creer(auteur, {
      sujetId: isadora.id,
      nature: 'lien',
      typeLienId: liens.proprietaire_de,
      cibleId: buffalo.id,
      ...SOURCES.centrale,
    });

    // Une seconde source confirme la couleur du Komoda : deux faits portent la
    // même affirmation, ce qui doit produire le signal de multi-sources sans
    // rien revaloriser automatiquement.
    await this.faits.creer(auteur, {
      sujetId: komoda.id,
      nature: 'champ',
      definitionChampId: champs['vehicule.couleur'],
      valeur: 'gris',
      ...SOURCES.bijouterie,
    });

    this.journal.log(
      `parcours Madrina peuplé : ${Object.keys(entites).length} entités`,
    );

    return entites;
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

  private async releverTypes(): Promise<Record<string, string>> {
    const types = await this.prisma.typeEntite.findMany();
    return Object.fromEntries(types.map((type) => [type.code, type.id]));
  }

  private async releverLiens(): Promise<Record<string, string>> {
    const liens = await this.prisma.typeLien.findMany();
    return Object.fromEntries(liens.map((lien) => [lien.code, lien.id]));
  }

  private async relever(): Promise<ReferentielInstalle> {
    const [types, liens, champs] = await Promise.all([
      this.releverTypes(),
      this.releverLiens(),
      this.prisma.definitionChamp.findMany({ include: { typeEntite: true } }),
    ]);

    return {
      types,
      liens,
      champs: Object.fromEntries(
        champs.map((champ) => [
          `${champ.typeEntite.code}.${champ.cle}`,
          champ.id,
        ]),
      ),
    };
  }
}
