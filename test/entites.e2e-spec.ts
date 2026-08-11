import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';

import { CODE_ETAT_MAJOR, CODE_JUNIOR } from '../src/agents/grades';
import { AppModule } from '../src/app.module';
import type {
  FicheEntiteDto,
  SuggestionDoublonDto,
} from '../src/entites/entites.dto';
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

describe('Lot 4 — entités et faits (e2e)', () => {
  let application: INestApplication;
  let serveur: Server;
  let prisma: PrismaService;
  let madrina: MadrinaService;

  let superAdmin: Compte;
  let junior: Compte;
  let referentiel: ReferentielInstalle;

  const enTantQue = (compte: Compte) => ({
    Authorization: `Bearer ${compte.jeton}`,
  });

  const PROVENANCE = {
    source: 'Planque du 06/08',
    fiabilite: 4,
    dateConstatation: '2026-08-06',
  };

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
    madrina = application.get(MadrinaService);

    await reinitialiserLaBase(application);

    superAdmin = await creerCompteActif(application, {
      matricule: 'sa-001',
      prenom: 'Mathis',
      nom: 'Mercier',
      roleCode: CODE_ETAT_MAJOR,
      superAdmin: true,
    });

    junior = await creerCompteActif(application, {
      matricule: 'ji-003',
      prenom: 'Sasha',
      nom: 'Vane',
      roleCode: CODE_JUNIOR,
    });

    referentiel = await madrina.installerReferentiel(superAdmin.id);
  });

  afterAll(async () => {
    await application?.close();
  });

  const creerEntite = (compte: Compte, corps: Record<string, unknown>) =>
    request(serveur).post('/entites').set(enTantQue(compte)).send(corps);

  const champ = (cle: string, valeur: unknown) => ({
    definitionChampId: referentiel.champs[cle],
    valeur,
  });

  describe('projection et libellé', () => {
    let idVehicule = '';

    it('crée un véhicule et calcule son libellé depuis le gabarit', async () => {
      const reponse = await creerEntite(junior, {
        typeEntiteId: referentiel.types.vehicule,
        ...PROVENANCE,
        champs: [
          champ('vehicule.plaque', '20DCC874'),
          champ('vehicule.modele', 'Komoda'),
          champ('vehicule.couleur', 'gris'),
        ],
      }).expect(201);

      const fiche = reponse.body as FicheEntiteDto;

      expect(fiche.libelle).toBe('20DCC874');
      expect(fiche.valeurs).toMatchObject({
        plaque: '20DCC874',
        modele: 'Komoda',
        couleur: 'gris',
      });

      idVehicule = fiche.id;
    });

    it('affiche les champs non renseignés — l’absence est une information', async () => {
      const reponse = await creerEntite(junior, {
        typeEntiteId: referentiel.types.lieu,
        ...PROVENANCE,
        champs: [champ('lieu.nom', 'Entrepôt Est')],
      }).expect(201);

      const fiche = reponse.body as FicheEntiteDto;
      const adresse = fiche.champs.find((element) => element.cle === 'adresse');

      expect(adresse).toBeDefined();
      expect(adresse!.valeur).toBeNull();
      expect(adresse!.faits).toHaveLength(0);
    });

    it('met la projection à jour après modification d’un fait', async () => {
      const fiche = (
        await request(serveur)
          .get(`/entites/${idVehicule}`)
          .set(enTantQue(junior))
          .expect(200)
      ).body as FicheEntiteDto;

      const couleur = fiche.champs.find(
        (element) => element.cle === 'couleur',
      )!;

      await request(serveur)
        .patch(`/faits/${couleur.faits[0].id}`)
        .set(enTantQue(junior))
        .send({ valeur: 'noir' })
        .expect(200);

      const apres = (
        await request(serveur)
          .get(`/entites/${idVehicule}`)
          .set(enTantQue(junior))
          .expect(200)
      ).body as FicheEntiteDto;

      expect(apres.valeurs.couleur).toBe('noir');
    });

    it('recalcule le libellé quand le gabarit du type change', async () => {
      await request(serveur)
        .patch(`/referentiel/types-entites/${referentiel.types.vehicule}`)
        .set(enTantQue(superAdmin))
        .send({ modeleLibelle: '{plaque} — {modele}' })
        .expect(200);

      const fiche = (
        await request(serveur)
          .get(`/entites/${idVehicule}`)
          .set(enTantQue(junior))
          .expect(200)
      ).body as FicheEntiteDto;

      expect(fiche.libelle).toBe('20DCC874 — Komoda');

      await request(serveur)
        .patch(`/referentiel/types-entites/${referentiel.types.vehicule}`)
        .set(enTantQue(superAdmin))
        .send({ modeleLibelle: '{plaque}' })
        .expect(200);
    });

    it('signale un champ appuyé par plusieurs sources', async () => {
      await request(serveur)
        .post('/faits')
        .set(enTantQue(junior))
        .send({
          sujetId: idVehicule,
          nature: 'champ',
          definitionChampId: referentiel.champs['vehicule.couleur'],
          valeur: 'noir',
          source: 'Rapport d’intervention n°2291',
          fiabilite: 4,
          dateConstatation: '2026-08-07',
        })
        .expect(201);

      const fiche = (
        await request(serveur)
          .get(`/entites/${idVehicule}`)
          .set(enTantQue(junior))
          .expect(200)
      ).body as FicheEntiteDto;

      const couleur = fiche.champs.find(
        (element) => element.cle === 'couleur',
      )!;

      expect(couleur.faits).toHaveLength(2);
      expect(couleur.multiSources).toBe(true);

      expect(couleur.valeur).toBe('noir');
    });
  });

  describe('l’arête unique, lue des deux côtés', () => {
    let idVehicule = '';
    let idPersonne = '';

    it('crée un véhicule puis son propriétaire, lien compris', async () => {
      idVehicule = (
        (
          await creerEntite(junior, {
            typeEntiteId: referentiel.types.vehicule,
            ...PROVENANCE,
            champs: [champ('vehicule.plaque', '9XCV221')],
          }).expect(201)
        ).body as FicheEntiteDto
      ).id;

      idPersonne = (
        (
          await creerEntite(junior, {
            typeEntiteId: referentiel.types.personne,
            ...PROVENANCE,
            champs: [
              champ('personne.prenom', 'Tyron'),
              champ('personne.nom', 'Banks'),
            ],
            liens: [
              {
                typeLienId: referentiel.liens.proprietaire_de,
                cibleId: idVehicule,
              },
            ],
          }).expect(201)
        ).body as FicheEntiteDto
      ).id;
    });

    it('n’a stocké qu’un seul fait pour ce lien', async () => {
      const arêtes = await prisma.fait.count({
        where: {
          nature: 'lien',
          typeLienId: referentiel.liens.proprietaire_de,
          sujetId: idPersonne,
          cibleId: idVehicule,
        },
      });

      expect(arêtes).toBe(1);
    });

    it('le lit en sens direct depuis la personne', async () => {
      const fiche = (
        await request(serveur)
          .get(`/entites/${idPersonne}`)
          .set(enTantQue(junior))
          .expect(200)
      ).body as FicheEntiteDto;

      expect(fiche.liens).toHaveLength(1);
      expect(fiche.liens[0]).toMatchObject({
        sens: 'direct',
        libelle: 'propriétaire de',
      });
      expect(fiche.liens[0].autreEntite.libelle).toBe('9XCV221');
    });

    it('le lit en sens inverse depuis le véhicule, avec le libellé inverse', async () => {
      const fiche = (
        await request(serveur)
          .get(`/entites/${idVehicule}`)
          .set(enTantQue(junior))
          .expect(200)
      ).body as FicheEntiteDto;

      expect(fiche.liens).toHaveLength(1);
      expect(fiche.liens[0]).toMatchObject({
        sens: 'inverse',
        libelle: 'appartient à',
      });
      expect(fiche.liens[0].autreEntite.libelle).toBe('Tyron Banks');
    });

    it('désigne le même fait des deux côtés', async () => {
      const [depuisPersonne, depuisVehicule] = await Promise.all([
        request(serveur)
          .get(`/entites/${idPersonne}`)
          .set(enTantQue(junior))
          .expect(200),
        request(serveur)
          .get(`/entites/${idVehicule}`)
          .set(enTantQue(junior))
          .expect(200),
      ]);

      expect((depuisPersonne.body as FicheEntiteDto).liens[0].faitId).toBe(
        (depuisVehicule.body as FicheEntiteDto).liens[0].faitId,
      );
    });
  });

  describe('unicité', () => {
    it('refuse une plaque déjà attribuée à un autre véhicule', async () => {
      const reponse = await creerEntite(junior, {
        typeEntiteId: referentiel.types.vehicule,
        ...PROVENANCE,
        champs: [champ('vehicule.plaque', '20DCC874')],
      }).expect(409);

      expect((reponse.body as { message: string }).message).toMatch(/20DCC874/);
    });

    it('la refuse aussi écrite autrement — la comparaison est normalisée', async () => {
      await creerEntite(junior, {
        typeEntiteId: referentiel.types.vehicule,
        ...PROVENANCE,
        champs: [champ('vehicule.plaque', '  20dcc874 ')],
      }).expect(409);
    });

    it('accepte deux sources affirmant la même plaque sur le même véhicule', async () => {
      const vehicule = (
        (
          await creerEntite(junior, {
            typeEntiteId: referentiel.types.vehicule,
            ...PROVENANCE,
            champs: [champ('vehicule.plaque', '7HHZ903')],
          }).expect(201)
        ).body as FicheEntiteDto
      ).id;

      await request(serveur)
        .post('/faits')
        .set(enTantQue(junior))
        .send({
          sujetId: vehicule,
          nature: 'champ',
          definitionChampId: referentiel.champs['vehicule.plaque'],
          valeur: '7HHZ903',
          source: 'Centrale SAPD',
          fiabilite: 4,
          dateConstatation: '2026-08-07',
        })
        .expect(201);
    });
  });

  describe('validation dynamique', () => {
    it('refuse un champ obligatoire absent', async () => {
      const reponse = await creerEntite(junior, {
        typeEntiteId: referentiel.types.vehicule,
        ...PROVENANCE,
        champs: [champ('vehicule.modele', 'Sultan')],
      }).expect(400);

      expect((reponse.body as { message: string }).message).toMatch(/Plaque/);
    });

    it('refuse une valeur hors de la liste fermée', async () => {
      await creerEntite(junior, {
        typeEntiteId: referentiel.types.vehicule,
        ...PROVENANCE,
        champs: [
          champ('vehicule.plaque', '1AAA111'),
          champ('vehicule.couleur', 'turquoise'),
        ],
      }).expect(400);
    });

    it('refuse un texte là où un nombre ou une date est attendu', async () => {
      await creerEntite(junior, {
        typeEntiteId: referentiel.types.personne,
        ...PROVENANCE,
        champs: [
          champ('personne.prenom', 'Test'),
          champ('personne.nom', 'Test'),
          champ('personne.date_de_naissance', 'hier'),
        ],
      }).expect(400);
    });

    it('refuse un champ étranger au type', async () => {
      await creerEntite(junior, {
        typeEntiteId: referentiel.types.lieu,
        ...PROVENANCE,
        champs: [champ('vehicule.plaque', '2BBB222')],
      }).expect(400);
    });
  });

  describe('faits — invariants', () => {
    let idLieu = '';

    beforeAll(async () => {
      idLieu = (
        (
          await creerEntite(junior, {
            typeEntiteId: referentiel.types.lieu,
            ...PROVENANCE,
            champs: [champ('lieu.nom', 'Villa Madrina')],
          }).expect(201)
        ).body as FicheEntiteDto
      ).id;
    });

    it('refuse un fait sans source', async () => {
      await creerEntite(junior, {
        typeEntiteId: referentiel.types.lieu,
        fiabilite: 4,
        dateConstatation: '2026-08-06',
        champs: [champ('lieu.nom', 'Sans source')],
      }).expect(400);
    });

    it('refuse une fiabilité hors des quatre niveaux', async () => {
      await creerEntite(junior, {
        typeEntiteId: referentiel.types.lieu,
        source: 'Essai',
        fiabilite: 7,
        dateConstatation: '2026-08-06',
        champs: [champ('lieu.nom', 'Fiabilité impossible')],
      }).expect(400);
    });

    it('refuse un lien hors de son domaine', async () => {
      await request(serveur)
        .post('/faits')
        .set(enTantQue(junior))
        .send({
          sujetId: idLieu,
          nature: 'lien',
          typeLienId: referentiel.liens.proprietaire_de,
          cibleId: idLieu,
          ...PROVENANCE,
        })
        .expect(400);
    });

    it('refuse un lien d’une entité vers elle-même', async () => {
      const groupe = (
        (
          await creerEntite(junior, {
            typeEntiteId: referentiel.types.groupe,
            ...PROVENANCE,
            champs: [champ('groupe.nom', 'Boucle')],
          }).expect(201)
        ).body as FicheEntiteDto
      ).id;

      await request(serveur)
        .post('/faits')
        .set(enTantQue(junior))
        .send({
          sujetId: groupe,
          nature: 'lien',
          typeLienId: referentiel.liens.qg_de,
          cibleId: groupe,
          ...PROVENANCE,
        })
        .expect(400);
    });

    it('refuse à un junior de créer une entité sans la permission', async () => {
      const lieu = (
        (
          await creerEntite(junior, {
            typeEntiteId: referentiel.types.lieu,
            ...PROVENANCE,
            champs: [champ('lieu.nom', 'À archiver')],
          }).expect(201)
        ).body as FicheEntiteDto
      ).id;

      await request(serveur)
        .post(`/entites/${lieu}/archiver`)
        .set(enTantQue(junior))
        .expect(403);

      await request(serveur)
        .post(`/entites/${lieu}/archiver`)
        .set(enTantQue(superAdmin))
        .expect(200);
    });
  });

  describe('annulation d’une saisie en cascade', () => {
    it('retire l’entité que le sous-formulaire venait de persister', async () => {
      const id = (
        (
          await creerEntite(junior, {
            typeEntiteId: referentiel.types.lieu,
            ...PROVENANCE,
            champs: [champ('lieu.nom', 'Saisie abandonnée')],
          }).expect(201)
        ).body as FicheEntiteDto
      ).id;

      await request(serveur)
        .post(`/entites/${id}/annuler-creation`)
        .set(enTantQue(junior))
        .expect(204);

      await request(serveur)
        .get(`/entites/${id}`)
        .set(enTantQue(junior))
        .expect(404);
    });

    it('refuse d’annuler la saisie d’un autre agent', async () => {
      const id = (
        (
          await creerEntite(junior, {
            typeEntiteId: referentiel.types.lieu,
            ...PROVENANCE,
            champs: [champ('lieu.nom', 'Saisie d’un autre')],
          }).expect(201)
        ).body as FicheEntiteDto
      ).id;

      await request(serveur)
        .post(`/entites/${id}/annuler-creation`)
        .set(enTantQue(superAdmin))
        .expect(409);
    });

    it('refuse d’annuler une entité qu’un autre fait désigne déjà', async () => {
      const groupe = (
        (
          await creerEntite(junior, {
            typeEntiteId: referentiel.types.groupe,
            ...PROVENANCE,
            champs: [champ('groupe.nom', 'Déjà référencé')],
          }).expect(201)
        ).body as FicheEntiteDto
      ).id;

      await creerEntite(junior, {
        typeEntiteId: referentiel.types.personne,
        ...PROVENANCE,
        champs: [
          champ('personne.prenom', 'Lien'),
          champ('personne.nom', 'Entrant'),
        ],
        liens: [{ typeLienId: referentiel.liens.membre_de, cibleId: groupe }],
      }).expect(201);

      await request(serveur)
        .post(`/entites/${groupe}/annuler-creation`)
        .set(enTantQue(junior))
        .expect(409);
    });
  });

  describe('détection de doublons', () => {
    it('propose une entité proche par similarité de libellé', async () => {
      const reponse = await request(serveur)
        .get('/entites/similaires')
        .query({ q: '20DCC', type: referentiel.types.vehicule })
        .set(enTantQue(junior))
        .expect(200);

      const suggestions = reponse.body as SuggestionDoublonDto[];

      expect(suggestions.map((suggestion) => suggestion.libelle)).toContain(
        '20DCC874',
      );
    });

    it('distingue le doublon sûr — une valeur unique identique', async () => {
      const reponse = await request(serveur)
        .get('/entites/similaires')
        .query({ q: '20dcc874', type: referentiel.types.vehicule })
        .set(enTantQue(junior))
        .expect(200);

      const suggestions = reponse.body as SuggestionDoublonDto[];
      const sur = suggestions.find(
        (suggestion) => suggestion.libelle === '20DCC874',
      );

      expect(sur?.valeurUniqueIdentique).toBe(true);
    });

    it('ne propose rien sur une saisie trop courte', async () => {
      const reponse = await request(serveur)
        .get('/entites/similaires')
        .query({ q: '2' })
        .set(enTantQue(junior))
        .expect(200);

      expect(reponse.body).toEqual([]);
    });
  });

  describe('parcours Madrina', () => {
    let entites: Record<string, string>;

    beforeAll(async () => {
      await prisma.$executeRawUnsafe(
        'TRUNCATE TABLE valeur_unique, fait, entite RESTART IDENTITY CASCADE',
      );

      entites = await madrina.peuplerParcours(superAdmin.id);
    });

    it('a créé les onze entités du parcours', () => {
      expect(Object.keys(entites)).toHaveLength(11);
    });

    it('ne trace aucun lien direct entre Isadora et Tyron', async () => {
      const direct = await prisma.fait.count({
        where: {
          nature: 'lien',
          OR: [
            { sujetId: entites.isadora, cibleId: entites.tyron },
            { sujetId: entites.tyron, cibleId: entites.isadora },
          ],
        },
      });

      expect(direct).toBe(0);
    });

    it('relie pourtant les véhicules d’Isadora aux deux braquages de Tyron', async () => {
      const vehiculesDIsadora = await prisma.fait.findMany({
        where: {
          sujetId: entites.isadora,
          nature: 'lien',
          typeLienId: (
            await prisma.typeLien.findUniqueOrThrow({
              where: { code: 'proprietaire_de' },
            })
          ).id,
        },
        select: { cibleId: true },
      });

      expect(vehiculesDIsadora).toHaveLength(2);

      const evenements = await prisma.fait.findMany({
        where: {
          sujetId: {
            in: vehiculesDIsadora.map((lien) => lien.cibleId as string),
          },
          nature: 'lien',
        },
        select: { cibleId: true },
      });

      const cibles = evenements.map((lien) => lien.cibleId);
      expect(cibles).toContain(entites.braquageBijouterie);
      expect(cibles).toContain(entites.braquageFourgon);

      const tyronAuxDeux = await prisma.fait.count({
        where: {
          sujetId: entites.tyron,
          nature: 'lien',
          cibleId: {
            in: [entites.braquageBijouterie, entites.braquageFourgon],
          },
        },
      });

      expect(tyronAuxDeux).toBe(2);
    });

    it('affiche la fiche du groupe avec ses liens entrants', async () => {
      const fiche = (
        await request(serveur)
          .get(`/entites/${entites.madrina}`)
          .set(enTantQue(junior))
          .expect(200)
      ).body as FicheEntiteDto;

      expect(fiche.libelle).toBe('Madrina');
      expect(fiche.note).toMatch(/à surveiller/i);

      const inverses = fiche.liens.filter((lien) => lien.sens === 'inverse');
      const libelles = inverses.map((lien) => lien.autreEntite.libelle);

      expect(libelles).toContain('Tyron Banks');
      expect(libelles).toContain('Villa Madrina');
      expect(libelles).toContain('20DCC874');
    });
  });
});
