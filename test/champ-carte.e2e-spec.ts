import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';

import { CODE_ETAT_MAJOR, CODE_SENIOR } from '../src/agents/grades';
import { AppModule } from '../src/app.module';
import type { FicheEntiteDto } from '../src/entites/entites.dto';
import type { DefinitionChampDto } from '../src/referentiel/referentiel.dto';
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
 * Le type de champ « carte » — un point posé sur le plan de la centrale.
 *
 * Ce n'est pas une donnée à part : c'est un fait comme les autres, avec sa
 * source, sa fiabilité et sa date. La recette le vérifie autant que la
 * validation du point lui-même.
 */
describe('Champ de type carte (e2e)', () => {
  let application: INestApplication;
  let serveur: Server;

  let superAdmin: Compte;
  let senior: Compte;
  let referentiel: ReferentielInstalle;

  let idChampPlanque = '';
  let idEntite = '';
  let idTypeRepere = '';

  const enTantQue = (compte: Compte) => ({
    Authorization: `Bearer ${compte.jeton}`,
  });

  const PROVENANCE = {
    source: 'Planque du 06/08',
    fiabilite: 4,
    dateConstatation: '2026-08-06',
  };

  const fiche = async (compte: Compte, id: string) =>
    (
      await request(serveur)
        .get(`/entites/${id}`)
        .set(enTantQue(compte))
        .expect(200)
    ).body as FicheEntiteDto;

  const champCarte = (vue: FicheEntiteDto) =>
    vue.champs.find((champ) => champ.definitionChampId === idChampPlanque);

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

    senior = await creerCompteActif(application, {
      matricule: 'si-002',
      prenom: 'Noa',
      nom: 'Duval',
      roleCode: CODE_SENIOR,
    });

    referentiel = await application
      .get(MadrinaService)
      .installerReferentiel(superAdmin.id);

    const champ = await request(serveur)
      .post('/referentiel/champs')
      .set(enTantQue(superAdmin))
      .send({
        typeEntiteId: referentiel.types.personne,
        cle: 'planque',
        libelle: 'Planque connue',
        typeDonnee: 'carte',
      })
      .expect(201);

    idChampPlanque = (champ.body as DefinitionChampDto).id;

    const type = await request(serveur)
      .post('/carte/types-reperes')
      .set(enTantQue(superAdmin))
      .send({
        code: 'planque',
        libelle: 'Planque',
        nature: 'point',
        icone: 'fas:house',
      })
      .expect(201);

    idTypeRepere = (type.body as { id: string }).id;
  });

  afterAll(async () => {
    await application.close();
  });

  describe('configuration du champ', () => {
    it('refuse l’unicité — deux données peuvent occuper le même endroit', async () => {
      const refus = await request(serveur)
        .post('/referentiel/champs')
        .set(enTantQue(superAdmin))
        .send({
          typeEntiteId: referentiel.types.personne,
          cle: 'planque_unique',
          libelle: 'Planque unique',
          typeDonnee: 'carte',
          estUnique: true,
        })
        .expect(400);

      expect((refus.body as { message: string }).message).toMatch(/unicité/);
    });

    it('refuse qu’un gabarit de libellé cite un point', async () => {
      const refus = await request(serveur)
        .patch(`/referentiel/types-entites/${referentiel.types.personne}`)
        .set(enTantQue(superAdmin))
        .send({ modeleLibelle: '{prenom} {nom} {planque}' })
        .expect(400);

      expect((refus.body as { message: string }).message).toMatch(/pas un nom/);
    });
  });

  describe('saisie du point', () => {
    it('accepte un point et le relit tel quel', async () => {
      const creation = await request(serveur)
        .post('/entites')
        .set(enTantQue(senior))
        .send({
          typeEntiteId: referentiel.types.personne,
          ...PROVENANCE,
          champs: [
            {
              definitionChampId: referentiel.champs['personne.prenom'],
              valeur: 'Isadora',
            },
            {
              definitionChampId: referentiel.champs['personne.nom'],
              valeur: 'Morales',
            },
            {
              definitionChampId: idChampPlanque,
              valeur: { x: 0.5098, y: 0.4968 },
            },
          ],
        })
        .expect(201);

      idEntite = (creation.body as FicheEntiteDto).id;

      const vue = await fiche(senior, idEntite);

      // Sans choix, le point reste un point : type nul, couleur d'accent.
      expect(champCarte(vue)?.valeur).toEqual({
        x: 0.5098,
        y: 0.4968,
        typeRepereId: null,
        couleur: '#6f9dc4',
      });
      expect(champCarte(vue)?.typeDonnee).toBe('carte');
    });

    it('ne laisse pas le point polluer le libellé', async () => {
      const vue = await fiche(senior, idEntite);

      expect(vue.libelle).toMatch(/Morales/);
      expect(vue.libelle).not.toMatch(/[{}]/);
      expect(vue.libelle).not.toMatch(/0\.5098/);
    });

    it.each([
      ['une chaîne', 'quelque part'],
      ['un tableau', [0.5, 0.5]],
      ['un point incomplet', { x: 0.5 }],
      ['des coordonnées non numériques', { x: '0.5', y: '0.5' }],
      ['un point hors du plan', { x: 1.4, y: 0.5 }],
      ['une coordonnée négative', { x: -0.1, y: 0.5 }],
      [
        'un type de repère inventé',
        {
          x: 0.5,
          y: 0.5,
          typeRepereId: '00000000-0000-4000-8000-000000000000',
        },
      ],
      [
        'une couleur qui n’en est pas une',
        { x: 0.5, y: 0.5, couleur: 'rouge' },
      ],
    ])('refuse %s', async (_cas, valeur) => {
      await request(serveur)
        .post('/faits')
        .set(enTantQue(senior))
        .send({
          sujetId: idEntite,
          nature: 'champ',
          definitionChampId: idChampPlanque,
          valeur,
          ...PROVENANCE,
        })
        .expect(400);
    });

    it('ne retient que x et y, jamais ce qu’un client bavard ajoute', async () => {
      const vue = await fiche(senior, idEntite);
      const fait = champCarte(vue)?.faits[0];

      await request(serveur)
        .patch(`/faits/${fait?.id}`)
        .set(enTantQue(senior))
        .send({ valeur: { x: 0.2, y: 0.3, note: 'contrebande' } })
        .expect(200);

      const apres = await fiche(senior, idEntite);
      expect(champCarte(apres)?.valeur).toEqual({
        x: 0.2,
        y: 0.3,
        typeRepereId: null,
        couleur: '#6f9dc4',
      });
    });

    it('retient le type de repère et la couleur choisis à la pose', async () => {
      const vue = await fiche(senior, idEntite);
      const fait = champCarte(vue)?.faits[0];

      await request(serveur)
        .patch(`/faits/${fait?.id}`)
        .set(enTantQue(senior))
        .send({
          valeur: {
            x: 0.31,
            y: 0.44,
            typeRepereId: idTypeRepere,
            couleur: '#6CC08A',
          },
        })
        .expect(200);

      const apres = await fiche(senior, idEntite);

      expect(champCarte(apres)?.valeur).toEqual({
        x: 0.31,
        y: 0.44,
        typeRepereId: idTypeRepere,
        // Rangée en minuscules : deux écritures de la même teinte ne doivent
        // pas se lire comme deux couleurs.
        couleur: '#6cc08a',
      });
    });

    it('le point porte son type et sa couleur jusque sur la carte', async () => {
      const points = await request(serveur)
        .get('/carte/donnees')
        .set(enTantQue(senior))
        .expect(200);

      const pose = (
        points.body as {
          typeRepereId: string | null;
          couleur: string;
          icone: string;
        }[]
      ).find((point) => point.typeRepereId === idTypeRepere);

      expect(pose?.couleur).toBe('#6cc08a');
      expect(pose?.icone).toBe('fas:house');
    });

    it('refuse de retirer un type de repère qu’un point de fiche cite', async () => {
      const refus = await request(serveur)
        .delete(`/carte/types-reperes/${idTypeRepere}`)
        .set(enTantQue(superAdmin))
        .expect(409);

      expect((refus.body as { message: string }).message).toMatch(
        /encore utilisé/,
      );
    });
  });

  describe('cycle de vie — un point est un fait comme un autre', () => {
    it('se corrige, et la fiche suit', async () => {
      const vue = await fiche(senior, idEntite);
      const fait = champCarte(vue)?.faits[0];

      await request(serveur)
        .patch(`/faits/${fait?.id}`)
        .set(enTantQue(senior))
        .send({ valeur: { x: 0.75, y: 0.25 }, source: 'Recoupement du 12/08' })
        .expect(200);

      const apres = await fiche(senior, idEntite);

      expect(champCarte(apres)?.valeur).toEqual({
        x: 0.75,
        y: 0.25,
        typeRepereId: null,
        couleur: '#6f9dc4',
      });
      expect(champCarte(apres)?.faits[0].source).toBe('Recoupement du 12/08');
    });

    it('s’infirme, et la valeur quitte la fiche', async () => {
      const vue = await fiche(senior, idEntite);
      const fait = champCarte(vue)?.faits[0];

      await request(serveur)
        .post(`/faits/${fait?.id}/infirmer`)
        .set(enTantQue(senior))
        .send({ motif: 'planque abandonnée depuis' })
        .expect(200);

      const apres = await fiche(senior, idEntite);

      expect(champCarte(apres)?.valeur).toBeNull();
    });
  });
});
