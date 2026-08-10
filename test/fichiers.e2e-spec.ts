import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Visibilite } from '@prisma/client';
import type { Server } from 'node:http';
import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';

import {
  CODE_ETAT_MAJOR,
  CODE_JUNIOR,
  CODE_SENIOR,
} from '../src/agents/grades';
import { AppModule } from '../src/app.module';
import type { FichierDto } from '../src/fichiers/fichiers.dto';
import { porteDesMetadonnees } from '../src/fichiers/formats-image';
import { PrismaService } from '../src/prisma/prisma.service';
import { MadrinaService } from '../src/semences/madrina.service';
import {
  creerCompteActif,
  reinitialiserLaBase,
  type Compte,
} from './aide-comptes';

const RACINE = process.env.FICHIERS_RACINE ?? './donnees/fichiers';

/** Un JPEG minimal portant un segment EXIF avec des coordonnées. */
function jpegAvecExif(): Buffer {
  const exif = Buffer.from('Exif\0\0MM*GPSLatitude 34.0522N 118.2437W');
  const entete = Buffer.alloc(4);
  entete[0] = 0xff;
  entete[1] = 0xe1;
  entete.writeUInt16BE(exif.length + 2, 2);

  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    entete,
    exif,
    Buffer.from([0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0]),
    Buffer.from([0x12, 0x34, 0x56, 0xff, 0xd9]),
  ]);
}

/**
 * Recette du service de fichiers, lot 12 : nom opaque, type vérifié sur le
 * contenu, taille plafonnée, métadonnées retirées, jamais servi en statique.
 */
