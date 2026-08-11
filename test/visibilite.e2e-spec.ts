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
  EntiteResumeeDto,
  FicheEntiteDto,
  SuggestionDoublonDto,
} from '../src/entites/entites.dto';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  MadrinaService,
  type ReferentielInstalle,
} from '../src/semences/madrina.service';
import { GardeDeSortie } from '../src/visibilite/garde-de-sortie';
import {
  creerCompteActif,
  reinitialiserLaBase,
  type Compte,
} from './aide-comptes';

describe('Lot 5 — visibilité (e2e)', () => {
  let application: INestApplication;
  let serveur: Server;
  let prisma: PrismaService;
  let dossiers: DossiersService;

  let superAdmin: Compte;
  let etatMajor: Compte;
  let senior: Compte;
  let junior: Compte;
  let referentiel: ReferentielInstalle;

  let idAgentX = '';

  let idIndicateur = '';

  let idVehiculePublic = '';

  let idDossierInterne = '';

  const enTantQue = (compte: Compte) => ({
    Authorization: `Bearer ${compte.jeton}`,
  });

  const PROVENANCE = {
    source: 'Enquête interne',
    fiabilite: 4,
    dateConstatation: '2026-08-06',
  };

  const champ = (cle: string, valeur: unknown) => ({
    definitionChampId: referentiel.champs[cle],
    valeur,
  });

  const fiche = async (compte: Compte, id: string, statut = 200) => {
    const reponse = await request(serveur)
      .get(`/entites/${id}`)
      .set(enTantQue(compte))
      .expect(statut);

    return reponse.body as FicheEntiteDto;
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

    referentiel = await application
      .get(MadrinaService)
      .installerReferentiel(superAdmin.id);

    const agentX = await request(serveur)
      .post('/entites')
      .set(enTantQue(superAdmin))
      .send({
        typeEntiteId: referentiel.types.personne,
        ...PROVENANCE,
        source: 'Annuaire du service',
        champs: [
          champ('personne.prenom', 'Elias'),
          champ('personne.nom', 'Korda'),
        ],
      })
      .expect(201);
    idAgentX = (agentX.body as FicheEntiteDto).id;

    const vehicule = await request(serveur)
      .post('/entites')
      .set(enTantQue(superAdmin))
      .send({
        typeEntiteId: referentiel.types.vehicule,
        ...PROVENANCE,
        source: 'Centrale SAPD',
        champs: [champ('vehicule.plaque', '77KKP410')],
      })
      .expect(201);
    idVehiculePublic = (vehicule.body as FicheEntiteDto).id;

    const indicateur = await request(serveur)
      .post('/entites')
      .set(enTantQue(superAdmin))
      .send({
        typeEntiteId: referentiel.types.personne,
        ...PROVENANCE,
        source: 'Informateur protégé',
        visibilite: Visibilite.prive,
        champs: [
          champ('personne.prenom', 'Nadia'),
          champ('personne.nom', 'Selim'),
        ],
      })
      .expect(201);
    idIndicateur = (indicateur.body as FicheEntiteDto).id;

    const dossier = await dossiers.creer(superAdmin.id, {
      nom: 'Enquête interne — Korda',
      entitePivotId: idAgentX,
      visibilite: Visibilite.prive,
    });
    idDossierInterne = dossier.id;

    await request(serveur)
      .post('/faits')
      .set(enTantQue(superAdmin))
      .send({
        sujetId: idAgentX,
        nature: 'champ',
        definitionChampId: referentiel.champs['personne.date_de_naissance'],
        valeur: '1989-02-14',
        dossierId: idDossierInterne,
        source: 'Dossier interne',
        fiabilite: 4,
        dateConstatation: '2026-08-06',
      })
      .expect(201);

    await request(serveur)
      .post('/faits')
      .set(enTantQue(superAdmin))
      .send({
        sujetId: idAgentX,
        nature: 'lien',
        typeLienId: referentiel.liens.proprietaire_de,
        cibleId: idVehiculePublic,
        dossierId: idDossierInterne,
        source: 'Dossier interne',
        fiabilite: 4,
        dateConstatation: '2026-08-06',
      })
      .expect(201);
  });

  afterAll(async () => {
    await application?.close();
  });

  describe('visibilité effective, calculée en base', () => {
    it('vaut la plus restrictive des quatre gardiens', async () => {
      const faits = await prisma.sansFiltre.fait.findMany({
        where: { sujetId: idAgentX },
        select: {
          dossierId: true,
          visibilite: true,
          visibiliteEffective: true,
        },
      });

      const depuisLeDossier = faits.filter((fait) => fait.dossierId !== null);
      const horsDossier = faits.filter((fait) => fait.dossierId === null);

      expect(depuisLeDossier.length).toBeGreaterThan(0);
      expect(
        depuisLeDossier.every(
          (fait) =>
            fait.visibilite === Visibilite.public &&
            fait.visibiliteEffective === Visibilite.prive,
        ),
      ).toBe(true);

      expect(
        horsDossier.every(
          (fait) => fait.visibiliteEffective === Visibilite.public,
        ),
      ).toBe(true);
    });

    it('est déjà juste dans la réponse de création — trigger BEFORE', async () => {
      const reponse = await request(serveur)
        .post('/faits')
        .set(enTantQue(superAdmin))
        .send({
          sujetId: idAgentX,
          nature: 'champ',
          definitionChampId: referentiel.champs['personne.prenom'],
          valeur: 'Élias',
          dossierId: idDossierInterne,
          source: 'Dossier interne',
          fiabilite: 3,
          dateConstatation: '2026-08-06',
        })
        .expect(201);

      expect(
        (reponse.body as { visibiliteEffective: string }).visibiliteEffective,
      ).toBe('prive');
    });
  });

  describe('cas de référence — entité publique, dossier privé', () => {
    it('l’entité reste consultable par un agent non habilité', async () => {
      const vue = await fiche(junior, idAgentX);

      expect(vue.libelle).toBe('Elias Korda');
      expect(vue.visibilite).toBe(Visibilite.public);
      expect(vue.contenuLisible).toBe(true);
    });

    it('mais rien de ce qui vient du dossier privé n’y figure', async () => {
      const vue = await fiche(junior, idAgentX);

      const naissance = vue.champs.find(
        (element) => element.cle === 'date_de_naissance',
      )!;

      expect(naissance.valeur).toBeNull();
      expect(naissance.faits).toHaveLength(0);
      expect(vue.valeurs.date_de_naissance).toBeUndefined();
      expect(vue.liens).toHaveLength(0);
    });

    it('la projection stockée, elle, contient tout — d’où la recomposition à la lecture', async () => {
      const brut = await prisma.sansFiltre.entite.findUniqueOrThrow({
        where: { id: idAgentX },
        select: { valeurs: true },
      });

      expect((brut.valeurs as Record<string, unknown>).date_de_naissance).toBe(
        '1989-02-14',
      );
    });

    it('un agent habilité sur le dossier retrouve ce qui en vient', async () => {
      await dossiers.habiliter(superAdmin.id, idDossierInterne, senior.id);

      const vue = await fiche(senior, idAgentX);
      const naissance = vue.champs.find(
        (element) => element.cle === 'date_de_naissance',
      )!;

      expect(naissance.valeur).toBe('1989-02-14');
      expect(vue.valeurs.date_de_naissance).toBe('1989-02-14');
    });

    it('l’État-Major y accède par dérogation, sans habilitation nominative', async () => {
      const vue = await fiche(etatMajor, idAgentX);

      expect(vue.valeurs.date_de_naissance).toBe('1989-02-14');
    });
  });

  describe('règle des gardiens — deux gardiens, deux habilitations', () => {
    let idLienDeuxGardiens = '';

    beforeAll(async () => {
      await request(serveur)
        .patch(`/entites/${idVehiculePublic}`)
        .set(enTantQue(superAdmin))
        .send({ visibilite: Visibilite.prive })
        .expect(200);

      const lien = await prisma.sansFiltre.fait.findFirstOrThrow({
        where: { sujetId: idAgentX, nature: 'lien' },
        select: { id: true },
      });
      idLienDeuxGardiens = lien.id;
    });

    it('reste fermé à qui n’est habilité que sur le dossier', async () => {
      const vue = await fiche(senior, idAgentX);

      expect(vue.liens).toHaveLength(0);
    });

    it('reste fermé à qui n’est habilité que sur la cible', async () => {
      const cible = await creerCompteActif(application, {
        matricule: 'ji-005',
        prenom: 'Remy',
        nom: 'Sauze',
        roleCode: CODE_JUNIOR,
      });

      await dossiers.habiliterSurEntite(
        superAdmin.id,
        idVehiculePublic,
        cible.id,
      );

      const vue = await fiche(cible, idAgentX);
      expect(vue.liens).toHaveLength(0);
    });

    it('s’ouvre à qui est habilité auprès des deux', async () => {
      await dossiers.habiliterSurEntite(
        superAdmin.id,
        idVehiculePublic,
        senior.id,
      );

      const vue = await fiche(senior, idAgentX);

      expect(vue.liens).toHaveLength(1);
      expect(vue.liens[0].faitId).toBe(idLienDeuxGardiens);
      expect(vue.liens[0].autreEntite.libelle).toBe('77KKP410');
    });

    it('retirer l’une des deux habilitations le referme', async () => {
      await prisma.habilitationDossier.deleteMany({
        where: { dossierId: idDossierInterne, agentId: senior.id },
      });

      const vue = await fiche(senior, idAgentX);
      expect(vue.liens).toHaveLength(0);

      await dossiers.habiliter(superAdmin.id, idDossierInterne, senior.id);
    });
  });

  describe('vecteurs de fuite par déduction', () => {
    it('404 et jamais 403 sur une entité privée', async () => {
      const reponse = await request(serveur)
        .get(`/entites/${idIndicateur}`)
        .set(enTantQue(junior))
        .expect(404);

      expect((reponse.body as { statusCode: number }).statusCode).toBe(404);
    });

    it('la même route répond 200 à qui y a droit', async () => {
      await fiche(etatMajor, idIndicateur);
    });

    it('l’annuaire ignore les entités privées, sans mention', async () => {
      const [vuJunior, vuEtatMajor] = await Promise.all([
        request(serveur)
          .get('/entites')
          .query({ type: referentiel.types.personne })
          .set(enTantQue(junior))
          .expect(200),
        request(serveur)
          .get('/entites')
          .query({ type: referentiel.types.personne })
          .set(enTantQue(etatMajor))
          .expect(200),
      ]);

      const libellesJunior = (vuJunior.body as EntiteResumeeDto[]).map(
        (entite) => entite.libelle,
      );
      const libellesEtatMajor = (vuEtatMajor.body as EntiteResumeeDto[]).map(
        (entite) => entite.libelle,
      );

      expect(libellesJunior).not.toContain('Nadia Selim');
      expect(libellesEtatMajor).toContain('Nadia Selim');
      expect(libellesJunior.length).toBe(libellesEtatMajor.length - 1);
    });

    it('la détection de doublons ne propose jamais une entité privée', async () => {
      const [vuJunior, vuEtatMajor] = await Promise.all([
        request(serveur)
          .get('/entites/similaires')
          .query({ q: 'Nadia Selim' })
          .set(enTantQue(junior))
          .expect(200),
        request(serveur)
          .get('/entites/similaires')
          .query({ q: 'Nadia Selim' })
          .set(enTantQue(etatMajor))
          .expect(200),
      ]);

      expect(vuJunior.body).toEqual([]);
      expect(
        (vuEtatMajor.body as SuggestionDoublonDto[]).map(
          (suggestion) => suggestion.libelle,
        ),
      ).toContain('Nadia Selim');
    });

    it('la plaque d’un véhicule privé reste refusée en double, sans le nommer', async () => {
      const reponse = await request(serveur)
        .post('/entites')
        .set(enTantQue(junior))
        .send({
          typeEntiteId: referentiel.types.vehicule,
          ...PROVENANCE,
          champs: [champ('vehicule.plaque', '77KKP410')],
        })
        .expect(409);

      expect((reponse.body as { message: string }).message).toMatch(/Plaque/);
    });

    it('les décomptes de la fiche ne comptent que le visible', async () => {
      const [vuJunior, vuEtatMajor] = await Promise.all([
        fiche(junior, idAgentX),
        fiche(etatMajor, idAgentX),
      ]);

      const faitsDe = (vue: FicheEntiteDto) =>
        vue.champs.reduce((total, element) => total + element.faits.length, 0);

      expect(faitsDe(vuJunior)).toBeLessThan(faitsDe(vuEtatMajor));
      expect(vuJunior.liens.length).toBeLessThan(vuEtatMajor.liens.length);
    });
  });

  describe('fiche assemblée — onglets et compteurs', () => {
    it('livre les onglets du type, déjà peuplés', async () => {
      const vue = await fiche(etatMajor, idAgentX);

      expect(vue.onglets.map((onglet) => onglet.libelle)).toEqual([
        'Appartenance',
        'Véhicules',
        'Événements',
      ]);
    });

    it('ne place aucun lien hors onglet quand la mise en page est complète', async () => {
      const vue = await fiche(etatMajor, idAgentX);

      expect(vue.liensHorsOnglet).toEqual([]);
    });

    it('compte, dans chaque onglet, ce que l’agent voit et rien de plus', async () => {
      const [vuJunior, vuEtatMajor] = await Promise.all([
        fiche(junior, idAgentX),
        fiche(etatMajor, idAgentX),
      ]);

      const compteur = (vue: FicheEntiteDto, libelle: string) =>
        vue.onglets.find((onglet) => onglet.libelle === libelle)?.compteur ??
        -1;

      expect(compteur(vuJunior, 'Véhicules')).toBe(0);
      expect(compteur(vuEtatMajor, 'Véhicules')).toBe(1);
    });

    it('un onglet ne contient que les liens qu’il regroupe', async () => {
      const vue = await fiche(etatMajor, idAgentX);
      const vehicules = vue.onglets.find(
        (onglet) => onglet.libelle === 'Véhicules',
      )!;

      expect(vehicules.liens).toHaveLength(vehicules.compteur);
      expect(vehicules.liens[0].autreEntite.typeCode).toBe('vehicule');
    });
  });

  describe('historique', () => {
    it('est refusé sans la permission', async () => {
      await request(serveur)
        .get(`/entites/${idAgentX}/historique`)
        .set(enTantQue(junior))
        .expect(403);
    });

    it('rend les traces d’écriture à qui détient la permission', async () => {
      const reponse = await request(serveur)
        .get(`/entites/${idAgentX}/historique`)
        .set(enTantQue(etatMajor))
        .expect(200);

      const evenements = reponse.body as {
        nature: string;
        libelle: string;
        auteur: string | null;
      }[];

      expect(evenements.length).toBeGreaterThan(0);
      expect(
        evenements.some((element) => element.libelle === 'entite.creer'),
      ).toBe(true);
      expect(evenements[0].auteur).toEqual(expect.any(String));
    });
  });

  describe('cascades', () => {
    it('rendre un dossier public rouvre aussitôt ce qui en vient', async () => {
      await dossiers.definirVisibilite(
        superAdmin.id,
        idDossierInterne,
        Visibilite.public,
      );

      const vue = await fiche(junior, idAgentX);
      expect(vue.valeurs.date_de_naissance).toBe('1989-02-14');

      await dossiers.definirVisibilite(
        superAdmin.id,
        idDossierInterne,
        Visibilite.prive,
      );

      const apres = await fiche(junior, idAgentX);
      expect(apres.valeurs.date_de_naissance).toBeUndefined();
    });

    it('reclasser une entité masque les faits dont elle est la cible', async () => {
      const groupe = await request(serveur)
        .post('/entites')
        .set(enTantQue(superAdmin))
        .send({
          typeEntiteId: referentiel.types.groupe,
          ...PROVENANCE,
          champs: [champ('groupe.nom', 'Cellule Aurore')],
        })
        .expect(201);
      const idGroupe = (groupe.body as FicheEntiteDto).id;

      const membre = await request(serveur)
        .post('/entites')
        .set(enTantQue(superAdmin))
        .send({
          typeEntiteId: referentiel.types.personne,
          ...PROVENANCE,
          champs: [
            champ('personne.prenom', 'Milo'),
            champ('personne.nom', 'Renard'),
          ],
          liens: [
            { typeLienId: referentiel.liens.membre_de, cibleId: idGroupe },
          ],
        })
        .expect(201);
      const idMembre = (membre.body as FicheEntiteDto).id;

      expect((await fiche(junior, idMembre)).liens).toHaveLength(1);

      await request(serveur)
        .patch(`/entites/${idGroupe}`)
        .set(enTantQue(superAdmin))
        .send({ visibilite: Visibilite.prive })
        .expect(200);

      expect((await fiche(junior, idMembre)).liens).toHaveLength(0);
      expect((await fiche(etatMajor, idMembre)).liens).toHaveLength(1);
    });
  });

  describe('garde de sortie', () => {
    it('laisse passer une réponse légitime', async () => {
      await fiche(senior, idAgentX);
    });

    it('refuse une charge qui contiendrait un fait interdit', async () => {
      const garde = application.get(GardeDeSortie);

      const faitInterdit = await prisma.sansFiltre.fait.findFirstOrThrow({
        where: { visibiliteEffective: Visibilite.prive },
        select: { id: true },
      });

      const charge = {
        liens: [
          { faitId: faitInterdit.id, visibiliteEffective: Visibilite.prive },
        ],
      };

      await expect(
        garde.verifierCharge(agentSansDroit(), charge, '/essai'),
      ).rejects.toThrow(/incohérence de visibilité/);
    });

    it('ne bronche pas sur une charge entièrement publique', async () => {
      const garde = application.get(GardeDeSortie);

      await expect(
        garde.verifierCharge(
          agentSansDroit(),
          { liens: [{ faitId: 'peu-importe', visibiliteEffective: 'public' }] },
          '/essai',
        ),
      ).resolves.toBeUndefined();
    });
  });

  function agentSansDroit() {
    return {
      id: junior.id,
      matricule: junior.matricule,
      prenom: 'Sasha',
      nom: 'Vane',
      roleId: '',
      roleCode: CODE_JUNIOR,
      superAdmin: false,
      doitChangerMdp: false,
      permissions: [],
      dossiersHabilites: [],
      entitesHabilitees: [],
    };
  }
});
