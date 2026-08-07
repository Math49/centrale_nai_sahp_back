/**
 * Amorçage d'une instance : crée les grades manquants et un compte super-admin.
 *
 * Il n'existe pas d'inscription libre, et le premier compte ne peut donc pas
 * être créé par l'API. Cette commande est la seule porte d'entrée.
 *
 *   npm run agent:super-admin -- 2291 Mathis Mercier
 *
 * Arguments positionnels et non nommés : npm intercepte les options longues
 * qu'il ne connaît pas, même placées après `--`, et elles n'atteindraient
 * jamais ce script.
 *
 * Le mot de passe n'est jamais passé en argument : il serait visible dans
 * l'historique du shell et dans la liste des processus. Il est engendré,
 * affiché une seule fois, et le compte est en changement imposé.
 */
import { NestFactory } from '@nestjs/core';

import { AgentsModule } from '../agents/agents.module';
import { AgentsService } from '../agents/agents.service';
import { CODE_ETAT_MAJOR } from '../agents/grades';
import { RolesService } from '../agents/roles.service';
import { AppModule } from '../app.module';

// Sortie de commande, pas de journal applicatif : le logger Nest est réduit au
// silence pour que le mot de passe provisoire ne se perde pas dans l'amorçage.
const dire = (ligne = ''): void => {
  process.stdout.write(`${ligne}\n`);
};
const rater = (ligne: string): void => {
  process.stderr.write(`${ligne}\n`);
};

async function executer(): Promise<void> {
  const [matricule, prenom, nom, codeGrade = CODE_ETAT_MAJOR] =
    process.argv.slice(2);

  if (!matricule || !prenom || !nom) {
    rater(
      'usage : npm run agent:super-admin -- <matricule> <prénom> <nom> [grade]',
    );
    process.exitCode = 1;
    return;
  }

  const contexte = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });

  try {
    const roles = contexte.select(AgentsModule).get(RolesService);
    const agents = contexte.select(AgentsModule).get(AgentsService);

    const gradesCrees = await roles.initialiserLesGradesManquants();
    if (gradesCrees.length > 0) {
      dire(`grades créés : ${gradesCrees.join(', ')}`);
    }

    const grade = (await roles.lister()).find(
      (role) => role.code === codeGrade,
    );

    if (!grade) {
      rater(`grade inconnu : ${codeGrade}`);
      process.exitCode = 1;
      return;
    }

    const { agent, motDePasseProvisoire } = await agents.creer(null, {
      matricule,
      prenom,
      nom,
      roleId: grade.id,
      superAdmin: true,
    });

    dire(`compte créé : ${agent.matricule} — ${agent.libelle}`);
    dire(`grade : ${agent.roleLibelle} · super-admin : oui`);
    dire();
    dire(`mot de passe provisoire : ${motDePasseProvisoire}`);
    dire('à changer à la première connexion, il ne sera plus affiché');
  } catch (erreur) {
    rater(erreur instanceof Error ? erreur.message : String(erreur));
    process.exitCode = 1;
  } finally {
    await contexte.close();
  }
}

void executer();
