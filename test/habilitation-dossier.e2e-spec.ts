import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Visibilite } from '@prisma/client';
import type { Server } from 'node:http';
import request from 'supertest';

import { CODE_ETAT_MAJOR, CODE_JUNIOR } from '../src/agents/grades';
import { AppModule } from '../src/app.module';
import type { PanneauDossierDto } from '../src/dossiers/dossiers.dto';
import type { FicheEntiteDto } from '../src/entites/entites.dto';
import {
  MadrinaService,
  type ReferentielInstalle,
} from '../src/semences/madrina.service';
import {
  creerCompteActif,
  reinitialiserLaBase,
  type Compte,
} from './aide-comptes';

/**
 * Le parcours exact de l'exploitation : un dossier passé en restreint, puis un
 * agent habilité nommément dessus. C'est le chemin que personne ne testait —
 * les recettes existantes vérifiaient qu'un dossier restreint se ferme, jamais
 * qu'une habilitation le rouvre vraiment.
 */
describe('Habilitation sur dossier restreint (e2e)', () => {
  let application: INestApplication;
  let serveur: Server;

  let superAdmin: Compte;
  let habilite: Compte;
  let etranger: Compte;
  let referentiel: ReferentielInstalle;

  let idDossier = '';
  let idPivot = '';
  let idSuivie = '';

  const enTantQue = (compte: Compte) => ({
    Authorization: `Bearer ${compte.jeton}`,
  });

  const PROVENANCE = {
    source: 'Planque du 06/08',
    fiabilite: 4,
    dateConstatation: '2026-08-06',
  };

  const creerPersonne = async (
    prenom: string,
    nom: string,
    dossierId?: string,
  ): Promise<string> => {
    const reponse = await request(serveur)
      .post('/entites')
      .set(enTantQue(superAdmin))
      .send({
        typeEntiteId: referentiel.types.personne,
        ...PROVENANCE,
        ...(dossierId ? { dossierId } : {}),
        champs: [
          {
            definitionChampId: referentiel.champs['personne.prenom'],
            valeur: prenom,
          },
          {
            definitionChampId: referentiel.champs['personne.nom'],
            valeur: nom,
          },
        ],
      })
      .expect(201);

    return (reponse.body as FicheEntiteDto).id;
  };

  const panneau = async (compte: Compte, statut = 200) =>
    (
      await request(serveur)
        .get(`/dossiers/${idDossier}`)
        .set(enTantQue(compte))
        .expect(statut)
    ).body as PanneauDossierDto;

  const fiche = async (compte: Compte, id: string) =>
    (
      await request(serveur)
        .get(`/entites/${id}`)
        .set(enTantQue(compte))
        .expect(200)
    ).body as FicheEntiteDto;

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

    await reinitialiserLaBase(application);

    superAdmin = await creerCompteActif(application, {
      matricule: 'sa-001',
      prenom: 'Mathis',
      nom: 'Mercier',
      roleCode: CODE_ETAT_MAJOR,
      superAdmin: true,
    });

    habilite = await creerCompteActif(application, {
      matricule: 'ji-002',
      prenom: 'Sasha',
      nom: 'Vane',
      roleCode: CODE_JUNIOR,
    });

    etranger = await creerCompteActif(application, {
      matricule: 'ji-003',
      prenom: 'Tyron',
      nom: 'Banks',
      roleCode: CODE_JUNIOR,
    });

    referentiel = await application
      .get(MadrinaService)
      .installerReferentiel(superAdmin.id);

    idPivot = await creerPersonne('Isadora', 'Morales');

    const dossier = await request(serveur)
      .post('/dossiers')
      .set(enTantQue(superAdmin))
      .send({ nom: 'Los Vagos', entitePivotId: idPivot })
      .expect(201);

    idDossier = (dossier.body as PanneauDossierDto).id;

    // Une donnée saisie *dans* le dossier : c'est le cas courant, et c'est elle
    // qui porte un fait rattaché au dossier de saisie.
    idSuivie = await creerPersonne('Camille', 'Orsat', idDossier);

    await request(serveur)
      .post(`/dossiers/${idDossier}/suivi`)
      .set(enTantQue(superAdmin))
      .send({ entiteId: idSuivie })
      .expect(204);

    await request(serveur)
      .patch(`/dossiers/${idDossier}`)
      .set(enTantQue(superAdmin))
      .send({ visibilite: Visibilite.restreint })
      .expect(200);

    await request(serveur)
      .post(`/dossiers/${idDossier}/habilitations`)
      .set(enTantQue(superAdmin))
      .send({ agentId: habilite.id })
      .expect(204);
  });

  afterAll(async () => {
    await application.close();
  });

  it('sans habilitation, le dossier se montre et tait son contenu', async () => {
    const vue = await panneau(etranger);

    expect(vue.nom).toBe('Los Vagos');
    expect(vue.contenuLisible).toBe(false);
    expect(vue.suivis).toEqual([]);
  });

  it('avec habilitation, le contenu du dossier s’ouvre', async () => {
    const vue = await panneau(habilite);

    expect(vue.contenuLisible).toBe(true);
    expect(vue.suivis.map((suivi) => suivi.id)).toEqual(
      expect.arrayContaining([idPivot, idSuivie]),
    );
  });

  it('avec habilitation, les faits saisis dans le dossier sont lisibles', async () => {
    const vue = await fiche(habilite, idSuivie);

    const valeurs = vue.champs.map((champ) => champ.valeur);
    expect(valeurs).toEqual(expect.arrayContaining(['Camille', 'Orsat']));
    expect(vue.libelle).toMatch(/Orsat/);
  });

  it('sans habilitation, les mêmes faits restent fermés', async () => {
    const vue = await fiche(etranger, idSuivie);

    expect(vue.champs.every((champ) => champ.valeur === null)).toBe(true);
  });
  describe('quand la donnée elle-même est classée', () => {
    let idClassee = '';

    beforeAll(async () => {
      idClassee = await creerPersonne('Nadia', 'Ferrand', idDossier);

      await request(serveur)
        .post(`/dossiers/${idDossier}/suivi`)
        .set(enTantQue(superAdmin))
        .send({ entiteId: idClassee })
        .expect(204);

      await request(serveur)
        .patch(`/entites/${idClassee}`)
        .set(enTantQue(superAdmin))
        .send({ visibilite: Visibilite.restreint })
        .expect(200);
    });

    /**
     * Le cœur du défaut constaté en exploitation : chaque gardien se franchit
     * pour lui-même, et une donnée classée est un gardien à part entière.
     * L'habilitation sur le dossier ne la couvre donc pas — et jusqu'ici rien
     * ne pouvait la couvrir, faute de route pour l'accorder.
     */
    it('l’habilitation sur le dossier ne suffit pas', async () => {
      const vue = await fiche(habilite, idClassee);

      expect(vue.champs.every((champ) => champ.valeur === null)).toBe(true);
      expect(vue.contenuLisible).toBe(false);
    });

    it('l’habilitation sur la donnée l’ouvre', async () => {
      await request(serveur)
        .post(`/entites/${idClassee}/habilitations`)
        .set(enTantQue(superAdmin))
        .send({ agentId: habilite.id })
        .expect(204);

      const vue = await fiche(habilite, idClassee);

      expect(vue.contenuLisible).toBe(true);
      expect(vue.champs.map((champ) => champ.valeur)).toEqual(
        expect.arrayContaining(['Nadia', 'Ferrand']),
      );
      expect(vue.habilitations.map((agent) => agent.matricule)).toContain(
        'ji-002',
      );
    });

    it('et le retrait la referme', async () => {
      await request(serveur)
        .delete(`/entites/${idClassee}/habilitations/${habilite.id}`)
        .set(enTantQue(superAdmin))
        .expect(204);

      const vue = await fiche(habilite, idClassee);

      expect(vue.contenuLisible).toBe(false);
      expect(vue.champs.every((champ) => champ.valeur === null)).toBe(true);
    });

    it('reste fermée à qui n’est habilité nulle part', async () => {
      const vue = await fiche(etranger, idClassee);

      expect(vue.contenuLisible).toBe(false);
    });
  });

  describe('quand le fait lui-même est classé', () => {
    beforeAll(async () => {
      await request(serveur)
        .post('/faits')
        .set(enTantQue(superAdmin))
        .send({
          sujetId: idSuivie,
          nature: 'champ',
          definitionChampId: referentiel.champs['personne.date_de_naissance'],
          valeur: '1998-02-11',
          dossierId: idDossier,
          visibilite: Visibilite.restreint,
          ...PROVENANCE,
        })
        .expect(201);
    });

    /**
     * Comportement voulu, et non défaut : aucune whitelist ne porte sur un
     * fait. Classer un fait revient donc à le réserver à qui détient la
     * dérogation — l'habilitation, elle, ne connaît que les dossiers et les
     * données. Le test est ici pour que ce choix reste explicite.
     */
    it('reste fermé à l’habilité, ouvert au seul dérogataire', async () => {
      const vue = await fiche(habilite, idSuivie);

      const naissance = vue.champs.find(
        (champ) =>
          champ.definitionChampId ===
          referentiel.champs['personne.date_de_naissance'],
      );

      expect(naissance?.valeur).toBeNull();

      const vueOuverte = await fiche(superAdmin, idSuivie);
      const naissanceOuverte = vueOuverte.champs.find(
        (champ) =>
          champ.definitionChampId ===
          referentiel.champs['personne.date_de_naissance'],
      );

      expect(naissanceOuverte?.valeur).toBe('1998-02-11');
    });
  });
});
