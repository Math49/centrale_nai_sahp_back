import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';

import { CODE_ETAT_MAJOR, CONSULTATION } from '../src/agents/grades';
import { AppModule } from '../src/app.module';
import type { FicheEntiteDto } from '../src/entites/entites.dto';
import { PrismaService } from '../src/prisma/prisma.service';
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
 * Un grade sans aucune permission.
 *
 * Créé en base plutôt que par l'API : il n'existe pas de route de création de
 * grade, et c'est bien par SQL qu'un tel rôle apparaît en exploitation. Le test
 * reproduit donc exactement le geste de l'administrateur.
 */
describe('Grade sans permission (e2e)', () => {
  let application: INestApplication;
  let serveur: Server;

  let superAdmin: Compte;
  let visiteur: Compte;
  let muet: Compte;
  let referentiel: ReferentielInstalle;
  let idPersonne = '';

  const enTantQue = (compte: Compte) => ({
    Authorization: `Bearer ${compte.jeton}`,
  });

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
    const prisma = application.get(PrismaService);

    await reinitialiserLaBase(application);

    await prisma.role.create({
      data: {
        code: 'visiteur',
        libelle: 'Visiteur',
        permissions: [...CONSULTATION],
        ordre: 9,
      },
    });

    await prisma.role.create({
      data: { code: 'muet', libelle: 'Muet', permissions: [], ordre: 10 },
    });

    superAdmin = await creerCompteActif(application, {
      matricule: 'sa-001',
      prenom: 'Mathis',
      nom: 'Mercier',
      roleCode: CODE_ETAT_MAJOR,
      superAdmin: true,
    });

    visiteur = await creerCompteActif(application, {
      matricule: 'vis-009',
      prenom: 'Camille',
      nom: 'Orsat',
      roleCode: 'visiteur',
    });

    muet = await creerCompteActif(application, {
      matricule: 'mut-010',
      prenom: 'Yann',
      nom: 'Perrin',
      roleCode: 'muet',
    });

    referentiel = await application
      .get(MadrinaService)
      .installerReferentiel(superAdmin.id);

    const personne = await request(serveur)
      .post('/entites')
      .set(enTantQue(superAdmin))
      .send({
        typeEntiteId: referentiel.types.personne,
        source: 'Recette du grade visiteur',
        fiabilite: 4,
        dateConstatation: '2026-08-06',
        champs: [
          {
            definitionChampId: referentiel.champs['personne.prenom'],
            valeur: 'Isadora',
          },
          {
            definitionChampId: referentiel.champs['personne.nom'],
            valeur: 'Morales',
          },
        ],
      })
      .expect(201);

    idPersonne = (personne.body as FicheEntiteDto).id;
  });

  afterAll(async () => {
    await application.close();
  });

  it('le compte est bien connecté, et son grade ne porte rien', async () => {
    const moi = await request(serveur)
      .get('/auth/moi')
      .set(enTantQue(visiteur))
      .expect(200);

    expect(moi.body).toMatchObject({
      matricule: 'vis-009',
      roleCode: 'visiteur',
      superAdmin: false,
      permissions: [...CONSULTATION],
    });
  });

  it('un grade sans geste de lecture n’ouvre plus aucun écran', async () => {
    await request(serveur).get('/entites').set(enTantQue(muet)).expect(403);

    await request(serveur).get('/dossiers').set(enTantQue(muet)).expect(403);
    await request(serveur)
      .get('/graphe/complet')
      .set(enTantQue(muet))
      .expect(403);
  });

  it('lit ce qui lui est visible — un visiteur consulte', async () => {
    await request(serveur)
      .get('/dossiers')
      .set(enTantQue(visiteur))
      .expect(200);

    await request(serveur).get('/entites').set(enTantQue(visiteur)).expect(200);

    await request(serveur)
      .get(`/entites/${idPersonne}`)
      .set(enTantQue(visiteur))
      .expect(200);

    await request(serveur)
      .get('/graphe/complet')
      .set(enTantQue(visiteur))
      .expect(200);

    await request(serveur).get('/accueil').set(enTantQue(visiteur)).expect(200);
  });

  it('n’écrit rien : chaque route de création lui répond 403', async () => {
    const refus = await request(serveur)
      .post('/dossiers')
      .set(enTantQue(visiteur))
      .send({ nom: 'Dossier interdit', entitePivotId: idPersonne })
      .expect(403);

    expect((refus.body as { message: string }).message).toMatch(
      /dossier\.creer/,
    );

    await request(serveur)
      .post('/entites')
      .set(enTantQue(visiteur))
      .send({
        typeEntiteId: referentiel.types.personne,
        source: 'Tentative',
        fiabilite: 2,
        dateConstatation: '2026-08-06',
        champs: [
          {
            definitionChampId: referentiel.champs['personne.nom'],
            valeur: 'Interdit',
          },
        ],
      })
      .expect(403);

    await request(serveur)
      .post(`/entites/${idPersonne}/archiver`)
      .set(enTantQue(visiteur))
      .expect(403);

    await request(serveur)
      .patch(`/entites/${idPersonne}`)
      .set(enTantQue(visiteur))
      .send({ note: 'tentative' })
      .expect(403);
  });

  it('n’approche ni les comptes, ni les grades, ni les journaux', async () => {
    await request(serveur).get('/agents').set(enTantQue(visiteur)).expect(403);

    await request(serveur)
      .get('/roles/catalogue-permissions')
      .set(enTantQue(visiteur))
      .expect(403);

    await request(serveur)
      .get(`/entites/${idPersonne}/historique`)
      .set(enTantQue(visiteur))
      .expect(403);
  });
});
