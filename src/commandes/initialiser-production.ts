import { NestFactory } from '@nestjs/core';
import { z } from 'zod';

import { AgentsModule } from '../agents/agents.module';
import { AgentsService } from '../agents/agents.service';
import { CODE_ETAT_MAJOR } from '../agents/grades';
import { RolesService } from '../agents/roles.service';
import { AppModule } from '../app.module';
import { LONGUEUR_MINIMALE_MOT_DE_PASSE } from '../auth/auth.dto';
import { PrismaService } from '../prisma/prisma.service';

const configurationSuperAdmin = z.object({
  SUPER_ADMIN_MATRICULE: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9-]+$/, 'lettres, chiffres et tirets uniquement'),
  SUPER_ADMIN_PRENOM: z.string().min(1).max(128),
  SUPER_ADMIN_NOM: z.string().min(1).max(128),
  SUPER_ADMIN_MOT_DE_PASSE: z
    .string()
    .min(LONGUEUR_MINIMALE_MOT_DE_PASSE)
    .max(256),
  SUPER_ADMIN_GRADE: z.string().min(1).default(CODE_ETAT_MAJOR),
});

const dire = (ligne = ''): void => {
  process.stdout.write(`${ligne}\n`);
};

const rater = (ligne: string): void => {
  process.stderr.write(`${ligne}\n`);
};

function lireConfigurationSuperAdmin() {
  const resultat = configurationSuperAdmin.safeParse(process.env);

  if (!resultat.success) {
    const details = resultat.error.issues
      .map((probleme) => `  ${probleme.path.join('.')} - ${probleme.message}`)
      .join('\n');

    throw new Error(
      `Configuration du premier super-admin invalide :\n${details}`,
    );
  }

  return resultat.data;
}

async function executer(): Promise<void> {
  const contexte = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });

  try {
    const prisma = contexte.get(PrismaService);
    const roles = contexte.select(AgentsModule).get(RolesService);
    const agents = contexte.select(AgentsModule).get(AgentsService);

    const gradesCrees = await roles.initialiserLesGradesManquants();
    if (gradesCrees.length > 0) {
      dire(`grades crees : ${gradesCrees.join(', ')}`);
    }

    const superAdminExistant = await prisma.agent.findFirst({
      where: { superAdmin: true, actif: true, anonymise: false },
      orderBy: { creeLe: 'asc' },
    });

    if (superAdminExistant) {
      dire(
        `super-admin deja present : ${superAdminExistant.matricule} - aucune creation`,
      );
      return;
    }

    const configuration = lireConfigurationSuperAdmin();
    const grade = (await roles.lister()).find(
      (role) => role.code === configuration.SUPER_ADMIN_GRADE,
    );

    if (!grade) {
      throw new Error(`grade inconnu : ${configuration.SUPER_ADMIN_GRADE}`);
    }

    const { agent } = await agents.creer(null, {
      matricule: configuration.SUPER_ADMIN_MATRICULE,
      prenom: configuration.SUPER_ADMIN_PRENOM,
      nom: configuration.SUPER_ADMIN_NOM,
      motDePasse: configuration.SUPER_ADMIN_MOT_DE_PASSE,
      roleId: grade.id,
      superAdmin: true,
    });

    dire(`premier super-admin cree : ${agent.matricule} - ${agent.libelle}`);
    dire(`grade : ${agent.roleLibelle} - changement de mot de passe impose`);
  } catch (erreur) {
    rater(erreur instanceof Error ? erreur.message : String(erreur));
    process.exitCode = 1;
  } finally {
    await contexte.close();
  }
}

void executer();
