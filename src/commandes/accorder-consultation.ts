import { NestFactory } from '@nestjs/core';

import { AgentsModule } from '../agents/agents.module';
import { CONSULTATION } from '../agents/grades';
import { RolesService } from '../agents/roles.service';
import { AppModule } from '../app.module';

const dire = (ligne = ''): void => {
  process.stdout.write(`${ligne}\n`);
};
const rater = (ligne: string): void => {
  process.stderr.write(`${ligne}\n`);
};

/**
 * Montée des grades existants vers les permissions de consultation.
 *
 * Toute lecture était ouverte à quiconque était connecté ; elle relève
 * désormais de trois gestes explicites. Sans cette commande, **tous les grades
 * déjà en base perdent l'accès aux écrans** au déploiement : ils n'ont aucune
 * des trois permissions, et le refus par défaut fait le reste.
 *
 * À lancer une fois, entre la migration et la mise en service. Elle est
 * idempotente et n'enlève jamais rien.
 *
 * Les grades passés en argument sont laissés en l'état — c'est là qu'on met un
 * grade de consultation dont on veut choisir les zones soi-même.
 */
async function executer(): Promise<void> {
  const exclure = process.argv.slice(2);

  const contexte = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });

  try {
    const roles = contexte.select(AgentsModule).get(RolesService);

    const rapport = await roles.accorderAuxGradesExistants(CONSULTATION, {
      exclure,
    });

    if (exclure.length > 0) {
      dire(`laissés en l'état : ${exclure.join(', ')}`);
    }

    if (rapport.length === 0) {
      dire('rien à faire — tous les grades portent déjà ces gestes');
      return;
    }

    for (const ligne of rapport) {
      dire(`${ligne.code} ← ${ligne.ajoutees.join(', ')}`);
    }

    dire();
    dire(`${rapport.length} grade(s) mis à jour`);
  } catch (erreur) {
    rater(erreur instanceof Error ? erreur.message : String(erreur));
    process.exitCode = 1;
  } finally {
    await contexte.close();
  }
}

void executer();
