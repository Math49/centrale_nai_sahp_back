import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';

import {
  CODE_ETAT_MAJOR,
  CODE_JUNIOR,
  CODE_SENIOR,
} from '../src/agents/grades';
import { AppModule } from '../src/app.module';
import type { RepereDto, TypeRepereDto } from '../src/carte/carte.dto';
import {
  creerCompteActif,
  reinitialiserLaBase,
  type Compte,
} from './aide-comptes';

/**
 * La carte de la centrale.
 *
 * La recette qui compte le plus : **un repère classé n'est pas montré muet, il
 * est absent**. Sur une carte, la position est le renseignement — un marqueur
 * sans libellé à l'emplacement d'un labo dirait déjà l'essentiel.
 */
describe('Carte — repères (e2e)', () => {
  let application: INestApplication;
  let serveur: Server;

  let superAdmin: Compte;
  let senior: Compte;
  let junior: Compte;

  let idTypePoint = '';
  let idTypeZone = '';

  const enTantQue = (compte: Compte) => ({
    Authorization: `Bearer ${compte.jeton}`,
  });

  const reperes = async (compte: Compte): Promise<RepereDto[]> =>
    (
      await request(serveur)
        .get('/carte/reperes')
        .set(enTantQue(compte))
        .expect(200)
    ).body as RepereDto[];

  // La couleur est obligatoire à la pose : le type n'en porte plus. Le défaut
  // n'est là que pour ne pas la répéter dans chaque épreuve qui teste autre
  // chose ; les épreuves qui la regardent l'écrivent.
  const poser = async (
    compte: Compte,
    corps: Record<string, unknown>,
    statut = 201,
  ) =>
    (
      await request(serveur)
        .post('/carte/reperes')
        .set(enTantQue(compte))
        .send({ couleur: '#d99a5b', ...corps })
        .expect(statut)
    ).body as RepereDto;

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

    junior = await creerCompteActif(application, {
      matricule: 'ji-003',
      prenom: 'Sasha',
      nom: 'Vane',
      roleCode: CODE_JUNIOR,
    });

    const point = await request(serveur)
      .post('/carte/types-reperes')
      .set(enTantQue(superAdmin))
      .send({
        code: 'labo',
        libelle: 'Laboratoire',
        nature: 'point',
        icone: 'fas:flask',
      })
      .expect(201);

    idTypePoint = (point.body as TypeRepereDto).id;

    const zone = await request(serveur)
      .post('/carte/types-reperes')
      .set(enTantQue(superAdmin))
      .send({
        code: 'secteur',
        libelle: 'Secteur surveillé',
        nature: 'zone',
        icone: 'fas:vector-square',
      })
      .expect(201);

    idTypeZone = (zone.body as TypeRepereDto).id;
  });

  afterAll(async () => {
    await application.close();
  });

  describe('configuration des types', () => {
    it('est réservée au super-admin', async () => {
      await request(serveur)
        .post('/carte/types-reperes')
        .set(enTantQue(senior))
        .send({
          code: 'interdit',
          libelle: 'Interdit',
          nature: 'point',
          icone: 'fas:ban',
        })
        .expect(403);
    });

    it('se lit par qui consulte la carte', async () => {
      const vue = await request(serveur)
        .get('/carte/types-reperes')
        .set(enTantQue(junior))
        .expect(200);

      expect((vue.body as TypeRepereDto[]).map((type) => type.code)).toEqual([
        'labo',
        'secteur',
      ]);
    });

    it('refuse de retirer un type que des repères utilisent', async () => {
      await poser(senior, {
        typeRepereId: idTypePoint,
        geometrie: { type: 'point', x: 0.4, y: 0.4 },
        libelle: 'Labo témoin',
      });

      const refus = await request(serveur)
        .delete(`/carte/types-reperes/${idTypePoint}`)
        .set(enTantQue(superAdmin))
        .expect(409);

      expect((refus.body as { message: string }).message).toMatch(
        /encore utilisé/,
      );
    });
  });

  describe('géométrie — la forme suit la nature du type', () => {
    it('accepte un point sur un type de nature point', async () => {
      const repere = await poser(senior, {
        typeRepereId: idTypePoint,
        geometrie: { type: 'point', x: 0.51, y: 0.32 },
        libelle: 'Labo présumé — hangar 4',
      });

      expect(repere.geometrie).toEqual({ type: 'point', x: 0.51, y: 0.32 });
      expect(repere.nature).toBe('point');
      expect(repere.couleur).toBe('#d99a5b');
    });

    it('accepte un rectangle sur un type de nature zone', async () => {
      const repere = await poser(senior, {
        typeRepereId: idTypeZone,
        geometrie: {
          type: 'rectangle',
          // Coins donnés à l'envers : l'API les range, c'est sa charge.
          a: { x: 0.4, y: 0.4 },
          b: { x: 0.2, y: 0.2 },
        },
        libelle: 'Secteur nord',
        couleur: '#6cc08a',
        opacite: 0.4,
      });

      expect(repere.nature).toBe('zone');
      expect(repere.geometrie).toEqual({
        type: 'rectangle',
        a: { x: 0.2, y: 0.2 },
        b: { x: 0.4, y: 0.4 },
      });
      expect(repere.couleur).toBe('#6cc08a');
      expect(repere.opacite).toBe(0.4);
    });

    it('accepte un cercle sur un type de nature zone', async () => {
      const repere = await poser(senior, {
        typeRepereId: idTypeZone,
        geometrie: { type: 'cercle', centre: { x: 0.6, y: 0.6 }, rayon: 0.05 },
        libelle: 'Ronde de nuit',
      });

      expect(repere.geometrie).toEqual({
        type: 'cercle',
        centre: { x: 0.6, y: 0.6 },
        rayon: 0.05,
      });
    });

    it.each([
      [
        'une zone sur un type de point',
        'point',
        { type: 'rectangle', a: { x: 0.1, y: 0.1 }, b: { x: 0.2, y: 0.2 } },
      ],
      [
        'un point sur un type de zone',
        'zone',
        { type: 'point', x: 0.5, y: 0.5 },
      ],
      [
        'un polygone, qui n’existe plus',
        'zone',
        {
          type: 'polygone',
          sommets: [
            { x: 0.1, y: 0.1 },
            { x: 0.2, y: 0.2 },
            { x: 0.3, y: 0.1 },
          ],
        },
      ],
      [
        'un rectangle plat',
        'zone',
        { type: 'rectangle', a: { x: 0.1, y: 0.1 }, b: { x: 0.1, y: 0.3 } },
      ],
      [
        'un cercle de rayon nul',
        'zone',
        { type: 'cercle', centre: { x: 0.5, y: 0.5 }, rayon: 0 },
      ],
      ['un point hors du plan', 'point', { type: 'point', x: 1.4, y: 0.2 }],
      ['une géométrie qui n’en est pas une', 'point', 'quelque part'],
    ])('refuse %s', async (_cas, nature, geometrie) => {
      await poser(
        senior,
        {
          typeRepereId: nature === 'point' ? idTypePoint : idTypeZone,
          geometrie,
          libelle: 'Refusé',
        },
        400,
      );
    });
  });

  describe('visibilité — un repère classé est absent, pas muet', () => {
    let idClasse = '';

    beforeAll(async () => {
      const repere = await poser(superAdmin, {
        typeRepereId: idTypePoint,
        geometrie: { type: 'point', x: 0.77, y: 0.21 },
        libelle: 'Labo Los Vagos',
        visibilite: 'restreint',
      });

      idClasse = repere.id;
    });

    it('n’apparaît nulle part pour qui n’y a pas droit', async () => {
      const vue = await reperes(junior);

      expect(vue.map((repere) => repere.id)).not.toContain(idClasse);
      // Ni sous une forme muette : il n'y a rien à cet endroit du plan.
      expect(vue.some((repere) => repere.libelle.includes('Los Vagos'))).toBe(
        false,
      );
    });

    it('répond 404 et jamais 403 sur une modification', async () => {
      await request(serveur)
        .patch(`/carte/reperes/${idClasse}`)
        .set(enTantQue(senior))
        .send({ libelle: 'tentative' })
        .expect(404);
    });

    it('s’ouvre à l’agent habilité nommément', async () => {
      await request(serveur)
        .post(`/carte/reperes/${idClasse}/habilitations`)
        .set(enTantQue(superAdmin))
        .send({ agentId: junior.id })
        .expect(204);

      const vue = await reperes(junior);
      const trouve = vue.find((repere) => repere.id === idClasse);

      expect(trouve?.libelle).toBe('Labo Los Vagos');
      expect(trouve?.habilitations.map((agent) => agent.matricule)).toContain(
        'ji-003',
      );
    });

    it('se referme au retrait de l’habilitation', async () => {
      await request(serveur)
        .delete(`/carte/reperes/${idClasse}/habilitations/${junior.id}`)
        .set(enTantQue(superAdmin))
        .expect(204);

      const vue = await reperes(junior);
      expect(vue.map((repere) => repere.id)).not.toContain(idClasse);
    });

    it('exige visibilite.definir pour classer', async () => {
      await poser(
        junior,
        {
          typeRepereId: idTypePoint,
          geometrie: { type: 'point', x: 0.3, y: 0.3 },
          libelle: 'Classement interdit',
          visibilite: 'prive',
        },
        403,
      );
    });
  });

  describe('retrait — archivage, jamais suppression', () => {
    let idArchivable = '';

    beforeAll(async () => {
      const repere = await poser(senior, {
        typeRepereId: idTypePoint,
        geometrie: { type: 'point', x: 0.66, y: 0.66 },
        libelle: 'Planque abandonnée',
      });

      idArchivable = repere.id;
    });

    it('quitte la carte sans quitter la base', async () => {
      await request(serveur)
        .post(`/carte/reperes/${idArchivable}/archiver`)
        .set(enTantQue(superAdmin))
        .expect(200);

      const actifs = await reperes(superAdmin);
      expect(actifs.map((repere) => repere.id)).not.toContain(idArchivable);

      const avecArchives = await request(serveur)
        .get('/carte/reperes?archives=true')
        .set(enTantQue(superAdmin))
        .expect(200);

      expect(
        (avecArchives.body as RepereDto[]).map((repere) => repere.id),
      ).toContain(idArchivable);
    });

    it('se désarchive', async () => {
      await request(serveur)
        .post(`/carte/reperes/${idArchivable}/desarchiver`)
        .set(enTantQue(superAdmin))
        .expect(200);

      const actifs = await reperes(superAdmin);
      expect(actifs.map((repere) => repere.id)).toContain(idArchivable);
    });

    it('n’offre aucune route de suppression', async () => {
      await request(serveur)
        .delete(`/carte/reperes/${idArchivable}`)
        .set(enTantQue(superAdmin))
        .expect(404);
    });
  });

  describe('permissions', () => {
    it('un junior consulte mais ne pose rien', async () => {
      await reperes(junior);

      await poser(
        junior,
        {
          typeRepereId: idTypePoint,
          geometrie: { type: 'point', x: 0.1, y: 0.1 },
          libelle: 'Interdit',
        },
        403,
      );
    });

    it('un junior n’archive pas', async () => {
      const vue = await reperes(senior);

      await request(serveur)
        .post(`/carte/reperes/${vue[0].id}/archiver`)
        .set(enTantQue(junior))
        .expect(403);
    });
  });
});
