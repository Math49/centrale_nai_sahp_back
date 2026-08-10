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
import type {
  EvenementHistoriqueDto,
  FicheEntiteDto,
} from '../src/entites/entites.dto';
import type { CheminsDto } from '../src/graphe/graphe.dto';
import type {
  EntiteOrphelineDto,
  EntreeAuditDto,
  EntreeConsultationDto,
} from '../src/journal/journal.dto';
import { PrismaService } from '../src/prisma/prisma.service';
import { MadrinaService } from '../src/semences/madrina.service';
import {
  creerCompteActif,
  reinitialiserLaBase,
  type Compte,
} from './aide-comptes';

/**
 * Recette du lot 11 : un fait infirmé sort du graphe et reste consultable dans
 * l'historique ; une fusion redirige sans perte ; une consultation super-admin
 * apparaît signalée dans le journal.
 */
describe('Lot 11 — traçabilité et cycle de vie (e2e)', () => {
  let application: INestApplication;
  let serveur: Server;
  let prisma: PrismaService;
  let dossiers: DossiersService;

  let superAdmin: Compte;
  let etatMajor: Compte;
  let senior: Compte;
  let junior: Compte;

  let entites: Record<string, string>;
  let referentiel: {
    types: Record<string, string>;
    champs: Record<string, string>;
  };

  const enTantQue = (compte: Compte) => ({
    Authorization: `Bearer ${compte.jeton}`,
  });

  const fiche = async (compte: Compte, id: string) =>
    (
      await request(serveur)
        .get(`/entites/${id}`)
        .set(enTantQue(compte))
        .expect(200)
    ).body as FicheEntiteDto;

  const historique = async (compte: Compte, id: string) =>
    (
      await request(serveur)
        .get(`/entites/${id}/historique`)
        .set(enTantQue(compte))
        .expect(200)
    ).body as EvenementHistoriqueDto[];

  const chemin = async (compte: Compte, de: string, vers: string) =>
    (
      await request(serveur)
        .get('/graphe/chemin')
        .query({ de, vers })
        .set(enTantQue(compte))
        .expect(200)
    ).body as CheminsDto;

  const audit = async (compte: Compte, filtres: Record<string, string> = {}) =>
    (
      await request(serveur)
        .get('/journal/audit')
        .query(filtres)
        .set(enTantQue(compte))
        .expect(200)
    ).body as EntreeAuditDto[];

  const consultations = async (
    compte: Compte,
    filtres: Record<string, string> = {},
  ) =>
    (
      await request(serveur)
        .get('/journal/consultations')
        .query(filtres)
        .set(enTantQue(compte))
        .expect(200)
    ).body as EntreeConsultationDto[];

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

    superAdmin = await creerCompteActif(application, {
      matricule: 'sa-201',
      prenom: 'Mathis',
      nom: 'Mercier',
      roleCode: CODE_ETAT_MAJOR,
      superAdmin: true,
    });

    etatMajor = await creerCompteActif(application, {
      matricule: 'em-202',
      prenom: 'Alix',
      nom: 'Reyes',
      roleCode: CODE_ETAT_MAJOR,
    });

    senior = await creerCompteActif(application, {
      matricule: 'si-203',
      prenom: 'Noa',
      nom: 'Duval',
      roleCode: CODE_SENIOR,
    });

    junior = await creerCompteActif(application, {
      matricule: 'ji-204',
      prenom: 'Sasha',
      nom: 'Vane',
      roleCode: CODE_JUNIOR,
    });

    const madrina = application.get(MadrinaService);
    referentiel = await madrina.installerReferentiel(superAdmin.id);
    entites = await madrina.peuplerParcours(superAdmin.id);
  });

  afterAll(async () => {
    await application?.close();
  });

  // ──────────────────────────── Infirmation ────────────────────────────

  describe('un fait infirmé sort du graphe et reste consultable', () => {
    let faitInfirme: string;

    it('exige un motif', async () => {
      const lien = await prisma.sansFiltre.fait.findFirstOrThrow({
        where: { sujetId: entites.tyron, cibleId: entites.braquageFourgon },
      });

      await request(serveur)
        .post(`/faits/${lien.id}/infirmer`)
        .set(enTantQue(senior))
        .send({})
        .expect(400);
    });

    it('refuse l’infirmation sans la permission', async () => {
      const lien = await prisma.sansFiltre.fait.findFirstOrThrow({
        where: { sujetId: entites.tyron, cibleId: entites.braquageFourgon },
      });

      await request(serveur)
        .post(`/faits/${lien.id}/infirmer`)
        .set(enTantQue(junior))
        .send({ motif: 'contredit par le rapport' })
        .expect(403);
    });

    it('retire le lien du graphe', async () => {
      const lien = await prisma.sansFiltre.fait.findFirstOrThrow({
        where: { sujetId: entites.tyron, cibleId: entites.braquageFourgon },
      });
      faitInfirme = lien.id;

      const avant = await chemin(
        junior,
        entites.tyron,
        entites.braquageFourgon,
      );
      expect(avant.plusCourt!.longueur).toBe(1);

      await request(serveur)
        .post(`/faits/${lien.id}/infirmer`)
        .set(enTantQue(senior))
        .send({ motif: 'vidéosurveillance — ce n’était pas lui' })
        .expect(200);

      const apres = await chemin(
        junior,
        entites.tyron,
        entites.braquageFourgon,
      );

      // Le lien direct a disparu. Un autre chemin peut subsister, mais plus
      // celui-là.
      expect(apres.plusCourt?.longueur ?? 99).toBeGreaterThan(1);
    });

    it('le laisse consultable dans l’historique, avec son motif', async () => {
      const evenements = await historique(senior, entites.tyron);

      expect(
        evenements.some(
          (evenement) =>
            evenement.nature === 'fait' && evenement.id === faitInfirme,
        ),
      ).toBe(true);

      const traces = await audit(etatMajor, { cible: faitInfirme });
      const infirmation = traces.find(
        (trace) => trace.action === 'fait.infirmer',
      )!;

      expect(infirmation).toBeDefined();
      expect(JSON.stringify(infirmation.apres)).toContain('ce n’était pas lui');
    });

    it('retire la valeur de la fiche et libère la plaque', async () => {
      const plaque = await prisma.sansFiltre.fait.findFirstOrThrow({
        where: {
          sujetId: entites.buffalo,
          definitionChampId: referentiel.champs['vehicule.plaque'],
        },
      });

      await request(serveur)
        .post(`/faits/${plaque.id}/infirmer`)
        .set(enTantQue(senior))
        .send({ motif: 'plaque relevée en double, erreur de saisie' })
        .expect(200);

      const apres = await fiche(senior, entites.buffalo);
      const champPlaque = apres.champs.find((champ) => champ.cle === 'plaque')!;

      // La projection ignore les faits non actifs : la base fait le travail,
      // sans que l'application ait à défaire quoi que ce soit.
      expect(champPlaque.valeur).toBeNull();

      // Et la plaque redevient attribuable, puisque `valeur_unique` se
      // recalcule par entité.
      await request(serveur)
        .post('/entites')
        .set(enTantQue(senior))
        .send({
          typeEntiteId: referentiel.types.vehicule,
          source: 'Contrôle routier du 09/08',
          fiabilite: 4,
          dateConstatation: '2026-08-09',
          champs: [
            {
              definitionChampId: referentiel.champs['vehicule.plaque'],
              valeur: '4RTQ118',
            },
          ],
        })
        .expect(201);
    });

    it('refuse d’infirmer deux fois', async () => {
      await request(serveur)
        .post(`/faits/${faitInfirme}/infirmer`)
        .set(enTantQue(senior))
        .send({ motif: 'encore' })
        .expect(409);
    });
  });

  // ────────────────────────────── Fusion ──────────────────────────────

  describe('une fusion redirige sans perte', () => {
    let doublon: string;
    let dossierId: string;

    beforeAll(async () => {
      // Un second « Tyron Banks », saisi par un agent qui ne voyait pas le
      // premier — le doublon que l'étude annonce comme inévitable.
      const cree = await request(serveur)
        .post('/entites')
        .set(enTantQue(senior))
        .send({
          typeEntiteId: referentiel.types.personne,
          source: 'Rapport d’intervention n°2402',
          fiabilite: 3,
          dateConstatation: '2026-08-09',
          champs: [
            {
              definitionChampId: referentiel.champs['personne.prenom'],
              valeur: 'Tyron',
            },
            {
              definitionChampId: referentiel.champs['personne.nom'],
              valeur: 'Banks',
            },
          ],
          liens: [
            {
              typeLienId: (
                await prisma.sansFiltre.typeLien.findFirstOrThrow({
                  where: { code: 'present_lors_de' },
                })
              ).id,
              cibleId: entites.braquageBijouterie,
            },
          ],
        })
        .expect(201);

      doublon = (cree.body as FicheEntiteDto).id;

      const dossier = await dossiers.creer(superAdmin.id, {
        nom: 'Doublon Banks',
        entitePivotId: doublon,
      });
      dossierId = dossier.id;

      await dossiers.habiliterSurEntite(superAdmin.id, doublon, junior.id);
    });

    it('refuse de fusionner deux types différents', async () => {
      await request(serveur)
        .post(`/entites/${doublon}/fusion`)
        .set(enTantQue(senior))
        .send({ versId: entites.komoda })
        .expect(409);
    });

    it('refuse la fusion sans la permission', async () => {
      await request(serveur)
        .post(`/entites/${doublon}/fusion`)
        .set(enTantQue(junior))
        .send({ versId: entites.tyron })
        .expect(403);
    });

    it('reporte les faits, les suivis et les habilitations', async () => {
      const avant = await fiche(senior, entites.tyron);

      await request(serveur)
        .post(`/entites/${doublon}/fusion`)
        .set(enTantQue(senior))
        .send({ versId: entites.tyron })
        .expect(200);

      const apres = await fiche(senior, entites.tyron);

      // Le lien du doublon vers le braquage de la bijouterie est passé sur la
      // fiche conservée : rien ne se perd.
      expect(apres.liens.length).toBeGreaterThan(avant.liens.length);

      const [suivi, habilitation, pivot] = await Promise.all([
        prisma.sansFiltre.suivi.count({
          where: { dossierId, entiteId: entites.tyron },
        }),
        prisma.sansFiltre.habilitationEntite.count({
          where: { entiteId: entites.tyron, agentId: junior.id },
        }),
        prisma.sansFiltre.dossier.findUniqueOrThrow({
          where: { id: dossierId },
          select: { entitePivotId: true },
        }),
      ]);

      expect(suivi).toBe(1);
      expect(habilitation).toBe(1);
      expect(pivot.entitePivotId).toBe(entites.tyron);
    });

    it('laisse l’absorbée en base, archivée, et la fait rediriger', async () => {
      const absorbee = await fiche(senior, doublon);

      expect(absorbee.etat).toBe('archive');
      expect(absorbee.fusionneeVersId).toBe(entites.tyron);
    });

    it('sort l’absorbée du graphe sans casser les chemins', async () => {
      const resultat = await chemin(junior, entites.isadora, entites.tyron);

      expect(resultat.plusCourt).not.toBeNull();
      expect(
        resultat.plusCourt!.noeuds.some((noeud) => noeud.id === doublon),
      ).toBe(false);
    });

    it('refuse de fusionner une entité déjà fusionnée', async () => {
      await request(serveur)
        .post(`/entites/${doublon}/fusion`)
        .set(enTantQue(senior))
        .send({ versId: entites.madrina })
        .expect(409);
    });

    it('trace la fusion dans le journal', async () => {
      const traces = await audit(etatMajor, { cible: doublon });
      const fusion = traces.find(
        (trace) => trace.action === 'entite.fusionner',
      );

      expect(fusion).toBeDefined();
      expect(JSON.stringify(fusion!.apres)).toContain(entites.tyron);
    });
  });

  // ──────────────────────────── Consultation ────────────────────────────

  describe('une consultation super-admin apparaît signalée', () => {
    it('journalise toute lecture de fiche', async () => {
      await fiche(junior, entites.madrina);

      const lues = await consultations(etatMajor, { objet: entites.madrina });

      expect(lues.some((entree) => entree.agentId === junior.id)).toBe(true);
      expect(lues[0].objetLibelle).toBe('Madrina');
    });

    it('marque celle du super-admin comme telle', async () => {
      await fiche(superAdmin, entites.madrina);

      const marquees = await consultations(etatMajor, {
        objet: entites.madrina,
        superAdmin: 'true',
      });

      expect(marquees.length).toBeGreaterThan(0);
      expect(marquees.every((entree) => entree.superAdmin)).toBe(true);
      expect(marquees[0].agentId).toBe(superAdmin.id);
    });

    it('distingue la lecture dérogatoire de la lecture ordinaire', async () => {
      await request(serveur)
        .patch(`/entites/${entites.bijouterie}`)
        .set(enTantQue(etatMajor))
        .send({ visibilite: Visibilite.prive })
        .expect(200);

      // L'État-Major n'y est pas habilité nommément : il passe par sa
      // dérogation, et c'est exactement ce que le journal doit rendre visible.
      await fiche(etatMajor, entites.bijouterie);

      const derogatoires = await consultations(etatMajor, {
        objet: entites.bijouterie,
        derogation: 'true',
      });

      expect(
        derogatoires.some((entree) => entree.agentId === etatMajor.id),
      ).toBe(true);
    });

    it('journalise aussi l’ouverture d’un panneau de dossier', async () => {
      const dossier = await dossiers.creer(superAdmin.id, {
        nom: 'Consultation',
        entitePivotId: entites.villa,
      });

      await request(serveur)
        .get(`/dossiers/${dossier.id}`)
        .set(enTantQue(junior))
        .expect(200);

      const lues = await consultations(etatMajor, { objet: dossier.id });

      expect(lues[0].nature).toBe('dossier');
      expect(lues[0].objetLibelle).toBe('Consultation');
    });

    it('réserve les journaux à qui détient la permission', async () => {
      await request(serveur)
        .get('/journal/consultations')
        .set(enTantQue(senior))
        .expect(403);

      await request(serveur)
        .get('/journal/audit')
        .set(enTantQue(junior))
        .expect(403);
    });

    it('ne lie pas la liste de ménage au relevé des consultations', async () => {
      // Le Senior n'a pas `journal.consulter` mais peut archiver : la liste des
      // orphelines lui est ouverte, et le journal reste fermé. Confier l'une ne
      // doit pas obliger à confier l'autre.
      await request(serveur)
        .get('/journal/orphelines')
        .set(enTantQue(senior))
        .expect(200);

      await request(serveur)
        .get('/journal/orphelines')
        .set(enTantQue(junior))
        .expect(403);
    });
  });

  // ────────────────────── Intercepteur et orphelines ──────────────────────

  describe('l’intercepteur', () => {
    it('trace une écriture même quand le service ne trace pas lui-même', async () => {
      const dossier = await dossiers.creer(superAdmin.id, {
        nom: 'Suivi générique',
        entitePivotId: entites.autoroute,
      });

      // `POST /dossiers/:id/suivi` n'écrit aucune trace circonstanciée : c'est
      // l'intercepteur qui doit rattraper, sans que personne y ait pensé.
      await request(serveur)
        .post(`/dossiers/${dossier.id}/suivi`)
        .set(enTantQue(senior))
        .send({ entiteId: entites.bijouterie })
        .expect(204);

      const traces = await audit(etatMajor, { cible: dossier.id });

      expect(
        traces.some((trace) => trace.action === 'post /dossiers/:id/suivi'),
      ).toBe(true);
    });

    it('n’écrit qu’une trace quand le service en a déjà écrit une', async () => {
      const avant = await audit(etatMajor, { action: 'entite.modifier' });

      await request(serveur)
        .patch(`/entites/${entites.autoroute}`)
        .set(enTantQue(senior))
        .send({ note: 'Portion surveillée depuis le 12/08.' })
        .expect(200);

      const apres = await audit(etatMajor, { cible: entites.autoroute });
      const generiques = apres.filter((trace) =>
        trace.action.startsWith('patch '),
      );

      expect(apres.some((trace) => trace.action === 'entite.modifier')).toBe(
        true,
      );
      expect(generiques).toHaveLength(0);
      expect(
        (await audit(etatMajor, { action: 'entite.modifier' })).length,
      ).toBe(avant.length + 1);
    });

    it('ne recopie jamais un mot de passe dans une trace', async () => {
      const traces = await audit(etatMajor, { action: 'auth' });

      expect(JSON.stringify(traces)).not.toContain('mot-de-passe-de-recette');
    });

    it('ne trace rien quand la requête échoue', async () => {
      const avant = await audit(etatMajor, {});

      await request(serveur)
        .patch(`/entites/${entites.autoroute}`)
        .set(enTantQue(junior))
        .send({ visibilite: Visibilite.prive })
        .expect(403);

      const apres = await audit(etatMajor, {});

      // Une requête refusée n'a rien produit : la journaliser laisserait croire
      // à un geste qui n'a pas eu lieu.
      expect(apres.length).toBe(avant.length);
    });
  });

  describe('entités orphelines', () => {
    it('recense ce qu’une saisie interrompue laisse derrière elle', async () => {
      const orpheline = await request(serveur)
        .post('/entites')
        .set(enTantQue(senior))
        .send({
          typeEntiteId: referentiel.types.lieu,
          source: 'Saisie interrompue',
          fiabilite: 2,
          dateConstatation: '2026-08-09',
          champs: [
            {
              definitionChampId: referentiel.champs['lieu.nom'],
              valeur: 'Entrepôt sans suite',
            },
          ],
        })
        .expect(201);

      const id = (orpheline.body as FicheEntiteDto).id;

      const listee = (
        await request(serveur)
          .get('/journal/orphelines')
          .set(enTantQue(senior))
          .expect(200)
      ).body as EntiteOrphelineDto[];

      expect(listee.some((entite) => entite.id === id)).toBe(true);

      // Et surtout : elle ne remonte pas en signal sur l'accueil. Ce n'est pas
      // un rapprochement, c'est du ménage.
      const accueil = (
        await request(serveur)
          .get('/accueil')
          .set(enTantQue(senior))
          .expect(200)
      ).body as { signaux: { entiteId: string }[] };

      expect(accueil.signaux.some((signal) => signal.entiteId === id)).toBe(
        false,
      );
    });

    it('écarte celles qu’un lien rattache', async () => {
      const listee = (
        await request(serveur)
          .get('/journal/orphelines')
          .set(enTantQue(senior))
          .expect(200)
      ).body as EntiteOrphelineDto[];

      expect(listee.some((entite) => entite.id === entites.tyron)).toBe(false);
    });
  });
});
