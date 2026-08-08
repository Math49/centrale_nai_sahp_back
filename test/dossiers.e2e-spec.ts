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
import type {
  DossierResumeDto,
  PanneauDossierDto,
} from '../src/dossiers/dossiers.dto';
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
 * Recette du lot 8 : une entité suivie par deux dossiers apparaît dans les deux
 * sans duplication, et la mention du double rattachement s'affiche sur sa fiche.
 */
describe('Lot 8 — dossiers (e2e)', () => {
  let application: INestApplication;
  let serveur: Server;
  let prisma: PrismaService;

  let superAdmin: Compte;
  let senior: Compte;
  let junior: Compte;
  let referentiel: ReferentielInstalle;

  let idMadrina = '';
  let idRival = '';
  let idTyron = '';

  let idDossierMadrina = '';
  let idDossierRival = '';

  const enTantQue = (compte: Compte) => ({
    Authorization: `Bearer ${compte.jeton}`,
  });

  const PROVENANCE = {
    source: 'Planque du 06/08',
    fiabilite: 4,
    dateConstatation: '2026-08-06',
  };

  const champ = (cle: string, valeur: unknown) => ({
    definitionChampId: referentiel.champs[cle],
    valeur,
  });

  const creerEntite = async (
    compte: Compte,
    corps: Record<string, unknown>,
  ): Promise<string> => {
    const reponse = await request(serveur)
      .post('/entites')
      .set(enTantQue(compte))
      .send(corps)
      .expect(201);

    return (reponse.body as FicheEntiteDto).id;
  };

  const fiche = async (compte: Compte, id: string) =>
    (
      await request(serveur)
        .get(`/entites/${id}`)
        .set(enTantQue(compte))
        .expect(200)
    ).body as FicheEntiteDto;

  const panneau = async (compte: Compte, id: string, statut = 200) =>
    (
      await request(serveur)
        .get(`/dossiers/${id}`)
        .set(enTantQue(compte))
        .expect(statut)
    ).body as PanneauDossierDto;

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

    referentiel = await application
      .get(MadrinaService)
      .installerReferentiel(superAdmin.id);

    idMadrina = await creerEntite(superAdmin, {
      typeEntiteId: referentiel.types.groupe,
      ...PROVENANCE,
      champs: [champ('groupe.nom', 'Madrina')],
    });

    idRival = await creerEntite(superAdmin, {
      typeEntiteId: referentiel.types.groupe,
      ...PROVENANCE,
      champs: [champ('groupe.nom', 'Los Vagos')],
    });

    idTyron = await creerEntite(superAdmin, {
      typeEntiteId: referentiel.types.personne,
      ...PROVENANCE,
      champs: [
        champ('personne.prenom', 'Tyron'),
        champ('personne.nom', 'Banks'),
      ],
    });
  });

  afterAll(async () => {
    await application?.close();
  });

  describe('création', () => {
    it('ancre le dossier sur une entité pivot et la suit d’emblée', async () => {
      const reponse = await request(serveur)
        .post('/dossiers')
        .set(enTantQue(senior))
        .send({ nom: 'Madrina', entitePivotId: idMadrina })
        .expect(201);

      const dossier = reponse.body as PanneauDossierDto;
      idDossierMadrina = dossier.id;

      expect(dossier.entitePivotLibelle).toBe('Madrina');
      expect(dossier.suivis).toHaveLength(1);
      expect(dossier.suivis[0].estPivot).toBe(true);
    });

    it('refuse un nom déjà pris', async () => {
      await request(serveur)
        .post('/dossiers')
        .set(enTantQue(senior))
        .send({ nom: 'Madrina', entitePivotId: idRival })
        .expect(409);
    });

    it('reste ouvert à un junior — création et modification sont dans son grade', async () => {
      const reponse = await request(serveur)
        .post('/dossiers')
        .set(enTantQue(junior))
        .send({ nom: 'Repérage Vespucci', entitePivotId: idRival })
        .expect(201);

      // Ce qu'il n'a pas, c'est le droit de le soustraire aux autres.
      await request(serveur)
        .patch(`/dossiers/${(reponse.body as PanneauDossierDto).id}`)
        .set(enTantQue(junior))
        .send({ visibilite: Visibilite.prive })
        .expect(403);
    });

    it('exige visibilite.definir pour classer un dossier', async () => {
      // Le Senior n'a pas cette permission : sans elle, tout agent pourrait
      // soustraire une enquête au regard des autres.
      const reponse = await request(serveur)
        .post('/dossiers')
        .set(enTantQue(senior))
        .send({
          nom: 'Enquête discrète',
          entitePivotId: idRival,
          visibilite: Visibilite.prive,
        })
        .expect(403);

      expect((reponse.body as { message: string }).message).toMatch(
        /visibilite\.definir/,
      );
    });

    it('l’accorde à qui la détient', async () => {
      const reponse = await request(serveur)
        .post('/dossiers')
        .set(enTantQue(superAdmin))
        .send({
          nom: 'Los Vagos',
          entitePivotId: idRival,
          visibilite: Visibilite.public,
          note: 'Rivalité avec Madrina à confirmer.',
        })
        .expect(201);

      idDossierRival = (reponse.body as PanneauDossierDto).id;
    });
  });

  describe('une entité, deux dossiers, aucune duplication', () => {
    beforeAll(async () => {
      for (const dossier of [idDossierMadrina, idDossierRival]) {
        await request(serveur)
          .post(`/dossiers/${dossier}/suivi`)
          .set(enTantQue(senior))
          .send({ entiteId: idTyron })
          .expect(204);
      }
    });

    it('apparaît dans les deux suivis', async () => {
      const [madrina, vagos] = await Promise.all([
        panneau(senior, idDossierMadrina),
        panneau(senior, idDossierRival),
      ]);

      expect(madrina.suivis.some((suivi) => suivi.id === idTyron)).toBe(true);
      expect(vagos.suivis.some((suivi) => suivi.id === idTyron)).toBe(true);
    });

    it('sans que l’entité soit dupliquée', async () => {
      const exemplaires = await prisma.sansFiltre.entite.count({
        where: { id: idTyron },
      });

      const rattachements = await prisma.sansFiltre.suivi.count({
        where: { entiteId: idTyron },
      });

      expect(exemplaires).toBe(1);
      expect(rattachements).toBe(2);
    });

    it('et sa fiche mentionne le double rattachement', async () => {
      const vue = await fiche(senior, idTyron);

      expect(vue.dossiers.map((dossier) => dossier.nom).sort()).toEqual([
        'Los Vagos',
        'Madrina',
      ]);
      expect(vue.dossiers.every((dossier) => !dossier.estPivot)).toBe(true);
    });

    it('la fiche du pivot le signale comme tel', async () => {
      const vue = await fiche(senior, idMadrina);

      expect(vue.dossiers).toHaveLength(1);
      expect(vue.dossiers[0]).toMatchObject({
        nom: 'Madrina',
        estPivot: true,
      });
    });

    it('l’entité pivot ne se retire pas du suivi', async () => {
      await request(serveur)
        .delete(`/dossiers/${idDossierMadrina}/suivi/${idMadrina}`)
        .set(enTantQue(senior))
        .expect(409);
    });

    it('une entité ordinaire, si', async () => {
      await request(serveur)
        .delete(`/dossiers/${idDossierRival}/suivi/${idTyron}`)
        .set(enTantQue(senior))
        .expect(204);

      const vue = await fiche(senior, idTyron);
      expect(vue.dossiers.map((dossier) => dossier.nom)).toEqual(['Madrina']);

      await request(serveur)
        .post(`/dossiers/${idDossierRival}/suivi`)
        .set(enTantQue(senior))
        .send({ entiteId: idTyron })
        .expect(204);
    });
  });

  describe('saisie depuis un dossier', () => {
    it('fait entrer l’entité créée dans le suivi', async () => {
      const idVehicule = await creerEntite(senior, {
        typeEntiteId: referentiel.types.vehicule,
        ...PROVENANCE,
        dossierId: idDossierMadrina,
        champs: [champ('vehicule.plaque', '20DCC874')],
      });

      const vue = await fiche(senior, idVehicule);
      expect(vue.dossiers.map((dossier) => dossier.nom)).toEqual(['Madrina']);
    });
  });

  describe('visibilité du dossier', () => {
    beforeAll(async () => {
      await request(serveur)
        .patch(`/dossiers/${idDossierRival}`)
        .set(enTantQue(superAdmin))
        .send({ visibilite: Visibilite.prive })
        .expect(200);
    });

    it('un dossier privé disparaît de la liste, sans mention', async () => {
      const [vuJunior, vuSuperAdmin] = await Promise.all([
        request(serveur).get('/dossiers').set(enTantQue(junior)).expect(200),
        request(serveur)
          .get('/dossiers')
          .set(enTantQue(superAdmin))
          .expect(200),
      ]);

      const noms = (reponse: { body: unknown }) =>
        (reponse.body as DossierResumeDto[]).map((dossier) => dossier.nom);

      expect(noms(vuJunior)).not.toContain('Los Vagos');
      expect(noms(vuSuperAdmin)).toContain('Los Vagos');
    });

    it('son panneau répond 404, jamais 403', async () => {
      await panneau(junior, idDossierRival, 404);
    });

    it('et la fiche de l’entité ne le mentionne plus', async () => {
      const vue = await fiche(junior, idTyron);

      expect(vue.dossiers.map((dossier) => dossier.nom)).toEqual(['Madrina']);
    });

    it('une habilitation nominative le rouvre', async () => {
      await request(serveur)
        .post(`/dossiers/${idDossierRival}/habilitations`)
        .set(enTantQue(superAdmin))
        .send({ agentId: junior.id })
        .expect(204);

      const vue = await panneau(junior, idDossierRival);
      expect(vue.nom).toBe('Los Vagos');
      expect(vue.contenuLisible).toBe(true);
      expect(vue.habilitations.map((agent) => agent.matricule)).toContain(
        'ji-003',
      );
    });

    it('la retirer le referme', async () => {
      await request(serveur)
        .delete(`/dossiers/${idDossierRival}/habilitations/${junior.id}`)
        .set(enTantQue(superAdmin))
        .expect(204);

      await panneau(junior, idDossierRival, 404);
    });
  });

  describe('dossier restreint — objet visible, contenu fermé', () => {
    beforeAll(async () => {
      await request(serveur)
        .patch(`/dossiers/${idDossierRival}`)
        .set(enTantQue(superAdmin))
        .send({ visibilite: Visibilite.restreint })
        .expect(200);
    });

    it('montre son nom mais tait son suivi et sa whitelist', async () => {
      const vue = await panneau(junior, idDossierRival);

      expect(vue.nom).toBe('Los Vagos');
      expect(vue.contenuLisible).toBe(false);
      expect(vue.note).toBeNull();
      expect(vue.suivis).toEqual([]);
      expect(vue.habilitations).toEqual([]);
    });

    it('le livre entier à qui y a droit', async () => {
      const vue = await panneau(superAdmin, idDossierRival);

      expect(vue.contenuLisible).toBe(true);
      expect(vue.note).toMatch(/Rivalité/);
      expect(vue.suivis.length).toBeGreaterThan(0);
    });
  });
});
