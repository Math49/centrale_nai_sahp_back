import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Visibilite } from '@prisma/client';
import type { Server } from 'node:http';
import request from 'supertest';

import {
  CODE_ETAT_MAJOR,
  CODE_JUNIOR,
  CODE_SENIOR,
} from '../src/agents/grades';
import { AppModule } from '../src/app.module';
import { DossiersService } from '../src/dossiers/dossiers.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { MadrinaService } from '../src/semences/madrina.service';
import type {
  AccueilDto,
  ResultatRechercheDto,
  SignalDto,
} from '../src/signaux/signaux.dto';
import {
  creerCompteActif,
  reinitialiserLaBase,
  type Compte,
} from './aide-comptes';

/**
 * Recette du lot 10 : le signal de récurrence sur le véhicule 8KLM apparaît
 * **sans intervention**, et disparaît pour un agent non habilité.
 *
 * Les deux moitiés comptent autant l'une que l'autre. La première dit que la
 * centrale rapproche seule ; la seconde, qu'elle ne rapproche que sur ce que
 * l'agent a le droit de voir — un signal est un raccourci vers une information,
 * et un raccourci vers ce qui est masqué en révélerait l'existence.
 */
describe('Lot 10 — signaux et accueil (e2e)', () => {
  let application: INestApplication;
  let serveur: Server;
  let dossiers: DossiersService;
  let prisma: PrismaService;

  let superAdmin: Compte;
  let etatMajor: Compte;
  let senior: Compte;
  let junior: Compte;

  let entites: Record<string, string>;
  let dossierMadrina: string;
  let dossierMorales: string;

  const enTantQue = (compte: Compte) => ({
    Authorization: `Bearer ${compte.jeton}`,
  });

  const signaux = async (compte: Compte) =>
    (await request(serveur).get('/signaux').set(enTantQue(compte)).expect(200))
      .body as SignalDto[];

  const accueil = async (compte: Compte) =>
    (await request(serveur).get('/accueil').set(enTantQue(compte)).expect(200))
      .body as AccueilDto;

  const rechercher = async (compte: Compte, q: string) =>
    (
      await request(serveur)
        .get('/recherche')
        .query({ q })
        .set(enTantQue(compte))
        .expect(200)
    ).body as ResultatRechercheDto[];

  const surLeVehicule = (liste: SignalDto[], famille: string) =>
    liste.some(
      (signal) =>
        signal.famille === famille && signal.entiteId === entites.sultan,
    );

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
    dossiers = application.get(DossiersService);
    prisma = application.get(PrismaService);

    await reinitialiserLaBase(application);

    superAdmin = await creerCompteActif(application, {
      matricule: 'sa-101',
      prenom: 'Mathis',
      nom: 'Mercier',
      roleCode: CODE_ETAT_MAJOR,
      superAdmin: true,
    });

    etatMajor = await creerCompteActif(application, {
      matricule: 'em-102',
      prenom: 'Alix',
      nom: 'Reyes',
      roleCode: CODE_ETAT_MAJOR,
    });

    senior = await creerCompteActif(application, {
      matricule: 'si-103',
      prenom: 'Noa',
      nom: 'Duval',
      roleCode: CODE_SENIOR,
    });

    junior = await creerCompteActif(application, {
      matricule: 'ji-104',
      prenom: 'Sasha',
      nom: 'Vane',
      roleCode: CODE_JUNIOR,
    });

    const madrina = application.get(MadrinaService);
    await madrina.installerReferentiel(superAdmin.id);
    entites = await madrina.peuplerParcours(superAdmin.id);

    // Deux enquêtes ouvertes séparément, comme dans le parcours de l'annexe B :
    // personne ne les rapproche, et surtout personne n'a tracé de lien entre
    // Isadora Morales et Tyron Banks.
    const enquete = await dossiers.creer(superAdmin.id, {
      nom: 'Groupe Madrina',
      entitePivotId: entites.madrina,
    });
    dossierMadrina = enquete.id;

    const morales = await dossiers.creer(senior.id, {
      nom: 'Morales',
      entitePivotId: entites.isadora,
    });
    dossierMorales = morales.id;

    await dossiers.suivre(
      superAdmin.id,
      dossierMadrina,
      entites.braquageBijouterie,
    );
    await dossiers.suivre(
      senior.id,
      dossierMorales,
      entites.braquageBijouterie,
    );
  });

  afterAll(async () => {
    await application?.close();
  });

  describe('le signal tombe seul', () => {
    it('signale le véhicule 8KLM204 en récurrence, sans intervention', async () => {
      const liste = await signaux(junior);

      // Le Sultan relie le braquage, suivi par l'enquête Madrina, à sa
      // propriétaire, pivot d'une autre enquête. Aucun agent ne l'a rapproché.
      expect(surLeVehicule(liste, 'recurrence')).toBe(true);

      const signal = liste.find(
        (candidat) =>
          candidat.famille === 'recurrence' &&
          candidat.entiteId === entites.sultan,
      )!;

      expect(signal.entiteLibelle).toBe('8KLM204');
      expect(signal.typeCode).toBe('vehicule');
    });

    it('signale le braquage en recoupement entre deux enquêtes', async () => {
      const liste = await signaux(junior);

      const recoupement = liste.find(
        (signal) =>
          signal.famille === 'recoupement' &&
          signal.entiteId === entites.braquageBijouterie,
      );

      expect(recoupement).toBeDefined();
      expect(recoupement!.detail).toContain('Groupe Madrina');
      expect(recoupement!.detail).toContain('Morales');
    });

    it('se tait quand les pivots des deux dossiers sont déjà reliés', async () => {
      // Tyron et son véhicule : le rapprochement est connu, le dire à nouveau
      // n'apprendrait rien.
      const banks = await dossiers.creer(superAdmin.id, {
        nom: 'Banks',
        entitePivotId: entites.tyron,
      });
      const komoda = await dossiers.creer(superAdmin.id, {
        nom: 'Komoda gris',
        entitePivotId: entites.komoda,
      });

      await dossiers.suivre(superAdmin.id, banks.id, entites.bijouterie);
      await dossiers.suivre(superAdmin.id, komoda.id, entites.bijouterie);

      const liste = await signaux(junior);

      expect(
        liste.some(
          (signal) =>
            signal.famille === 'recoupement' &&
            signal.entiteId === entites.bijouterie,
        ),
      ).toBe(false);
    });
  });

  describe('et disparaît pour un agent non habilité', () => {
    it('soustrait la récurrence quand une des deux enquêtes passe en privé', async () => {
      await request(serveur)
        .patch(`/dossiers/${dossierMorales}`)
        .set(enTantQue(etatMajor))
        .send({ visibilite: Visibilite.prive })
        .expect(200);

      const liste = await signaux(junior);

      // Ni le signal, ni une mention de signal masqué : le second dossier
      // n'existe pas pour cet agent.
      expect(surLeVehicule(liste, 'recurrence')).toBe(false);
      expect(surLeVehicule(liste, 'recoupement')).toBe(false);
    });

    it('le laisse entier pour qui dispose de la dérogation', async () => {
      const liste = await signaux(etatMajor);

      expect(surLeVehicule(liste, 'recurrence')).toBe(true);
    });

    it('le rend à qui est habilité nommément', async () => {
      await request(serveur)
        .post(`/dossiers/${dossierMorales}/habilitations`)
        .set(enTantQue(etatMajor))
        .send({ agentId: junior.id })
        .expect(204);

      const liste = await signaux(junior);

      expect(surLeVehicule(liste, 'recurrence')).toBe(true);
    });

    it('ne recoupe jamais sur un dossier dont le contenu est fermé', async () => {
      // Restreint : le dossier reste visible, son suivi non. Le recoupement
      // dirait qui il surveille.
      await request(serveur)
        .patch(`/dossiers/${dossierMorales}`)
        .set(enTantQue(etatMajor))
        .send({ visibilite: Visibilite.restreint })
        .expect(200);

      const liste = await signaux(senior);
      const recoupement = liste.find(
        (signal) =>
          signal.famille === 'recoupement' &&
          signal.entiteId === entites.braquageBijouterie,
      );

      expect(recoupement).toBeUndefined();

      await request(serveur)
        .patch(`/dossiers/${dossierMorales}`)
        .set(enTantQue(etatMajor))
        .send({ visibilite: Visibilite.public })
        .expect(200);
    });
  });

  describe('vieillissement', () => {
    it('remonte un fait à confirmer que personne n’a revu', async () => {
      const avant = await signaux(junior);
      expect(avant.some((signal) => signal.famille === 'vieillissement')).toBe(
        false,
      );

      // Les faits « à confirmer » du parcours datent d'aujourd'hui. On les
      // vieillit de deux mois — en désarmant le trigger d'horodatage, qui
      // réécrirait `modifie_le` à `now()` : c'est la base qui garantit qu'un
      // fait ne peut pas se déclarer revu sans l'avoir été.
      const vieux = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

      await prisma.sansFiltre.$executeRawUnsafe(
        'ALTER TABLE fait DISABLE TRIGGER trg_fait_horodatage',
      );
      await prisma.sansFiltre
        .$executeRaw`UPDATE fait SET modifie_le = ${vieux} WHERE fiabilite = 2`;
      await prisma.sansFiltre.$executeRawUnsafe(
        'ALTER TABLE fait ENABLE TRIGGER trg_fait_horodatage',
      );

      const apres = await signaux(junior);
      const vieillissements = apres.filter(
        (signal) => signal.famille === 'vieillissement',
      );

      expect(vieillissements.length).toBeGreaterThan(0);
      expect(vieillissements[0].faitId).not.toBeNull();
      expect(vieillissements[0].resume).toContain('à confirmer depuis');
      expect(vieillissements[0].detail).toContain('Source —');
    });

    it('cesse dès que le fait est revu', async () => {
      const avant = await signaux(junior);
      const cible = avant.find(
        (signal) => signal.famille === 'vieillissement',
      )!;

      // Reprendre le fait, ne serait-ce que pour en corriger la source, suffit
      // à le sortir du signal : c'est le geste que le signal appelle.
      await request(serveur)
        .patch(`/faits/${cible.faitId}`)
        .set(enTantQue(senior))
        .send({ source: 'Recoupé le 09/08 — informateur confirmé' })
        .expect(200);

      const apres = await signaux(junior);

      expect(apres.some((signal) => signal.id === cible.id)).toBe(false);
    });
  });

  describe('recherche globale', () => {
    it('trouve une entité par son libellé', async () => {
      const resultats = await rechercher(junior, 'Isadora');

      expect(resultats.some((r) => r.id === entites.isadora)).toBe(true);
      expect(resultats.find((r) => r.id === entites.isadora)!.nature).toBe(
        'entite',
      );
    });

    it('trouve un dossier par son nom', async () => {
      const resultats = await rechercher(junior, 'Madrina');

      expect(
        resultats.some(
          (r) => r.nature === 'dossier' && r.id === dossierMadrina,
        ),
      ).toBe(true);
    });

    it('n’ouvre rien à moins de deux caractères', async () => {
      expect(await rechercher(junior, 'a')).toEqual([]);
    });

    it('omet les objets privés, sans mention ni décompte', async () => {
      await request(serveur)
        .patch(`/entites/${entites.buffalo}`)
        .set(enTantQue(etatMajor))
        .send({ visibilite: Visibilite.prive })
        .expect(200);

      const pourLeJunior = await rechercher(junior, '4RTQ118');
      const pourLEtatMajor = await rechercher(etatMajor, '4RTQ118');

      expect(pourLeJunior).toEqual([]);
      expect(pourLEtatMajor.some((r) => r.id === entites.buffalo)).toBe(true);
    });
  });

  describe('accueil', () => {
    it('assemble signaux, dossiers de l’agent et dernière activité', async () => {
      const page = await accueil(senior);

      expect(Array.isArray(page.signaux)).toBe(true);
      expect(page.derniereActivite.length).toBeGreaterThan(0);

      const premier = page.derniereActivite[0];
      expect(premier.source).not.toHaveLength(0);
      expect(premier.fiabilite).toBeGreaterThanOrEqual(1);
      expect(premier.auteur).toBe('Mathis Mercier');
    });

    it('distingue le dossier ouvert par l’agent de celui où il est habilité', async () => {
      const page = await accueil(senior);
      const morales = page.mesDossiers.find((d) => d.id === dossierMorales);

      expect(morales).toBeDefined();
      expect(morales!.motif).toBe('creation');
      expect(morales!.entitePivotLibelle).toBe('Isadora Morales');
    });

    it('donne à l’agent habilité le dossier qu’il n’a pas ouvert', async () => {
      const page = await accueil(junior);
      const morales = page.mesDossiers.find((d) => d.id === dossierMorales);

      expect(morales).toBeDefined();
      expect(morales!.motif).toBe('habilitation');
    });

    it('exige un jeton', async () => {
      await request(serveur).get('/accueil').expect(401);
    });
  });
});
