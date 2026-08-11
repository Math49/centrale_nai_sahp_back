import {
  Controller,
  Get,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';

import { AgentsService } from '../src/agents/agents.service';
import { CODE_ETAT_MAJOR, CODE_JUNIOR } from '../src/agents/grades';
import { RolesService } from '../src/agents/roles.service';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

@Controller('essai-sans-decorateur')
class ControleurNonDecore {
  @Get()
  repondre() {
    return { atteint: true };
  }
}

const MOT_DE_PASSE_CHOISI = 'mot-de-passe-de-recette-2291';

interface CorpsJeton {
  jeton: string;
  agent: { id: string; doitChangerMdp: boolean; permissions: string[] };
}

describe('Lot 1 — authentification, comptes et refus par défaut (e2e)', () => {
  let application: INestApplication;
  let serveur: Server;
  let prisma: PrismaService;
  let agents: AgentsService;

  let idEtatMajor: string;
  let idJunior: string;

  const superAdmin = { id: '', matricule: 'sa-001', motDePasse: '', jeton: '' };
  const adjoint = { id: '', matricule: 'em-002', motDePasse: '', jeton: '' };
  const junior = { id: '', matricule: 'ji-003', motDePasse: '', jeton: '' };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ControleurNonDecore],
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
    agents = application.get(AgentsService);

    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE journal_audit, agent, role RESTART IDENTITY CASCADE',
    );

    const roles = application.get(RolesService);
    await roles.initialiserLesGradesManquants();

    const grades = await roles.lister();
    idEtatMajor = grades.find((role) => role.code === CODE_ETAT_MAJOR)!.id;
    idJunior = grades.find((role) => role.code === CODE_JUNIOR)!.id;

    const amorce = await agents.creer(null, {
      matricule: superAdmin.matricule,
      prenom: 'Mathis',
      nom: 'Mercier',
      roleId: idEtatMajor,
      superAdmin: true,
    });

    superAdmin.id = amorce.agent.id;
    superAdmin.motDePasse = amorce.motDePasseProvisoire!;
  });

  afterAll(async () => {
    await application?.close();
  });

  async function activer(compte: {
    matricule: string;
    motDePasse: string;
    jeton: string;
    id: string;
  }): Promise<void> {
    const connexion = await request(serveur)
      .post('/auth/login')
      .send({ matricule: compte.matricule, motDePasse: compte.motDePasse })
      .expect(200);

    const change = await request(serveur)
      .post('/auth/mot-de-passe')
      .set('Authorization', `Bearer ${(connexion.body as CorpsJeton).jeton}`)
      .send({ ancien: compte.motDePasse, nouveau: MOT_DE_PASSE_CHOISI })
      .expect(200);

    compte.motDePasse = MOT_DE_PASSE_CHOISI;
    compte.jeton = (change.body as CorpsJeton).jeton;
  }

  describe('routes publiques et jeton', () => {
    it('la santé répond sans jeton', async () => {
      await request(serveur).get('/sante').expect(200);
    });

    it('une route protégée refuse un appel sans jeton', async () => {
      await request(serveur).get('/agents').expect(401);
    });

    it('un jeton forgé est rejeté', async () => {
      await request(serveur)
        .get('/agents')
        .set('Authorization', 'Bearer pas-un-jeton')
        .expect(401);
    });

    it('un mot de passe faux est refusé', async () => {
      await request(serveur)
        .post('/auth/login')
        .send({ matricule: superAdmin.matricule, motDePasse: 'faux' })
        .expect(401);
    });

    it("un matricule inconnu renvoie le même message qu'un mot de passe faux", async () => {
      const inconnu = await request(serveur)
        .post('/auth/login')
        .send({ matricule: 'jamais-attribue', motDePasse: 'faux' })
        .expect(401);

      expect((inconnu.body as { message: string }).message).toBe(
        'identifiants invalides',
      );
    });
  });

  describe('changement de mot de passe imposé', () => {
    let jetonInitial: string;

    it('la première connexion signale le changement imposé', async () => {
      const reponse = await request(serveur)
        .post('/auth/login')
        .send({
          matricule: superAdmin.matricule,
          motDePasse: superAdmin.motDePasse,
        })
        .expect(200);

      const corps = reponse.body as CorpsJeton;
      expect(corps.agent.doitChangerMdp).toBe(true);
      jetonInitial = corps.jeton;
    });

    it("un compte en changement imposé ne peut rien appeler d'autre", async () => {
      await request(serveur)
        .get('/agents')
        .set('Authorization', `Bearer ${jetonInitial}`)
        .expect(403);
    });

    it('il peut lire sa propre identité', async () => {
      await request(serveur)
        .get('/auth/moi')
        .set('Authorization', `Bearer ${jetonInitial}`)
        .expect(200);
    });

    it("le nouveau mot de passe doit différer de l'ancien", async () => {
      await request(serveur)
        .post('/auth/mot-de-passe')
        .set('Authorization', `Bearer ${jetonInitial}`)
        .send({
          ancien: superAdmin.motDePasse,
          nouveau: superAdmin.motDePasse,
        })
        .expect(400);
    });

    it('le changement libère le compte et renvoie un jeton neuf', async () => {
      const reponse = await request(serveur)
        .post('/auth/mot-de-passe')
        .set('Authorization', `Bearer ${jetonInitial}`)
        .send({
          ancien: superAdmin.motDePasse,
          nouveau: MOT_DE_PASSE_CHOISI,
        })
        .expect(200);

      const corps = reponse.body as CorpsJeton;
      expect(corps.agent.doitChangerMdp).toBe(false);

      superAdmin.motDePasse = MOT_DE_PASSE_CHOISI;
      superAdmin.jeton = corps.jeton;
    });

    it("l'ancien jeton est immédiatement invalide", async () => {
      await request(serveur)
        .get('/auth/moi')
        .set('Authorization', `Bearer ${jetonInitial}`)
        .expect(401);
    });

    it('le jeton neuf ouvre les routes protégées', async () => {
      await request(serveur)
        .get('/agents')
        .set('Authorization', `Bearer ${superAdmin.jeton}`)
        .expect(200);
    });
  });

  describe('refus par défaut', () => {
    it('une route sans décorateur est refusée, même à un super-admin', async () => {
      const reponse = await request(serveur)
        .get('/essai-sans-decorateur')
        .set('Authorization', `Bearer ${superAdmin.jeton}`)
        .expect(403);

      expect((reponse.body as { message: string }).message).toMatch(
        /refusée par défaut/,
      );
    });

    it('elle est refusée avant même de regarder le jeton', async () => {
      await request(serveur).get('/essai-sans-decorateur').expect(401);
    });
  });

  describe('administration des comptes', () => {
    it('crée un adjoint État-Major avec un mot de passe provisoire', async () => {
      const reponse = await request(serveur)
        .post('/agents')
        .set('Authorization', `Bearer ${superAdmin.jeton}`)
        .send({
          matricule: adjoint.matricule,
          prenom: 'Alix',
          nom: 'Reyes',
          roleId: idEtatMajor,
        })
        .expect(201);

      const corps = reponse.body as {
        agent: { id: string; doitChangerMdp: boolean };
        motDePasseProvisoire: string;
      };

      expect(corps.motDePasseProvisoire).toEqual(expect.any(String));
      expect(corps.agent.doitChangerMdp).toBe(true);

      adjoint.id = corps.agent.id;
      adjoint.motDePasse = corps.motDePasseProvisoire;
    });

    it('refuse un matricule déjà attribué', async () => {
      await request(serveur)
        .post('/agents')
        .set('Authorization', `Bearer ${superAdmin.jeton}`)
        .send({
          matricule: adjoint.matricule,
          prenom: 'Doublon',
          nom: 'Doublon',
          roleId: idEtatMajor,
        })
        .expect(409);
    });

    it('refuse un champ inconnu dans le corps', async () => {
      await request(serveur)
        .post('/agents')
        .set('Authorization', `Bearer ${superAdmin.jeton}`)
        .send({
          matricule: 'xx-999',
          prenom: 'Test',
          nom: 'Test',
          roleId: idEtatMajor,
          motDePasseHash: 'tentative',
        })
        .expect(400);
    });

    it('crée un junior', async () => {
      const reponse = await request(serveur)
        .post('/agents')
        .set('Authorization', `Bearer ${superAdmin.jeton}`)
        .send({
          matricule: junior.matricule,
          prenom: 'Tyron',
          nom: 'Banks',
          roleId: idJunior,
        })
        .expect(201);

      const corps = reponse.body as {
        agent: { id: string };
        motDePasseProvisoire: string;
      };

      junior.id = corps.agent.id;
      junior.motDePasse = corps.motDePasseProvisoire;

      await activer(junior);
    });

    it("un junior n'accède pas à l'administration des comptes", async () => {
      const reponse = await request(serveur)
        .get('/agents')
        .set('Authorization', `Bearer ${junior.jeton}`)
        .expect(403);

      expect((reponse.body as { message: string }).message).toMatch(
        /agent\.gerer/,
      );
    });

    it('un junior peut lire les grades', async () => {
      const reponse = await request(serveur)
        .get('/roles')
        .set('Authorization', `Bearer ${junior.jeton}`)
        .expect(200);

      expect((reponse.body as unknown[]).length).toBe(3);
    });

    it("un junior n'accède pas au catalogue des permissions", async () => {
      await request(serveur)
        .get('/roles/catalogue-permissions')
        .set('Authorization', `Bearer ${junior.jeton}`)
        .expect(403);
    });
  });

  describe('anonymisation', () => {
    it("l'adjoint crée un compte, ce qui laisse sa trace au journal d'audit", async () => {
      await activer(adjoint);

      await request(serveur)
        .post('/agents')
        .set('Authorization', `Bearer ${adjoint.jeton}`)
        .send({
          matricule: 'tm-004',
          prenom: 'Isadora',
          nom: 'Morales',
          roleId: idJunior,
        })
        .expect(201);

      const traces = await prisma.journalAudit.count({
        where: { agentId: adjoint.id, action: 'agent.creer' },
      });

      expect(traces).toBe(1);
    });

    it('le dernier super-admin actif ne peut pas être retiré', async () => {
      const reponse = await request(serveur)
        .post(`/agents/${superAdmin.id}/anonymiser`)
        .set('Authorization', `Bearer ${adjoint.jeton}`)
        .expect(409);

      expect((reponse.body as { message: string }).message).toMatch(
        /dernier super-admin/,
      );
    });

    it('un agent ne peut pas anonymiser son propre compte', async () => {
      await request(serveur)
        .post(`/agents/${adjoint.id}/anonymiser`)
        .set('Authorization', `Bearer ${adjoint.jeton}`)
        .expect(400);
    });

    it("anonymise l'adjoint", async () => {
      const reponse = await request(serveur)
        .post(`/agents/${adjoint.id}/anonymiser`)
        .set('Authorization', `Bearer ${superAdmin.jeton}`)
        .expect(200);

      const corps = reponse.body as {
        libelle: string;
        prenom: string;
        nom: string;
        matricule: string;
        actif: boolean;
        anonymise: boolean;
        anonymiseLe: string | null;
      };

      expect(corps.anonymise).toBe(true);
      expect(corps.actif).toBe(false);
      expect(corps.libelle).toBe('agent supprimé');
      expect(corps.prenom).toBe('');
      expect(corps.nom).toBe('');
      expect(corps.matricule).toBe(`anonyme-${adjoint.id}`);
      expect(corps.anonymiseLe).toEqual(expect.any(String));
    });

    it('ses jetons sont immédiatement invalides', async () => {
      await request(serveur)
        .get('/auth/moi')
        .set('Authorization', `Bearer ${adjoint.jeton}`)
        .expect(401);
    });

    it('il ne peut plus se connecter', async () => {
      await request(serveur)
        .post('/auth/login')
        .send({ matricule: adjoint.matricule, motDePasse: MOT_DE_PASSE_CHOISI })
        .expect(401);
    });

    it('son empreinte de mot de passe est effacée', async () => {
      const enregistrement = await prisma.agent.findUniqueOrThrow({
        where: { id: adjoint.id },
      });

      expect(enregistrement.motDePasseHash).toBeNull();
    });

    it("ses références au journal d'audit restent intactes", async () => {
      const traces = await prisma.journalAudit.findMany({
        where: { agentId: adjoint.id },
        include: { agent: true },
      });

      expect(traces.length).toBeGreaterThan(0);
      expect(traces[0].agent).not.toBeNull();
      expect(traces[0].agent!.anonymise).toBe(true);
    });

    it("le journal d'audit ne conserve pas les données effacées", async () => {
      const traces = await prisma.journalAudit.findMany({
        where: { cibleId: adjoint.id },
      });

      const serialise = JSON.stringify(traces, (_cle, valeur: unknown) =>
        typeof valeur === 'bigint' ? valeur.toString() : valeur,
      );
      expect(serialise).not.toContain('Alix');
      expect(serialise).not.toContain('Reyes');
      expect(serialise).not.toContain(adjoint.matricule);
    });

    it("le matricule d'origine est de nouveau attribuable", async () => {
      await request(serveur)
        .post('/agents')
        .set('Authorization', `Bearer ${superAdmin.jeton}`)
        .send({
          matricule: adjoint.matricule,
          prenom: 'Nouvelle',
          nom: 'Recrue',
          roleId: idJunior,
        })
        .expect(201);
    });

    it("un compte déjà anonymisé ne peut pas l'être deux fois", async () => {
      await request(serveur)
        .post(`/agents/${adjoint.id}/anonymiser`)
        .set('Authorization', `Bearer ${superAdmin.jeton}`)
        .expect(409);
    });

    it('les comptes anonymisés sont hors liste par défaut', async () => {
      const parDefaut = await request(serveur)
        .get('/agents')
        .set('Authorization', `Bearer ${superAdmin.jeton}`)
        .expect(200);

      const avec = await request(serveur)
        .get('/agents?anonymises=true')
        .set('Authorization', `Bearer ${superAdmin.jeton}`)
        .expect(200);

      expect((parDefaut.body as unknown[]).length).toBe(
        (avec.body as unknown[]).length - 1,
      );
    });
  });

  describe('configuration des grades', () => {
    it('refuse une permission hors catalogue', async () => {
      await request(serveur)
        .patch(`/roles/${idJunior}`)
        .set('Authorization', `Bearer ${superAdmin.jeton}`)
        .send({ permissions: ['entite.creer', 'entite.detruire'] })
        .expect(400);
    });

    it('accepte une reconfiguration et la trace', async () => {
      await request(serveur)
        .patch(`/roles/${idJunior}`)
        .set('Authorization', `Bearer ${superAdmin.jeton}`)
        .send({ permissions: ['entite.creer'] })
        .expect(200);

      const traces = await prisma.journalAudit.count({
        where: { action: 'role.modifier', cibleId: idJunior },
      });

      expect(traces).toBe(1);
    });

    it('la reconfiguration est immédiatement opposable', async () => {
      const moi = await request(serveur)
        .get('/auth/moi')
        .set('Authorization', `Bearer ${junior.jeton}`)
        .expect(200);

      expect((moi.body as CorpsJeton['agent']).permissions).toEqual([
        'entite.creer',
      ]);
    });
  });
});
