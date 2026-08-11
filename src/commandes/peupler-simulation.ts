import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { SemencesModule } from '../semences/semences.module';
import { SimulationService } from '../semences/simulation.service';

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
    const simulation = contexte.select(SemencesModule).get(SimulationService);

    const dejaLa = await prisma.entite.count();

    if (dejaLa > 0) {
      rater(`${dejaLa} entités existent déjà — repartir d'une base vierge`);
      rater('  docker compose -f docker-compose.dev.yml down -v');
      process.exitCode = 1;
      return;
    }

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

    const bilan = await simulation.peupler(auteur.id);

    dire(`simulation peuplée — ${bilan.entites} entités, ${bilan.faits} faits`);
    dire(`saisies attribuées à ${auteur.matricule}`);
    dire();
    dire('Ce qu’il y a à regarder :');
    dire('  · 8KLM204 relie trois événements de trois dossiers — récurrence');
    dire('  · Isadora Morales n’appartient à aucun groupe, et pourtant relie');
    dire('  · « Contrôle interne — dossier 41 » est privé, son pivot public');
    dire('  · une fiche archivée, un fait infirmé, deux entités classées');
  } catch (erreur) {
    rater(erreur instanceof Error ? erreur.message : String(erreur));
    process.exitCode = 1;
  } finally {
    await contexte.close();
  }
}

void executer();
