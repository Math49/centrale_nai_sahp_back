import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { CONSULTATION, GRADES } from '../src/agents/grades';
import { RolesService } from '../src/agents/roles.service';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { reinitialiserLaBase } from './aide-comptes';

/**
 * Ce que fait le conteneur au démarrage, isolé.
 *
 * Un geste ajouté au catalogue retire un accès aux grades déjà en base : sans
 * montée, le premier démarrage après ce déploiement fermerait tous les écrans
 * à tout le monde. La recette existe pour que ce mode de défaillance ne puisse
 * pas revenir en silence.
 */
describe('Montée des grades au démarrage (e2e)', () => {
  let application: INestApplication;
  let roles: RolesService;
  let prisma: PrismaService;

  const CODES_LIVRES = GRADES.map((grade) => grade.code);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    application = module.createNestApplication();
    await application.init();

    roles = application.get(RolesService);
    prisma = application.get(PrismaService);
  });

  afterAll(async () => {
    await application.close();
  });

  beforeEach(async () => {
    await reinitialiserLaBase(application);
    await roles.initialiserLesGradesManquants();

    // On simule l'état d'une base antérieure au catalogue : les grades livrés
    // existent, mais sans les gestes de lecture.
    for (const code of CODES_LIVRES) {
      const role = (await roles.lister()).find(
        (candidat) => candidat.code === code,
      );

      await prisma.role.update({
        where: { id: role!.id },
        data: {
          permissions: role!.permissions.filter(
            (permission) => !CONSULTATION.includes(permission as never),
          ),
        },
      });
    }

    await prisma.role.create({
      data: { code: 'visiteur', libelle: 'Visiteur', permissions: [], ordre: 9 },
    });
  });

  it('rend les gestes de lecture aux grades livrés', async () => {
    const rapport = await roles.accorderAuxGradesExistants(CONSULTATION, {
      seulement: CODES_LIVRES,
    });

    expect(rapport.map((ligne) => ligne.code).sort()).toEqual(
      [...CODES_LIVRES].sort(),
    );

    for (const role of await roles.lister()) {
      if (CODES_LIVRES.includes(role.code)) {
        expect(role.permissions).toEqual(
          expect.arrayContaining([...CONSULTATION]),
        );
      }
    }
  });

  it('ne décide rien pour un grade créé à la main', async () => {
    await roles.accorderAuxGradesExistants(CONSULTATION, {
      seulement: CODES_LIVRES,
    });

    const visiteur = (await roles.lister()).find(
      (role) => role.code === 'visiteur',
    );

    expect(visiteur?.permissions).toEqual([]);
  });

  it('est idempotente — un second démarrage ne fait rien', async () => {
    await roles.accorderAuxGradesExistants(CONSULTATION, {
      seulement: CODES_LIVRES,
    });

    const second = await roles.accorderAuxGradesExistants(CONSULTATION, {
      seulement: CODES_LIVRES,
    });

    expect(second).toEqual([]);
  });

  it('n’enlève jamais une permission déjà accordée', async () => {
    const avant = (await roles.lister()).map((role) => ({
      code: role.code,
      permissions: [...role.permissions],
    }));

    await roles.accorderAuxGradesExistants(CONSULTATION, {
      seulement: CODES_LIVRES,
    });

    for (const role of await roles.lister()) {
      const initial = avant.find((candidat) => candidat.code === role.code);
      expect(role.permissions).toEqual(
        expect.arrayContaining(initial!.permissions),
      );
    }
  });
});
