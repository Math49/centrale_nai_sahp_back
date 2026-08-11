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
import type { CheminsDto, VoisinageDto } from '../src/graphe/graphe.dto';
import { MadrinaService } from '../src/semences/madrina.service';
import {
  creerCompteActif,
  reinitialiserLaBase,
  type Compte,
} from './aide-comptes';

describe('Lot 9 — graphe (e2e)', () => {
  let application: INestApplication;
  let serveur: Server;
  let dossiers: DossiersService;

  let superAdmin: Compte;
  let etatMajor: Compte;
  let senior: Compte;
  let junior: Compte;

  let entites: Record<string, string>;

  const enTantQue = (compte: Compte) => ({
    Authorization: `Bearer ${compte.jeton}`,
  });

  const voisinage = async (
    compte: Compte,
    depuis: string,
    profondeur = 1,
    fiabilite = 1,
  ) =>
    (
      await request(serveur)
        .get('/graphe')
        .query({ depuis, profondeur, fiabilite })
        .set(enTantQue(compte))
        .expect(200)
    ).body as VoisinageDto;

  const chemin = async (compte: Compte, de: string, vers: string) =>
    (
      await request(serveur)
        .get('/graphe/chemin')
        .query({ de, vers })
        .set(enTantQue(compte))
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
    dossiers = application.get(DossiersService);

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

    senior = await creerCompteActif(application, {
      matricule: 'si-003',
      prenom: 'Noa',
      nom: 'Duval',
      roleCode: CODE_SENIOR,
    });

    junior = await creerCompteActif(application, {
      matricule: 'ji-004',
      prenom: 'Sasha',
      nom: 'Vane',
      roleCode: CODE_JUNIOR,
    });

    const madrina = application.get(MadrinaService);
    await madrina.installerReferentiel(superAdmin.id);
    entites = await madrina.peuplerParcours(superAdmin.id);
  });

  afterAll(async () => {
    await application?.close();
  });

  describe('exploration par expansion', () => {
    it('rend le voisinage immédiat', async () => {
      const vue = await voisinage(junior, entites.madrina, 1);

      const libelles = vue.noeuds.map((noeud) => noeud.libelle);

      expect(libelles).toContain('Madrina');
      expect(libelles).toContain('Tyron Banks');
      expect(libelles).toContain('Villa Madrina');
      expect(libelles).toContain('20DCC874');
    });

    it('compte les voisins qu’il reste à déplier', async () => {
      const vue = await voisinage(junior, entites.madrina, 1);
      const tyron = vue.noeuds.find(
        (noeud) => noeud.libelle === 'Tyron Banks',
      )!;

      expect(tyron.voisinsNonAffiches).toBeGreaterThan(0);
    });

    it('s’étend avec la profondeur', async () => {
      const [proche, large] = await Promise.all([
        voisinage(junior, entites.madrina, 1),
        voisinage(junior, entites.madrina, 3),
      ]);

      expect(large.noeuds.length).toBeGreaterThan(proche.noeuds.length);
      expect(large.noeuds.map((noeud) => noeud.libelle)).toContain(
        'Isadora Morales',
      );
    });

    it('écarte les arêtes sous le seuil de fiabilité', async () => {
      const [toutes, certaines] = await Promise.all([
        voisinage(junior, entites.madrina, 2, 1),
        voisinage(junior, entites.madrina, 2, 4),
      ]);

      expect(certaines.aretes.length).toBeLessThan(toutes.aretes.length);
      expect(certaines.aretes.every((arete) => arete.fiabilite >= 4)).toBe(
        true,
      );
    });
  });

  describe('le rapprochement tombe seul', () => {
    it('relie Isadora à la villa, sans qu’aucun lien direct existe', async () => {
      const resultat = await chemin(junior, entites.isadora, entites.villa);

      expect(resultat.plusCourt).not.toBeNull();
      expect(resultat.plusCourt!.longueur).toBeGreaterThan(2);

      const libelles = resultat.plusCourt!.noeuds.map((noeud) => noeud.libelle);

      expect(libelles[0]).toBe('Isadora Morales');
      expect(libelles[libelles.length - 1]).toBe('Villa Madrina');

      expect(libelles.some((libelle) => libelle.startsWith('Braquage'))).toBe(
        true,
      );
    });

    it('relie Isadora à Tyron, que rien ne relie directement', async () => {
      const resultat = await chemin(junior, entites.isadora, entites.tyron);

      expect(resultat.plusCourt).not.toBeNull();

      expect(resultat.plusCourt!.longueur).toBeGreaterThanOrEqual(3);

      const libelles = resultat.plusCourt!.noeuds.map((noeud) => noeud.libelle);
      expect(libelles).toContain('Isadora Morales');
      expect(libelles).toContain('Tyron Banks');
    });

    it('donne la fiabilité du chemin par son maillon le plus faible', async () => {
      const resultat = await chemin(junior, entites.isadora, entites.villa);

      const minimum = Math.min(
        ...resultat.plusCourt!.aretes.map((arete) => arete.fiabilite),
      );

      expect(resultat.plusCourt!.maillonLeFaible).toBe(minimum);
    });

    it('signale Tyron et les braquages comme récurrences', async () => {
      const madrina = await dossiers.creer(superAdmin.id, {
        nom: 'Madrina',
        entitePivotId: entites.madrina,
      });
      const fourgon = await dossiers.creer(superAdmin.id, {
        nom: 'Fourgon',
        entitePivotId: entites.braquageFourgon,
      });

      await dossiers.suivre(
        superAdmin.id,
        madrina.id,
        entites.braquageBijouterie,
      );
      await dossiers.suivre(superAdmin.id, fourgon.id, entites.braquageFourgon);

      const vue = await voisinage(junior, entites.tyron, 1);
      const tyron = vue.noeuds.find((noeud) => noeud.id === entites.tyron)!;

      expect(tyron.recurrence).toBe(true);
    });
  });

  describe('élagage avant traversée', () => {
    it('un lien masqué rend le chemin inexistant, pas masqué', async () => {
      const avant = await chemin(junior, entites.isadora, entites.villa);
      expect(avant.plusCourt).not.toBeNull();

      await request(serveur)
        .patch(`/entites/${entites.braquageBijouterie}`)
        .set(enTantQue(superAdmin))
        .send({ visibilite: Visibilite.prive })
        .expect(200);

      const apres = await chemin(junior, entites.isadora, entites.villa);

      expect(apres.plusCourt).not.toBeNull();
      expect(apres.plusCourt!.longueur).toBeGreaterThanOrEqual(
        avant.plusCourt!.longueur,
      );

      const passeEncore = apres.plusCourt!.noeuds.some(
        (noeud) => noeud.id === entites.braquageBijouterie,
      );
      expect(passeEncore).toBe(false);
    });

    it('coupe complètement le chemin quand les deux braquages sont soustraits', async () => {
      await request(serveur)
        .patch(`/entites/${entites.braquageFourgon}`)
        .set(enTantQue(superAdmin))
        .send({ visibilite: Visibilite.prive })
        .expect(200);

      const resultat = await chemin(junior, entites.isadora, entites.villa);

      expect(resultat.plusCourt).toBeNull();
      expect(resultat.plusSolide).toBeNull();
    });

    it('le même chemin reste entier pour l’État-Major', async () => {
      const resultat = await chemin(etatMajor, entites.isadora, entites.villa);

      expect(resultat.plusCourt).not.toBeNull();
      expect(
        resultat.plusCourt!.noeuds.some(
          (noeud) => noeud.id === entites.braquageBijouterie,
        ),
      ).toBe(true);
    });

    it('une habilitation nominative rouvre le passage', async () => {
      const avant = await chemin(senior, entites.isadora, entites.villa);
      expect(avant.plusCourt).toBeNull();

      await dossiers.habiliterSurEntite(
        superAdmin.id,
        entites.braquageBijouterie,
        senior.id,
      );

      const apres = await chemin(senior, entites.isadora, entites.villa);
      expect(apres.plusCourt).not.toBeNull();
    });

    it('une entité privée n’est même pas un point de départ', async () => {
      await request(serveur)
        .get('/graphe')
        .query({ depuis: entites.braquageFourgon, profondeur: 1 })
        .set(enTantQue(junior))
        .expect(404);
    });
  });

  describe('disposition mémorisée', () => {
    it('refuse le repositionnement sans la permission', async () => {
      await request(serveur)
        .post('/graphe/positions')
        .set(enTantQue(junior))
        .send({ positions: [{ entiteId: entites.madrina, x: 10, y: 20 }] })
        .expect(403);
    });

    it('enregistre la disposition globale et la rend à tous', async () => {
      await request(serveur)
        .post('/graphe/positions')
        .set(enTantQue(senior))
        .send({ positions: [{ entiteId: entites.madrina, x: 120, y: 240 }] })
        .expect(204);

      const vue = await voisinage(junior, entites.madrina, 1);
      const madrina = vue.noeuds.find((noeud) => noeud.id === entites.madrina)!;

      expect(madrina.x).toBe(120);
      expect(madrina.y).toBe(240);
    });

    it('remplace la position au lieu d’en accumuler', async () => {
      await request(serveur)
        .post('/graphe/positions')
        .set(enTantQue(senior))
        .send({ positions: [{ entiteId: entites.madrina, x: 5, y: 6 }] })
        .expect(204);

      const vue = await voisinage(junior, entites.madrina, 1);
      const madrina = vue.noeuds.find((noeud) => noeud.id === entites.madrina)!;

      expect(madrina.x).toBe(5);
    });
  });
});
