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
import type {
  CarteEnqueteDto,
  ColonneKanbanDto,
} from '../src/enquetes/enquetes.dto';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  creerCompteActif,
  reinitialiserLaBase,
  type Compte,
} from './aide-comptes';

/**
 * Le tableau des enquêtes.
 *
 * Deux propriétés à figer avant tout : une carte s'assigne à **plusieurs**
 * comptes, et **assigner n'ouvre aucun accès**. La seconde est celle qu'un
 * raccourci futur casserait en silence.
 */
describe('Enquêtes — kanban (e2e)', () => {
  let application: INestApplication;
  let serveur: Server;
  let prisma: PrismaService;

  let superAdmin: Compte;
  let senior: Compte;
  let junior: Compte;

  let idAFaire = '';
  let idEnCours = '';

  const enTantQue = (compte: Compte) => ({
    Authorization: `Bearer ${compte.jeton}`,
  });

  const cartes = async (compte: Compte): Promise<CarteEnqueteDto[]> =>
    (
      await request(serveur)
        .get('/enquetes/cartes')
        .set(enTantQue(compte))
        .expect(200)
    ).body as CarteEnqueteDto[];

  const creer = async (
    compte: Compte,
    corps: Record<string, unknown>,
    statut = 201,
  ) =>
    (
      await request(serveur)
        .post('/enquetes/cartes')
        .set(enTantQue(compte))
        .send(corps)
        .expect(statut)
    ).body as CarteEnqueteDto;

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

    for (const [code, libelle] of [
      ['a_faire', 'À faire'],
      ['en_cours', 'En cours'],
    ]) {
      const colonne = await request(serveur)
        .post('/enquetes/colonnes')
        .set(enTantQue(superAdmin))
        .send({ code, libelle })
        .expect(201);

      const id = (colonne.body as ColonneKanbanDto).id;

      if (code === 'a_faire') {
        idAFaire = id;
      } else {
        idEnCours = id;
      }
    }
  });

  afterAll(async () => {
    await application.close();
  });

  describe('colonnes', () => {
    it('sont réservées au super-admin', async () => {
      await request(serveur)
        .post('/enquetes/colonnes')
        .set(enTantQue(senior))
        .send({ code: 'interdit', libelle: 'Interdit' })
        .expect(403);
    });

    it('se lisent par qui consulte le tableau', async () => {
      const vue = await request(serveur)
        .get('/enquetes/colonnes')
        .set(enTantQue(junior))
        .expect(200);

      expect(
        (vue.body as ColonneKanbanDto[]).map((colonne) => colonne.code),
      ).toEqual(['a_faire', 'en_cours']);
    });

    it('refusent de partir tant qu’une carte s’y trouve', async () => {
      await creer(senior, { colonneId: idAFaire, titre: 'Carte témoin' });

      const refus = await request(serveur)
        .delete(`/enquetes/colonnes/${idAFaire}`)
        .set(enTantQue(superAdmin))
        .expect(409);

      expect((refus.body as { message: string }).message).toMatch(
        /encore utilisée/,
      );
    });
  });

  describe('assignation — à un ou plusieurs comptes', () => {
    let idCarte = '';

    it('assigne plusieurs agents d’un coup', async () => {
      const carte = await creer(senior, {
        colonneId: idAFaire,
        titre: 'Identifier le fournisseur',
        assignes: [senior.id, junior.id],
      });

      idCarte = carte.id;

      expect(carte.assignes.map((agent) => agent.matricule).sort()).toEqual([
        'ji-003',
        'si-002',
      ]);
      expect(carte.assignes.map((agent) => agent.initiales).sort()).toEqual([
        'ND',
        'SV',
      ]);
    });

    it('remplace le jeu complet à la modification', async () => {
      const apres = await request(serveur)
        .patch(`/enquetes/cartes/${idCarte}`)
        .set(enTantQue(senior))
        .send({ assignes: [junior.id] })
        .expect(200);

      expect(
        (apres.body as CarteEnqueteDto).assignes.map((a) => a.matricule),
      ).toEqual(['ji-003']);
    });

    it('se vide sans se supprimer', async () => {
      const apres = await request(serveur)
        .patch(`/enquetes/cartes/${idCarte}`)
        .set(enTantQue(senior))
        .send({ assignes: [] })
        .expect(200);

      expect((apres.body as CarteEnqueteDto).assignes).toEqual([]);
    });

    it('relève un compte anonymisé sans perdre l’assignation', async () => {
      const jetable = await creerCompteActif(application, {
        matricule: 'tmp-009',
        prenom: 'Lena',
        nom: 'Ferrand',
        roleCode: CODE_JUNIOR,
      });

      await request(serveur)
        .patch(`/enquetes/cartes/${idCarte}`)
        .set(enTantQue(senior))
        .send({ assignes: [jetable.id] })
        .expect(200);

      await request(serveur)
        .post(`/agents/${jetable.id}/anonymiser`)
        .set(enTantQue(superAdmin))
        .expect(200);

      const vue = await cartes(senior);
      const carte = vue.find((candidate) => candidate.id === idCarte);

      expect(carte?.assignes).toHaveLength(1);
      expect(carte?.assignes[0].libelle).toBe('agent supprimé');
      expect(carte?.assignes[0].initiales).toBe('?');
    });
  });

  describe('assigner n’est pas habiliter', () => {
    let idClassee = '';

    beforeAll(async () => {
      const carte = await creer(superAdmin, {
        colonneId: idEnCours,
        titre: 'Filature Los Vagos',
        visibilite: 'restreint',
        assignes: [junior.id],
      });

      idClassee = carte.id;
    });

    it('l’agent assigné à une carte classée ne la voit pas', async () => {
      const vue = await cartes(junior);

      expect(vue.map((carte) => carte.id)).not.toContain(idClassee);
      expect(vue.some((carte) => carte.titre.includes('Los Vagos'))).toBe(
        false,
      );
    });

    it('la fiche le dit à qui la voit : assigné, mais pas lecteur', async () => {
      const vue = await cartes(superAdmin);
      const carte = vue.find((candidate) => candidate.id === idClassee);
      const assigne = carte?.assignes[0];

      expect(assigne?.matricule).toBe('ji-003');
      expect(assigne?.peutLire).toBe(false);
    });

    it('seule l’habilitation ouvre', async () => {
      await request(serveur)
        .post(`/enquetes/cartes/${idClassee}/habilitations`)
        .set(enTantQue(superAdmin))
        .send({ agentId: junior.id })
        .expect(204);

      const vue = await cartes(junior);
      const carte = vue.find((candidate) => candidate.id === idClassee);

      expect(carte?.titre).toBe('Filature Los Vagos');
      expect(carte?.assignes[0].peutLire).toBe(true);
    });

    it('et son retrait referme, l’assignation restant intacte', async () => {
      await request(serveur)
        .delete(`/enquetes/cartes/${idClassee}/habilitations/${junior.id}`)
        .set(enTantQue(superAdmin))
        .expect(204);

      expect((await cartes(junior)).map((carte) => carte.id)).not.toContain(
        idClassee,
      );

      const assignations = await prisma.assignationCarte.findMany({
        where: { carteId: idClassee },
      });

      expect(assignations.map((a) => a.agentId)).toContain(junior.id);
    });
  });

  describe('déplacement entre colonnes', () => {
    it('resserre les rangs des deux colonnes', async () => {
      const depart = await creer(senior, {
        colonneId: idAFaire,
        titre: 'Première',
      });
      await creer(senior, { colonneId: idAFaire, titre: 'Deuxième' });

      const apres = await request(serveur)
        .post(`/enquetes/cartes/${depart.id}/deplacer`)
        .set(enTantQue(senior))
        .send({ colonneId: idEnCours, rang: 0 })
        .expect(200);

      expect((apres.body as CarteEnqueteDto).colonneId).toBe(idEnCours);
      expect((apres.body as CarteEnqueteDto).rang).toBe(0);

      const vue = await cartes(superAdmin);
      const restantes = vue
        .filter((carte) => carte.colonneId === idAFaire)
        .map((carte) => carte.rang)
        .sort((a, b) => a - b);

      // Aucun trou, aucun doublon.
      expect(restantes).toEqual(restantes.map((_valeur, rang) => rang));
    });
  });

  describe('permissions et cycle de vie', () => {
    it('un junior consulte mais n’écrit pas', async () => {
      await cartes(junior);
      await creer(junior, { colonneId: idAFaire, titre: 'Interdit' }, 403);
    });

    it('une carte s’archive et reste en base', async () => {
      const carte = await creer(senior, {
        colonneId: idAFaire,
        titre: 'Abandonnée',
      });

      await request(serveur)
        .post(`/enquetes/cartes/${carte.id}/archiver`)
        .set(enTantQue(superAdmin))
        .expect(200);

      expect((await cartes(superAdmin)).map((c) => c.id)).not.toContain(
        carte.id,
      );

      const avecArchives = await request(serveur)
        .get('/enquetes/cartes?archives=true')
        .set(enTantQue(superAdmin))
        .expect(200);

      expect(
        (avecArchives.body as CarteEnqueteDto[]).map((c) => c.id),
      ).toContain(carte.id);
    });

    it('n’offre aucune route de suppression', async () => {
      const vue = await cartes(senior);

      await request(serveur)
        .delete(`/enquetes/cartes/${vue[0].id}`)
        .set(enTantQue(superAdmin))
        .expect(404);
    });
  });
});