describe('Lot 12 — fichiers (e2e)', () => {
  let application: INestApplication;
  let serveur: Server;
  let prisma: PrismaService;

  let superAdmin: Compte;
  let etatMajor: Compte;
  let senior: Compte;
  let junior: Compte;

  let entites: Record<string, string>;
  let depose: FichierDto;

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
    prisma = application.get(PrismaService);

    await reinitialiserLaBase(application);
    await rm(RACINE, { recursive: true, force: true });

    superAdmin = await creerCompteActif(application, {
      matricule: 'sa-301',
      prenom: 'Mathis',
      nom: 'Mercier',
      roleCode: CODE_ETAT_MAJOR,
      superAdmin: true,
    });

    etatMajor = await creerCompteActif(application, {
      matricule: 'em-302',
      prenom: 'Alix',
      nom: 'Reyes',
      roleCode: CODE_ETAT_MAJOR,
    });

    senior = await creerCompteActif(application, {
      matricule: 'si-303',
      prenom: 'Noa',
      nom: 'Duval',
      roleCode: CODE_SENIOR,
    });

    junior = await creerCompteActif(application, {
      matricule: 'ji-304',
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
    await rm(RACINE, { recursive: true, force: true });
  });

  describe('dépôt', () => {
    it('accepte une image et en retire les métadonnées', async () => {
      const avec = jpegAvecExif();
      expect(porteDesMetadonnees(avec, 'image/jpeg')).toBe(true);

      const reponse = await request(serveur)
        .post(`/entites/${entites.villa}/fichiers`)
        .set(enTantQue(senior))
        .attach('fichier', avec, 'planque-06-08.jpg')
        .expect(201);

      depose = reponse.body as FichierDto;

      expect(depose.mime).toBe('image/jpeg');
      expect(depose.nomOrigine).toBe('planque-06-08.jpg');
      // L'image a maigri de tout son EXIF.
      expect(depose.taille).toBeLessThan(avec.length);
    });

    it('écrit sur le volume une image effectivement nettoyée', async () => {
      const enBase = await prisma.sansFiltre.fichier.findUniqueOrThrow({
        where: { id: depose.id },
      });

      const octets = await readFile(join(RACINE, enBase.chemin));

      expect(porteDesMetadonnees(octets, 'image/jpeg')).toBe(false);
      expect(octets.includes(Buffer.from('GPSLatitude'))).toBe(false);
      // Les données compressées, elles, sont intactes : aucun réencodage.
      expect(octets.includes(Buffer.from([0x12, 0x34, 0x56]))).toBe(true);
    });

    it('range l’image sous un nom opaque', async () => {
      const enBase = await prisma.sansFiltre.fichier.findUniqueOrThrow({
        where: { id: depose.id },
      });

      // Rien du nom d'origine, de l'entité ni de l'auteur ne transparaît.
      expect(enBase.chemin).not.toContain('planque');
      expect(enBase.chemin).not.toContain(entites.villa);
      expect(enBase.chemin).not.toContain(senior.id);
      expect(enBase.chemin).toMatch(
        /[0-9a-f]{2}[\\/][0-9a-f]{2}[\\/][0-9a-f]{32}\.jpg$/,
      );
    });

    it('refuse un fichier qui n’est pas une image, malgré son extension', async () => {
      const executable = Buffer.concat([
        Buffer.from('MZ'),
        Buffer.alloc(200, 0x90),
      ]);

      await request(serveur)
        .post(`/entites/${entites.villa}/fichiers`)
        .set(enTantQue(senior))
        .attach('fichier', executable, 'photo.jpg')
        .expect(400);
    });

    it('refuse un fichier vide', async () => {
      await request(serveur)
        .post(`/entites/${entites.villa}/fichiers`)
        .set(enTantQue(senior))
        .attach('fichier', Buffer.alloc(0), 'rien.jpg')
        .expect(400);
    });

    it('refuse le dépôt sans la permission', async () => {
      const sansDroit = await creerCompteActif(application, {
        matricule: 'lecteur-305',
        prenom: 'Iris',
        nom: 'Bonnet',
        roleCode: CODE_JUNIOR,
      });

      const roleJunior = await prisma.sansFiltre.role.findFirstOrThrow({
        where: { code: CODE_JUNIOR },
      });
      const permissions = roleJunior.permissions;

      await prisma.sansFiltre.role.update({
        where: { id: roleJunior.id },
        data: {
          permissions: permissions.filter((code) => code !== 'fait.creer'),
        },
      });

      await request(serveur)
        .post(`/entites/${entites.villa}/fichiers`)
        .set(enTantQue(sansDroit))
        .attach('fichier', jpegAvecExif(), 'x.jpg')
        .expect(403);

      await prisma.sansFiltre.role.update({
        where: { id: roleJunior.id },
        data: { permissions },
      });
    });

    it('refuse de déposer sur une fiche qu’on ne voit pas', async () => {
      await request(serveur)
        .patch(`/entites/${entites.bijouterie}`)
        .set(enTantQue(etatMajor))
        .send({ visibilite: Visibilite.prive })
        .expect(200);

      // 404, jamais 403 : un refus confirmerait l'existence de la fiche.
      await request(serveur)
        .post(`/entites/${entites.bijouterie}/fichiers`)
        .set(enTantQue(junior))
        .attach('fichier', jpegAvecExif(), 'x.jpg')
        .expect(404);
    });
  });

  describe('service de l’octet', () => {
    it('n’est jamais servi en statique', async () => {
      const enBase = await prisma.sansFiltre.fichier.findUniqueOrThrow({
        where: { id: depose.id },
      });

      // Le chemin sur le volume n'est pas une route : rien ne l'expose.
      await request(serveur)
        .get(`/${enBase.chemin.replace(/\\/g, '/')}`)
        .set(enTantQue(senior))
        .expect(404);
    });

    it('exige un jeton', async () => {
      await request(serveur).get(`/fichiers/${depose.id}`).expect(401);
    });

    it('renvoie l’image à qui voit la fiche', async () => {
      const reponse = await request(serveur)
        .get(`/fichiers/${depose.id}`)
        .set(enTantQue(junior))
        .expect(200);

      expect(reponse.headers['content-type']).toBe('image/jpeg');
      expect(reponse.headers['x-content-type-options']).toBe('nosniff');
      // En pièce jointe : le navigateur n'exécute rien depuis l'origine de l'API.
      expect(reponse.headers['content-disposition']).toContain('attachment');
      expect(porteDesMetadonnees(reponse.body as Buffer, 'image/jpeg')).toBe(
        false,
      );
    });

    it('la refuse à qui ne voit pas la fiche', async () => {
      const cachee = await request(serveur)
        .post(`/entites/${entites.autoroute}/fichiers`)
        .set(enTantQue(senior))
        .attach('fichier', jpegAvecExif(), 'autoroute.jpg')
        .expect(201);

      const id = (cachee.body as FichierDto).id;

      await request(serveur)
        .patch(`/entites/${entites.autoroute}`)
        .set(enTantQue(etatMajor))
        .send({ visibilite: Visibilite.prive })
        .expect(200);

      await request(serveur)
        .get(`/fichiers/${id}`)
        .set(enTantQue(junior))
        .expect(404);

      // L'État-Major dispose de la dérogation : pour lui, l'image existe.
      await request(serveur)
        .get(`/fichiers/${id}`)
        .set(enTantQue(etatMajor))
        .expect(200);
    });

    it('liste les images d’une fiche, et rien d’une fiche masquée', async () => {
      const visibles = await request(serveur)
        .get(`/entites/${entites.villa}/fichiers`)
        .set(enTantQue(junior))
        .expect(200);

      expect((visibles.body as FichierDto[]).length).toBeGreaterThan(0);

      await request(serveur)
        .get(`/entites/${entites.autoroute}/fichiers`)
        .set(enTantQue(junior))
        .expect(404);
    });
  });

  describe('traçabilité du dépôt', () => {
    it('trace le dépôt sans recopier le chemin opaque', async () => {
      const traces = await request(serveur)
        .get('/journal/audit')
        .query({ action: 'fichier.deposer' })
        .set(enTantQue(etatMajor))
        .expect(200);

      const serialise = JSON.stringify(traces.body);

      expect(serialise).toContain('fichier.deposer');

      const enBase = await prisma.sansFiltre.fichier.findUniqueOrThrow({
        where: { id: depose.id },
      });

      // Le chemin est la seule chose qui protège le volume : il ne se relit
      // nulle part, pas même dans un journal réservé à l'État-Major.
      expect(serialise).not.toContain(enBase.chemin.replace(/\\/g, '\\\\'));
    });

    it('ne laisse aucun original sur le volume', async () => {
      const tout = await lireRecursivement(RACINE);

      for (const chemin of tout) {
        const octets = await readFile(chemin);
        expect(octets.includes(Buffer.from('GPSLatitude'))).toBe(false);
      }
    });
  });
});

async function lireRecursivement(racine: string): Promise<string[]> {
  const entrees = await readdir(racine, { withFileTypes: true }).catch(
    () => [],
  );

  const chemins: string[] = [];

  for (const entree of entrees) {
    const complet = join(racine, entree.name);
    if (entree.isDirectory()) {
      chemins.push(...(await lireRecursivement(complet)));
    } else {
      chemins.push(complet);
    }
  }

  return chemins;
}
