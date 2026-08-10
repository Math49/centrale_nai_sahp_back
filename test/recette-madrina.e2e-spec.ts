import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';

import { CODE_ETAT_MAJOR, CODE_JUNIOR } from '../src/agents/grades';
import { AppModule } from '../src/app.module';
import { DossiersService } from '../src/dossiers/dossiers.service';
import type { FicheEntiteDto } from '../src/entites/entites.dto';
import type { CheminsDto, VoisinageDto } from '../src/graphe/graphe.dto';
import { PrismaService } from '../src/prisma/prisma.service';
import { MadrinaService } from '../src/semences/madrina.service';
import type { AccueilDto } from '../src/signaux/signaux.dto';
import {
  creerCompteActif,
  reinitialiserLaBase,
  type Compte,
} from './aide-comptes';

/**
 * **Recette d'ensemble du projet.**
 *
 * Sur une instance vierge, le parcours Madrina de l'annexe B est rejoué de bout
 * en bout — par l'API, comme un agent le ferait, et non par les services — et
 * doit faire ressortir Isadora Morales **sans qu'aucun lien direct n'ait été
 * tracé entre elle et Tyron Banks**.
 *
 * C'est le critère de réussite énoncé par l'étude du besoin et repris par la
 * conception technique. Tout le reste — le modèle, la visibilité, le graphe,
 * les signaux — n'existe que pour rendre ce moment possible.
 *
 * Le parcours est joué par un **Junior**, avec la répartition initiale des
 * permissions : si la recette demandait un État-Major, la plateforme ne
 * servirait pas à ceux pour qui elle est faite.
 */
