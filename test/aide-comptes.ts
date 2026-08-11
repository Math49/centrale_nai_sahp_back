import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';

import { AgentsService } from '../src/agents/agents.service';
import { RolesService } from '../src/agents/roles.service';
import { PrismaService } from '../src/prisma/prisma.service';

const TABLES = [
  'journal_audit',
  'valeur_unique',
  'fait',
  'fichier',
  'entite',
  'onglet_type_lien',
  'onglet',
  'type_lien',
  'definition_champ',
  'type_entite',
  'agent',
  'role',
];

export async function reinitialiserLaBase(
  application: INestApplication,
): Promise<void> {
  const prisma = application.get(PrismaService);

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`,
  );
}

export interface Compte {
  id: string;
  matricule: string;
  jeton: string;
}

const MOT_DE_PASSE = 'mot-de-passe-de-recette';

export async function creerCompteActif(
  application: INestApplication,
  options: {
    matricule: string;
    prenom: string;
    nom: string;
    roleCode: string;
    superAdmin?: boolean;
  },
): Promise<Compte> {
  const roles = application.get(RolesService);
  const agents = application.get(AgentsService);
  const serveur = application.getHttpServer() as Server;

  await roles.initialiserLesGradesManquants();

  const grade = (await roles.lister()).find(
    (role) => role.code === options.roleCode,
  );

  if (!grade) {
    throw new Error(`grade inconnu dans les tests : ${options.roleCode}`);
  }

  const { agent, motDePasseProvisoire } = await agents.creer(null, {
    matricule: options.matricule,
    prenom: options.prenom,
    nom: options.nom,
    roleId: grade.id,
    superAdmin: options.superAdmin ?? false,
  });

  const connexion = await request(serveur)
    .post('/auth/login')
    .send({
      matricule: options.matricule,
      motDePasse: motDePasseProvisoire,
    })
    .expect(200);

  const change = await request(serveur)
    .post('/auth/mot-de-passe')
    .set(
      'Authorization',
      `Bearer ${(connexion.body as { jeton: string }).jeton}`,
    )
    .send({ ancien: motDePasseProvisoire, nouveau: MOT_DE_PASSE })
    .expect(200);

  return {
    id: agent.id,
    matricule: options.matricule,
    jeton: (change.body as { jeton: string }).jeton,
  };
}
