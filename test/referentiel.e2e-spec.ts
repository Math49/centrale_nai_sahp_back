import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';

import { CODE_ETAT_MAJOR, CODE_JUNIOR } from '../src/agents/grades';
import { AppModule } from '../src/app.module';
import type { ReferentielDto } from '../src/referentiel/referentiel.dto';
import {
  creerCompteActif,
  reinitialiserLaBase,
  type Compte,
} from './aide-comptes';

/**
 * Recette du lot 3 : création complète du type Véhicule avec ses champs, du
 * type de lien « propriétaire de » avec ses contraintes de domaine, et d'un
 * onglet regroupant deux types de liens.
 */
describe('Lot 3 — référentiel (e2e)', () => {
  let application: INestApplication;
  let serveur: Server;

  let superAdmin: Compte;
  let etatMajor: Compte;
  let junior: Compte;

  const types: Record<string, string> = {};
  const liens: Record<string, string> = {};
  let idPlaque = '';
  let idOngletPersonnes = '';

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

    await reinitialiserLaBase(application);

    superAdmin = await creerCompteActif(application, {
      matricule: 'sa-001',
      prenom: 'Mathis',
      nom: 'Mercier',
      roleCode: CODE_ETAT_MAJOR,
      superAdmin: true,
    });

    etatMajor = await creerCompteActif(application, {
      matricule: 'em-002',
      prenom: 'Alix',
      nom: 'Reyes',
      roleCode: CODE_ETAT_MAJOR,
    });

    junior = await creerCompteActif(application, {
      matricule: 'ji-003',
      prenom: 'Tyron',
      nom: 'Banks',
      roleCode: CODE_JUNIOR,
    });
  });

  afterAll(async () => {
    await application?.close();
  });

  describe('accès', () => {
    it('tout agent connecté lit le catalogue', async () => {
      const reponse = await request(serveur)
        .get('/referentiel')
        .set(enTantQue(junior))
        .expect(200);

      expect(reponse.body).toEqual({ typesEntites: [], typesLiens: [] });
    });

    it('le catalogue reste fermé sans jeton', async () => {
      await request(serveur).get('/referentiel').expect(401);
    });

    it('un État-Major ne configure pas le modèle, même avec toutes ses permissions', async () => {
      const reponse = await request(serveur)
        .post('/referentiel/types-entites')
        .set(enTantQue(etatMajor))
        .send({
          code: 'tentative',
          libelle: 'Tentative',
          libellePluriel: 'Tentatives',
          icone: 'x',
          modeleLibelle: '{nom}',
        })
        .expect(403);

      expect((reponse.body as { message: string }).message).toBe(
        'réservé au super-admin',
      );
    });
  });

  describe("types d'entités", () => {
    it('refuse un gabarit sans référence de champ', async () => {
      await request(serveur)
        .post('/referentiel/types-entites')
        .set(enTantQue(superAdmin))
        .send({
          code: 'constante',
          libelle: 'Constante',
          libellePluriel: 'Constantes',
          icone: 'x',
          modeleLibelle: 'toujours pareil',
        })
        .expect(400);
    });

    it.each([
      ['personne', 'Personne', 'Personnes', '{prenom} {nom}'],
      ['vehicule', 'Véhicule', 'Véhicules', '{plaque}'],
      ['evenement', 'Événement', 'Événements', '{nom}'],
    ])('crée le type %s', async (code, libelle, pluriel, modele) => {
      const reponse = await request(serveur)
        .post('/referentiel/types-entites')
        .set(enTantQue(superAdmin))
        .send({
          code,
          libelle,
          libellePluriel: pluriel,
          icone: code,
          modeleLibelle: modele,
        })
        .expect(201);

      const type = reponse.body as { id: string; ordre: number };
      types[code] = type.id;
    });

    it('refuse un code déjà pris', async () => {
      await request(serveur)
        .post('/referentiel/types-entites')
        .set(enTantQue(superAdmin))
        .send({
          code: 'vehicule',
          libelle: 'Doublon',
          libellePluriel: 'Doublons',
          icone: 'x',
          modeleLibelle: '{plaque}',
        })
        .expect(409);
    });

    it('donne un aperçu du gabarit', async () => {
      const reponse = await request(serveur)
        .post('/referentiel/types-entites/apercu-gabarit')
        .set(enTantQue(superAdmin))
        .send({ modeleLibelle: '{prenom} {nom}' })
        .expect(200);

      expect(reponse.body).toEqual({
        apercu: 'valeur 1 valeur 2',
        clesCitees: ['prenom', 'nom'],
      });
    });
  });

  describe('champs du type Véhicule', () => {
    it('crée la plaque, unique et obligatoire', async () => {
      const reponse = await request(serveur)
        .post('/referentiel/champs')
        .set(enTantQue(superAdmin))
        .send({
          typeEntiteId: types.vehicule,
          cle: 'plaque',
          libelle: 'Plaque',
          typeDonnee: 'texte',
          obligatoire: true,
          estUnique: true,
        })
        .expect(201);

      const champ = reponse.body as { id: string; ordre: number };
      expect(champ.ordre).toBe(0);
      idPlaque = champ.id;
    });

    it('crée le modèle', async () => {
      await request(serveur)
        .post('/referentiel/champs')
        .set(enTantQue(superAdmin))
        .send({
          typeEntiteId: types.vehicule,
          cle: 'modele',
          libelle: 'Modèle',
          typeDonnee: 'texte',
        })
        .expect(201);
    });

    it('crée la couleur en liste fermée', async () => {
      const reponse = await request(serveur)
        .post('/referentiel/champs')
        .set(enTantQue(superAdmin))
        .send({
          typeEntiteId: types.vehicule,
          cle: 'couleur',
          libelle: 'Couleur',
          typeDonnee: 'liste',
          options: ['gris', 'noir', 'blanc'],
        })
        .expect(201);

      expect((reponse.body as { options: string[] }).options).toEqual([
        'gris',
        'noir',
        'blanc',
      ]);
    });

    it('refuse une liste sans valeurs autorisées', async () => {
      await request(serveur)
        .post('/referentiel/champs')
        .set(enTantQue(superAdmin))
        .send({
          typeEntiteId: types.vehicule,
          cle: 'categorie',
          libelle: 'Catégorie',
          typeDonnee: 'liste',
        })
        .expect(400);
    });

    it('refuse des valeurs autorisées sur un champ texte', async () => {
      await request(serveur)
        .post('/referentiel/champs')
        .set(enTantQue(superAdmin))
        .send({
          typeEntiteId: types.vehicule,
          cle: 'surnom',
          libelle: 'Surnom',
          typeDonnee: 'texte',
          options: ['a', 'b'],
        })
        .expect(400);
    });

    it('refuse un champ à la fois unique et multiple', async () => {
      await request(serveur)
        .post('/referentiel/champs')
        .set(enTantQue(superAdmin))
        .send({
          typeEntiteId: types.vehicule,
          cle: 'immatriculations',
          libelle: 'Immatriculations',
          typeDonnee: 'texte',
          estUnique: true,
          multiple: true,
        })
        .expect(400);
    });

    it("refuse l'unicité sur un fichier", async () => {
      await request(serveur)
        .post('/referentiel/champs')
        .set(enTantQue(superAdmin))
        .send({
          typeEntiteId: types.vehicule,
          cle: 'photo',
          libelle: 'Photo',
          typeDonnee: 'fichier',
          estUnique: true,
        })
        .expect(400);
    });

    it('refuse une clé déjà employée dans le même type', async () => {
      await request(serveur)
        .post('/referentiel/champs')
        .set(enTantQue(superAdmin))
        .send({
          typeEntiteId: types.vehicule,
          cle: 'plaque',
          libelle: 'Plaque bis',
          typeDonnee: 'texte',
        })
        .expect(409);
    });
  });

  describe('gabarit et champs', () => {
    it('refuse un gabarit citant un champ inexistant', async () => {
      const reponse = await request(serveur)
        .patch(`/referentiel/types-entites/${types.vehicule}`)
        .set(enTantQue(superAdmin))
        .send({ modeleLibelle: '{plaque} — {chassis}' })
        .expect(400);

      expect((reponse.body as { message: string }).message).toMatch(/chassis/);
    });

    it('accepte un gabarit citant des champs existants', async () => {
      await request(serveur)
        .patch(`/referentiel/types-entites/${types.vehicule}`)
        .set(enTantQue(superAdmin))
        .send({ modeleLibelle: '{plaque} {modele}' })
        .expect(200);
    });

    it('refuse de supprimer un champ cité par le gabarit', async () => {
      const reponse = await request(serveur)
        .delete(`/referentiel/champs/${idPlaque}`)
        .set(enTantQue(superAdmin))
        .expect(409);

      expect((reponse.body as { message: string }).message).toMatch(/plaque/);
    });
  });

  describe('types de liens et contraintes de domaine', () => {
    it('crée « propriétaire de », de Personne vers Véhicule', async () => {
      const reponse = await request(serveur)
        .post('/referentiel/types-liens')
        .set(enTantQue(superAdmin))
        .send({
          code: 'proprietaire_de',
          libelle: 'propriétaire de',
          libelleInverse: 'appartient à',
          typeEntiteSourceId: types.personne,
          typeEntiteCibleId: types.vehicule,
          multiple: true,
        })
        .expect(201);

      liens.proprietaire_de = (reponse.body as { id: string }).id;
    });

    it('refuse un type de lien dont le domaine est inconnu', async () => {
      await request(serveur)
        .post('/referentiel/types-liens')
        .set(enTantQue(superAdmin))
        .send({
          code: 'vers_le_neant',
          libelle: 'vers le néant',
          libelleInverse: 'depuis le néant',
          typeEntiteSourceId: types.personne,
          typeEntiteCibleId: '00000000-0000-4000-8000-000000000000',
        })
        .expect(404);
    });

    it.each([
      ['interpelle_lors_de', 'interpellé lors de', 'a interpellé'],
      ['present_lors_de', 'présent lors de', 'a vu présent'],
    ])('crée le lien fin %s', async (code, libelle, inverse) => {
      const reponse = await request(serveur)
        .post('/referentiel/types-liens')
        .set(enTantQue(superAdmin))
        .send({
          code,
          libelle,
          libelleInverse: inverse,
          typeEntiteSourceId: types.personne,
          typeEntiteCibleId: types.evenement,
        })
        .expect(201);

      liens[code] = (reponse.body as { id: string }).id;
    });

    it("refuse de supprimer un type d'entité qu'un lien désigne", async () => {
      await request(serveur)
        .delete(`/referentiel/types-entites/${types.personne}`)
        .set(enTantQue(superAdmin))
        .expect(409);
    });
  });

  describe('onglet regroupant deux types de liens', () => {
    it("crée l'onglet Personnes sur Événement", async () => {
      const reponse = await request(serveur)
        .post('/referentiel/onglets')
        .set(enTantQue(superAdmin))
        .send({ typeEntiteId: types.evenement, libelle: 'Personnes' })
        .expect(201);

      idOngletPersonnes = (reponse.body as { id: string }).id;
    });

    it('refuse le sens direct : Événement est la cible de ces liens, pas la source', async () => {
      const reponse = await request(serveur)
        .put(`/referentiel/onglets/${idOngletPersonnes}/types-liens`)
        .set(enTantQue(superAdmin))
        .send({
          typesLiens: [
            { typeLienId: liens.interpelle_lors_de, sens: 'direct' },
          ],
        })
        .expect(400);

      expect((reponse.body as { message: string }).message).toMatch(
        /type source/,
      );
    });

    it('accepte les deux liens fins en sens inverse', async () => {
      const reponse = await request(serveur)
        .put(`/referentiel/onglets/${idOngletPersonnes}/types-liens`)
        .set(enTantQue(superAdmin))
        .send({
          typesLiens: [
            { typeLienId: liens.interpelle_lors_de, sens: 'inverse' },
            { typeLienId: liens.present_lors_de, sens: 'inverse' },
          ],
        })
        .expect(200);

      const onglet = reponse.body as {
        typesLiens: { typeLienId: string; sens: string; ordre: number }[];
      };

      expect(onglet.typesLiens).toHaveLength(2);
      expect(onglet.typesLiens[0]).toEqual({
        typeLienId: liens.interpelle_lors_de,
        sens: 'inverse',
        ordre: 0,
      });
    });

    it('refuse deux fois le même lien dans le même sens', async () => {
      await request(serveur)
        .put(`/referentiel/onglets/${idOngletPersonnes}/types-liens`)
        .set(enTantQue(superAdmin))
        .send({
          typesLiens: [
            { typeLienId: liens.present_lors_de, sens: 'inverse' },
            { typeLienId: liens.present_lors_de, sens: 'inverse' },
          ],
        })
        .expect(400);
    });
  });

  describe('ordre', () => {
    it('refuse un réordonnancement partiel', async () => {
      await request(serveur)
        .post(`/referentiel/types-entites/${types.vehicule}/champs/ordre`)
        .set(enTantQue(superAdmin))
        .send({ ids: [idPlaque] })
        .expect(400);
    });

    it('accepte un jeu complet et le reflète dans le catalogue', async () => {
      const avant = await request(serveur)
        .get('/referentiel')
        .set(enTantQue(superAdmin))
        .expect(200);

      const vehicule = (avant.body as ReferentielDto).typesEntites.find(
        (type) => type.code === 'vehicule',
      )!;

      const inverse = vehicule.champs.map((champ) => champ.id).reverse();

      await request(serveur)
        .post(`/referentiel/types-entites/${types.vehicule}/champs/ordre`)
        .set(enTantQue(superAdmin))
        .send({ ids: inverse })
        .expect(204);

      const apres = await request(serveur)
        .get('/referentiel')
        .set(enTantQue(superAdmin))
        .expect(200);

      const reordonne = (apres.body as ReferentielDto).typesEntites.find(
        (type) => type.code === 'vehicule',
      )!;

      expect(reordonne.champs.map((champ) => champ.id)).toEqual(inverse);
    });
  });

  describe('catalogue assemblé', () => {
    it('livre types, champs, onglets peuplés et types de liens en une requête', async () => {
      const reponse = await request(serveur)
        .get('/referentiel')
        .set(enTantQue(junior))
        .expect(200);

      const catalogue = reponse.body as ReferentielDto;

      expect(catalogue.typesEntites.map((type) => type.code)).toEqual([
        'personne',
        'vehicule',
        'evenement',
      ]);

      const vehicule = catalogue.typesEntites.find(
        (type) => type.code === 'vehicule',
      )!;
      expect(vehicule.champs).toHaveLength(3);
      expect(vehicule.modeleLibelle).toBe('{plaque} {modele}');

      const evenement = catalogue.typesEntites.find(
        (type) => type.code === 'evenement',
      )!;
      expect(evenement.onglets).toHaveLength(1);
      expect(evenement.onglets[0].libelle).toBe('Personnes');
      expect(evenement.onglets[0].typesLiens).toHaveLength(2);

      expect(catalogue.typesLiens).toHaveLength(3);
    });

    it("trace chaque geste de configuration au journal d'audit", async () => {
      const reponse = await request(serveur)
        .get('/referentiel')
        .set(enTantQue(superAdmin))
        .expect(200);

      expect((reponse.body as ReferentielDto).typesEntites.length).toBe(3);

      const prisma = application.get(
        (await import('../src/prisma/prisma.service')).PrismaService,
      );

      const traces = await prisma.journalAudit.count({
        where: { cibleTable: 'referentiel', agentId: superAdmin.id },
      });

      expect(traces).toBeGreaterThanOrEqual(10);
    });
  });
});