describe('Recette d’ensemble — le parcours Madrina', () => {
  let application: INestApplication;
  let serveur: Server;
  let prisma: PrismaService;
  let dossiers: DossiersService;

  let superAdmin: Compte;
  let etatMajor: Compte;
  let agent: Compte;

  let types: Record<string, string>;
  let champs: Record<string, string>;
  let liens: Record<string, string>;

  /** Identifiants des entités, au fur et à mesure de la saisie. */
  const fiches: Record<string, string> = {};

  const enTantQue = (compte: Compte) => ({
    Authorization: `Bearer ${compte.jeton}`,
  });

  const champ = (cle: string, valeur: string) => ({
    definitionChampId: champs[cle],
    valeur,
  });

  /** Crée une entité par l'API, comme le ferait le formulaire dynamique. */
  const saisir = async (
    nom: string,
    corps: Record<string, unknown>,
  ): Promise<string> => {
    const reponse = await request(serveur)
      .post('/entites')
      .set(enTantQue(agent))
      .send(corps)
      .expect(201);

    const fiche = reponse.body as FicheEntiteDto;
    fiches[nom] = fiche.id;
    return fiche.id;
  };

  const poser = async (corps: Record<string, unknown>): Promise<void> => {
    await request(serveur)
      .post('/faits')
      .set(enTantQue(agent))
      .send(corps)
      .expect(201);
  };

  const chemin = async (de: string, vers: string): Promise<CheminsDto> =>
    (
      await request(serveur)
        .get('/graphe/chemin')
        .query({ de, vers })
        .set(enTantQue(agent))
        .expect(200)
    ).body as CheminsDto;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    application = module.createNestApplication();
    application.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await application.init();

    serveur = application.getHttpServer() as Server;
    prisma = application.get(PrismaService);
    dossiers = application.get(DossiersService);

    await reinitialiserLaBase(application);
  }, 60_000);

  afterAll(async () => {
    await application?.close();
  });

  // ─────────────────────────── Mise en service ───────────────────────────

  describe('mise en service d’une instance vierge', () => {
    it('part d’une base sans rien', async () => {
      const [entites, typesEntites, agents] = await Promise.all([
        prisma.sansFiltre.entite.count(),
        prisma.sansFiltre.typeEntite.count(),
        prisma.sansFiltre.agent.count(),
      ]);

      expect(entites).toBe(0);
      expect(typesEntites).toBe(0);
      expect(agents).toBe(0);
    });

    it('ouvre les comptes, dont un super-admin', async () => {
      superAdmin = await creerCompteActif(application, {
        matricule: '2291',
        prenom: 'Mathis',
        nom: 'Mercier',
        roleCode: CODE_ETAT_MAJOR,
        superAdmin: true,
      });

      etatMajor = await creerCompteActif(application, {
        matricule: 'em-401',
        prenom: 'Alix',
        nom: 'Reyes',
        roleCode: CODE_ETAT_MAJOR,
      });

      agent = await creerCompteActif(application, {
        matricule: 'ji-402',
        prenom: 'Sasha',
        nom: 'Vane',
        roleCode: CODE_JUNIOR,
      });

      expect(agent.jeton).toBeTruthy();
    });

    it('installe le référentiel, et rien d’autre', async () => {
      // Le même chemin de code que `npm run referentiel:initial`.
      const installe = await application
        .get(MadrinaService)
        .installerReferentiel(superAdmin.id);

      types = installe.types;
      champs = installe.champs;
      liens = installe.liens;

      expect(Object.keys(types).length).toBeGreaterThanOrEqual(5);
      expect(await prisma.sansFiltre.entite.count()).toBe(0);
    });
  });

  // ──────────────────────── Le parcours, en saisie ────────────────────────

  describe('le parcours de l’annexe B, saisi par un Junior', () => {
    it('1 — un informateur signale un nouveau groupe', async () => {
      await saisir('madrina', {
        typeEntiteId: types.groupe,
        source: 'Informateur — installation d’un nouveau groupe',
        fiabilite: 2,
        dateConstatation: '2026-08-05',
        note: 'Nouveau groupe, très discret, cherche des informations sur la SAPD.',
        champs: [
          champ('groupe.nom', 'Madrina'),
          champ('groupe.type_de_groupe', 'Orga/Cartel'),
        ],
      });
    });

    it('2 — une planque relève le QG et une plaque devant', async () => {
      await saisir('villa', {
        typeEntiteId: types.lieu,
        source: 'Planque du 06/08 — QG présumé',
        fiabilite: 4,
        dateConstatation: '2026-08-06',
        champs: [
          champ('lieu.nom', 'Villa Madrina'),
          champ('lieu.adresse', 'Vinewood Hills'),
        ],
        liens: [{ typeLienId: liens.qg_de, cibleId: fiches.madrina }],
      });

      await saisir('komoda', {
        typeEntiteId: types.vehicule,
        source: 'Planque du 06/08 — QG présumé',
        fiabilite: 4,
        dateConstatation: '2026-08-06',
        champs: [
          champ('vehicule.plaque', '20DCC874'),
          champ('vehicule.modele', 'Komoda'),
          champ('vehicule.couleur', 'gris'),
        ],
        liens: [{ typeLienId: liens.utilise_par, cibleId: fiches.madrina }],
      });
    });

    it('3 — la centrale SAPD donne le propriétaire de la plaque', async () => {
      await saisir('tyron', {
        typeEntiteId: types.personne,
        source: 'Centrale SAPD — fichier des immatriculations',
        fiabilite: 4,
        dateConstatation: '2026-08-06',
        champs: [
          champ('personne.prenom', 'Tyron'),
          champ('personne.nom', 'Banks'),
          champ('personne.date_de_naissance', '2001-04-01'),
        ],
        liens: [
          { typeLienId: liens.proprietaire_de, cibleId: fiches.komoda },
          {
            typeLienId: liens.membre_de,
            cibleId: fiches.madrina,
            source: 'Planque du 06/08 — QG présumé',
            fiabilite: 4,
            dateConstatation: '2026-08-06',
          },
        ],
      });
    });

    it('4 — un braquage, revendiqué par rumeur', async () => {
      await saisir('bijouterie', {
        typeEntiteId: types.lieu,
        source: 'Rapport d’intervention n°2291 — braquage bijouterie',
        fiabilite: 4,
        dateConstatation: '2026-08-07',
        champs: [
          champ('lieu.nom', 'Bijouterie Sud'),
          champ('lieu.adresse', 'Rockford Hills'),
        ],
      });

      await saisir('braquageBijouterie', {
        typeEntiteId: types.evenement,
        source: 'Rapport d’intervention n°2291 — braquage bijouterie',
        fiabilite: 4,
        dateConstatation: '2026-08-07',
        champs: [
          champ('evenement.nom', 'Braquage bijouterie'),
          champ('evenement.date_et_heure', '2026-08-01T22:30:00.000Z'),
        ],
        liens: [
          { typeLienId: liens.situe_a, cibleId: fiches.bijouterie },
          {
            typeLienId: liens.revendique_par,
            cibleId: fiches.madrina,
            // Une revendication n'est pas une constatation.
            source: 'Rumeur relayée par un informateur',
            fiabilite: 2,
            dateConstatation: '2026-08-08',
          },
        ],
      });
    });

    it('5 — un véhicule aperçu au braquage, et sa propriétaire', async () => {
      await saisir('sultan', {
        typeEntiteId: types.vehicule,
        source: 'Rapport d’intervention n°2291 — braquage bijouterie',
        fiabilite: 4,
        dateConstatation: '2026-08-07',
        champs: [
          champ('vehicule.plaque', '8KLM204'),
          champ('vehicule.modele', 'Sultan'),
          champ('vehicule.couleur', 'noir'),
        ],
        liens: [
          {
            typeLienId: liens.utilise_lors_de,
            cibleId: fiches.braquageBijouterie,
          },
        ],
      });

      await saisir('isadora', {
        typeEntiteId: types.personne,
        source: 'Centrale SAPD — fichier des immatriculations',
        fiabilite: 4,
        dateConstatation: '2026-08-06',
        champs: [
          champ('personne.prenom', 'Isadora'),
          champ('personne.nom', 'Morales'),
          champ('personne.date_de_naissance', '1998-11-23'),
        ],
        liens: [{ typeLienId: liens.proprietaire_de, cibleId: fiches.sultan }],
      });
    });

    it('6 — un second braquage, un mois plus tard', async () => {
      await saisir('autoroute', {
        typeEntiteId: types.lieu,
        source: 'Rapport d’intervention n°2318 — braquage fourgon',
        fiabilite: 4,
        dateConstatation: '2026-08-13',
        champs: [champ('lieu.nom', 'Autoroute Senora')],
      });

      await saisir('braquageFourgon', {
        typeEntiteId: types.evenement,
        source: 'Rapport d’intervention n°2318 — braquage fourgon',
        fiabilite: 4,
        dateConstatation: '2026-08-13',
        champs: [
          champ('evenement.nom', 'Braquage fourgon'),
          champ('evenement.date_et_heure', '2026-08-12T04:15:00.000Z'),
        ],
        liens: [{ typeLienId: liens.situe_a, cibleId: fiches.autoroute }],
      });

      await saisir('buffalo', {
        typeEntiteId: types.vehicule,
        source: 'Rapport d’intervention n°2318 — braquage fourgon',
        fiabilite: 4,
        dateConstatation: '2026-08-13',
        champs: [
          champ('vehicule.plaque', '4RTQ118'),
          champ('vehicule.modele', 'Buffalo'),
          champ('vehicule.couleur', 'blanc'),
        ],
        liens: [
          {
            typeLienId: liens.utilise_lors_de,
            cibleId: fiches.braquageFourgon,
          },
        ],
      });
    });

    it('7 — les faits qui referment la boucle', async () => {
      await poser({
        sujetId: fiches.tyron,
        nature: 'lien',
        typeLienId: liens.interpelle_lors_de,
        cibleId: fiches.braquageBijouterie,
        source: 'Rapport d’intervention n°2291 — braquage bijouterie',
        fiabilite: 4,
        dateConstatation: '2026-08-07',
      });

      await poser({
        sujetId: fiches.tyron,
        nature: 'lien',
        typeLienId: liens.present_lors_de,
        cibleId: fiches.braquageFourgon,
        source: 'Rapport d’intervention n°2318 — braquage fourgon',
        fiabilite: 4,
        dateConstatation: '2026-08-13',
      });

      await poser({
        sujetId: fiches.isadora,
        nature: 'lien',
        typeLienId: liens.proprietaire_de,
        cibleId: fiches.buffalo,
        source: 'Centrale SAPD — fichier des immatriculations',
        fiabilite: 4,
        dateConstatation: '2026-08-06',
      });

      expect(await prisma.sansFiltre.entite.count()).toBe(11);
    });
  });

  // ──────────────────────────── Le critère ────────────────────────────

  describe('le critère de réussite', () => {
    it('AUCUN fait ne relie Isadora Morales à Tyron Banks', async () => {
      // La vérification porte sur toute la base, sans filtre : c'est la clause
      // que tout le reste doit respecter, et elle ne souffre pas d'exception.
      const direct = await prisma.sansFiltre.fait.count({
        where: {
          OR: [
            { sujetId: fiches.isadora, cibleId: fiches.tyron },
            { sujetId: fiches.tyron, cibleId: fiches.isadora },
          ],
        },
      });

      expect(direct).toBe(0);
    });

    it('et pourtant le graphe les relie', async () => {
      const resultat = await chemin(fiches.isadora, fiches.tyron);

      expect(resultat.plusCourt).not.toBeNull();

      const etapes = resultat.plusCourt!.noeuds.map((noeud) => noeud.libelle);

      expect(etapes[0]).toBe('Isadora Morales');
      expect(etapes[etapes.length - 1]).toBe('Tyron Banks');

      // Le trajet passe par un de ses véhicules, puis par un événement où
      // Tyron apparaît. Personne n'a tracé ce rapprochement.
      expect(
        etapes.some(
          (libelle) => libelle === '8KLM204' || libelle === '4RTQ118',
        ),
      ).toBe(true);
      expect(etapes.some((libelle) => libelle.startsWith('Braquage'))).toBe(
        true,
      );
    });

    it('la relie aussi au QG du groupe', async () => {
      const resultat = await chemin(fiches.isadora, fiches.villa);

      expect(resultat.plusCourt).not.toBeNull();
      expect(resultat.plusCourt!.longueur).toBeGreaterThan(2);
    });

    it('et le chemin vaut son maillon le plus faible', async () => {
      const resultat = await chemin(fiches.isadora, fiches.villa);

      const minimum = Math.min(
        ...resultat.plusCourt!.aretes.map((arete) => arete.fiabilite),
      );

      expect(resultat.plusCourt!.maillonLeFaible).toBe(minimum);
    });

    it('Isadora ressort seule, par le signal de récurrence', async () => {
      // Deux enquêtes ouvertes séparément, sans que personne ne les rapproche.
      const enquete = await dossiers.creer(agent.id, {
        nom: 'Groupe Madrina',
        entitePivotId: fiches.madrina,
      });
      const morales = await dossiers.creer(agent.id, {
        nom: 'Morales',
        entitePivotId: fiches.isadora,
      });

      await dossiers.suivre(agent.id, enquete.id, fiches.braquageBijouterie);

      const accueil = (
        await request(serveur).get('/accueil').set(enTantQue(agent)).expect(200)
      ).body as AccueilDto;

      const surLeSultan = accueil.signaux.filter(
        (signal) => signal.entiteId === fiches.sultan,
      );

      expect(
        surLeSultan.some((signal) => signal.famille === 'recurrence'),
      ).toBe(true);

      // Et les deux dossiers de l'agent lui sont rendus.
      expect(accueil.mesDossiers.map((dossier) => dossier.id).sort()).toEqual(
        [enquete.id, morales.id].sort(),
      );
    });

    it('le voisinage d’Isadora la montre marquée comme récurrente', async () => {
      const vue = (
        await request(serveur)
          .get('/graphe')
          .query({ depuis: fiches.sultan, profondeur: 2 })
          .set(enTantQue(agent))
          .expect(200)
      ).body as VoisinageDto;

      const sultan = vue.noeuds.find((noeud) => noeud.id === fiches.sultan)!;

      expect(sultan.recurrence).toBe(true);
      expect(vue.noeuds.map((noeud) => noeud.libelle)).toContain('Tyron Banks');
    });
  });

  // ────────────────────── Ce que la plateforme a tenu ──────────────────────

  describe('les invariants, sur le parcours réel', () => {
    it('aucun fait n’existe sans source', async () => {
      const sansSource = await prisma.sansFiltre.fait.count({
        where: { source: '' },
      });

      expect(sansSource).toBe(0);
    });

    it('un lien est une arête unique, lue des deux côtés', async () => {
      const [madrina, tyron] = await Promise.all([
        request(serveur)
          .get(`/entites/${fiches.madrina}`)
          .set(enTantQue(agent))
          .expect(200),
        request(serveur)
          .get(`/entites/${fiches.tyron}`)
          .set(enTantQue(agent))
          .expect(200),
      ]);

      const depuisLeGroupe = (madrina.body as FicheEntiteDto).liens.find(
        (lien) => lien.autreEntite.id === fiches.tyron,
      )!;
      const depuisLaPersonne = (tyron.body as FicheEntiteDto).liens.find(
        (lien) => lien.autreEntite.id === fiches.madrina,
      )!;

      // Le même fait, vu depuis ses deux extrémités : un seul en base.
      expect(depuisLeGroupe.faitId).toBe(depuisLaPersonne.faitId);
      expect(depuisLeGroupe.sens).not.toBe(depuisLaPersonne.sens);
    });

    it('la projection se recompose depuis les faits', async () => {
      const fiche = (
        await request(serveur)
          .get(`/entites/${fiches.komoda}`)
          .set(enTantQue(agent))
          .expect(200)
      ).body as FicheEntiteDto;

      expect(fiche.libelle).toBe('20DCC874');

      const couleur = fiche.champs.find((champ) => champ.cle === 'couleur')!;
      expect(couleur.valeur).toBe('gris');
    });

    it('une plaque ne s’attribue pas deux fois', async () => {
      await request(serveur)
        .post('/entites')
        .set(enTantQue(agent))
        .send({
          typeEntiteId: types.vehicule,
          source: 'Contrôle routier',
          fiabilite: 4,
          dateConstatation: '2026-08-14',
          champs: [champ('vehicule.plaque', '8KLM204')],
        })
        .expect(409);
    });

    it('toute la saisie est tracée, et attribuée au bon agent', async () => {
      const traces = (
        await request(serveur)
          .get('/journal/audit')
          .query({ action: 'entite.creer', limite: '200' })
          .set(enTantQue(etatMajor))
          .expect(200)
      ).body as { action: string; agentId: string | null }[];

      // Le filtre est une recherche par sous-chaîne : « type_entite.creer »,
      // tracé à l'installation du référentiel, y répond aussi.
      const creations = traces.filter(
        (trace) => trace.action === 'entite.creer',
      );

      expect(creations).toHaveLength(11);
      expect(creations.every((trace) => trace.agentId === agent.id)).toBe(true);

      const referentiel = traces.filter(
        (trace) => trace.action === 'type_entite.creer',
      );

      expect(
        referentiel.every((trace) => trace.agentId === superAdmin.id),
      ).toBe(true);
    });

    it('toute consultation de fiche est journalisée', async () => {
      const consultations = (
        await request(serveur)
          .get('/journal/consultations')
          .query({ objet: fiches.madrina })
          .set(enTantQue(etatMajor))
          .expect(200)
      ).body as { agentId: string }[];

      expect(consultations.length).toBeGreaterThan(0);
      expect(consultations.some((entree) => entree.agentId === agent.id)).toBe(
        true,
      );
    });

    it('la répartition initiale des permissions suffit à tout le parcours', () => {
      // Le parcours entier vient d'être saisi par un Junior. S'il avait fallu
      // un État-Major, la plateforme ne servirait pas ceux pour qui elle est
      // faite.
      expect(Object.keys(fiches)).toHaveLength(11);
    });
  });
});
