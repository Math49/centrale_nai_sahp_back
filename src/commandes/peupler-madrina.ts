/**
 * Peuple une instance avec le parcours de référence — le groupe Madrina.
 *
 *   npm run semences:madrina
 *
 * Installe le référentiel s'il est absent, puis rejoue la saisie de l'annexe B
 * de l'étude du besoin. Refuse de s'exécuter si des entités existent déjà :
 * rejouer le parcours par-dessus des données produirait des doublons, et la
 * plaque unique ferait échouer la commande à mi-chemin.
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
    const madrina = contexte.select(SemencesModule).get(MadrinaService);

    const entitesExistantes = await prisma.entite.count();

    if (entitesExistantes > 0) {
      rater(
        `${entitesExistantes} entités existent déjà — repartir d'une base vierge`,
      );
      process.exitCode = 1;
      return;
    }

    // Les créations sont attribuées à un compte réel : les faits portent une
    // clé étrangère vers leur auteur, et rien ne se crée sans auteur.
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

    await madrina.installerReferentiel(auteur.id);
    const entites = await madrina.peuplerParcours(auteur.id);

    dire(`parcours Madrina peuplé — ${Object.keys(entites).length} entités`);
    dire(`créations attribuées à ${auteur.matricule}`);
    dire();
    dire('Isadora Morales et Tyron Banks ne sont reliés par aucun fait.');
    dire('Le rapprochement doit tomber seul, par le graphe (lot 9).');
  } catch (erreur) {
    rater(erreur instanceof Error ? erreur.message : String(erreur));
    process.exitCode = 1;
  } finally {
    await contexte.close();
  }
}

void executer();
