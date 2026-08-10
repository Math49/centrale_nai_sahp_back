/**
 * Peuplement initial du référentiel — types d'entités, champs, types de liens,
 * onglets. **Aucune donnée d'enquête.**
 *
 *   npm run referentiel:initial
 *
 * C'est la commande de mise en service : une instance vierge n'a pas de modèle
 * métier, et sans lui aucun agent ne peut rien saisir. `npm run
 * semences:madrina` fait la même installation *plus* le parcours de référence,
 * ce qui n'a de sens qu'en développement et en recette.
 *
 * Idempotente : elle ne touche à rien si des types existent déjà. Le référentiel
 * se modifie ensuite depuis l'administration, par un super-admin, et non en
 * rejouant cette commande.
 */
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { MadrinaService } from '../semences/madrina.service';
import { SemencesModule } from '../semences/semences.module';

const dire = (ligne = ''): void => {
  process.stdout.write(`${ligne}\n`);
};
const rater = (ligne: string): void => {
  process.stderr.write(`${ligne}\n`);
};

async function executer(): Promise<void> {
  const contexte = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });

  try {
    const prisma = contexte.get(PrismaService);
    const referentiel = contexte.select(SemencesModule).get(MadrinaService);

    const deja = await prisma.typeEntite.count();

    if (deja > 0) {
      dire(`référentiel déjà installé — ${deja} types d'entités`);
      dire('la configuration se poursuit depuis l’administration.');
      return;
    }

    // La création d'un type porte une clé étrangère vers son auteur : il faut
    // un compte réel, et seul un super-admin crée des types.
    const auteur = await prisma.agent.findFirst({
      where: { superAdmin: true, actif: true, anonymise: false },
      orderBy: { creeLe: 'asc' },
    });

    if (!auteur) {
      rater(
        'aucun super-admin actif — créer un compte avec npm run agent:super-admin',
      );
      process.exitCode = 1;
      return;
    }

    const installe = await referentiel.installerReferentiel(auteur.id);

    dire(
      `référentiel installé — ${Object.keys(installe.types).length} types d'entités, ` +
        `${Object.keys(installe.liens).length} types de liens, ` +
        `${Object.keys(installe.champs).length} champs`,
    );
    dire(`installation attribuée à ${auteur.matricule}`);
    dire();
    dire('La base ne contient aucune donnée d’enquête.');
  } catch (erreur) {
    rater(erreur instanceof Error ? erreur.message : String(erreur));
    process.exitCode = 1;
  } finally {
    await contexte.close();
  }
}

void executer();
