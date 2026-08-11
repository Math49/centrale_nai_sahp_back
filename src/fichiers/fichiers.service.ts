import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import type { AgentCourant } from '../auth/agent-courant';
import type { Environnement } from '../config/environnement';
import { JournalAuditService } from '../journal/journal-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { VisibiliteService } from '../visibilite/visibilite.service';
import type { FichierDto } from './fichiers.dto';
import {
  EXTENSIONS,
  FORMATS_ACCEPTES,
  nettoyerMetadonnees,
  porteDesMetadonnees,
  reconnaitreFormat,
} from './formats-image';

@Injectable()
export class FichiersService implements OnModuleInit {
  private readonly journal = new Logger(FichiersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly visibilite: VisibiliteService,
    private readonly audit: JournalAuditService,
    private readonly configuration: ConfigService<Environnement, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    await mkdir(this.racine(), { recursive: true });
  }

  get tailleMaximale(): number {
    return (
      this.configuration.get('FICHIER_TAILLE_MAX_MO', { infer: true }) *
      1024 *
      1024
    );
  }

  async deposer(
    agent: AgentCourant,
    entiteId: string,
    depot: { nomOrigine: string; octets: Buffer },
  ): Promise<FichierDto> {
    await this.visibilite.entiteVisibleOuIntrouvable(agent, entiteId);

    if (depot.octets.length === 0) {
      throw new BadRequestException('fichier vide');
    }

    if (depot.octets.length > this.tailleMaximale) {
      throw new PayloadTooLargeException(
        `image trop lourde — ${this.configuration.get('FICHIER_TAILLE_MAX_MO', { infer: true })} Mo au plus`,
      );
    }

    const format = reconnaitreFormat(depot.octets);

    if (!format) {
      throw new BadRequestException(
        `format non accepté — ${FORMATS_ACCEPTES.join(', ')} seulement, vérifiés sur le contenu`,
      );
    }

    const propre = nettoyerMetadonnees(depot.octets, format);

    if (porteDesMetadonnees(propre, format)) {
      this.journal.error(
        `métadonnées persistantes après nettoyage — dépôt refusé (${format})`,
      );
      throw new BadRequestException(
        'les métadonnées de cette image n’ont pas pu être retirées',
      );
    }

    const chemin = this.cheminOpaque(format);
    const absolu = join(this.racine(), chemin);

    await mkdir(dirname(absolu), { recursive: true });
    await writeFile(absolu, propre);

    const fichier = await this.prisma.$transaction(async (transaction) => {
      const cree = await transaction.fichier.create({
        data: {
          entiteId,
          nomOrigine: depot.nomOrigine.slice(0, 255),
          chemin,
          mime: format,
          taille: propre.length,
          deposePar: agent.id,
        },
      });

      await this.audit.tracer(
        {
          agentId: agent.id,
          action: 'fichier.deposer',
          cibleTable: 'fichier',
          cibleId: cree.id,

          apres: {
            entiteId,
            mime: cree.mime,
            taille: cree.taille,
            metadonneesRetirees: propre.length !== depot.octets.length,
          },
        },
        transaction,
      );

      return cree;
    });

    return this.presenter(fichier);
  }

  async lister(agent: AgentCourant, entiteId: string): Promise<FichierDto[]> {
    await this.visibilite.entiteVisibleOuIntrouvable(agent, entiteId);

    const fichiers = await this.prisma.fichier.findMany({
      where: { entiteId },
      orderBy: { deposeLe: 'desc' },
    });

    return fichiers.map((fichier) => this.presenter(fichier));
  }

  async supprimer(agent: AgentCourant, id: string): Promise<void> {
    const fichier = await this.prisma.sansFiltre.fichier.findUnique({
      where: { id },
      include: { faits: { select: { id: true } } },
    });

    if (!fichier) {
      throw new NotFoundException('fichier inconnu');
    }

    await this.visibilite.entiteVisibleOuIntrouvable(agent, fichier.entiteId);

    if (fichier.faits.length > 0) {
      throw new ConflictException('image encore utilisée');
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.fichier.delete({ where: { id } });

      await this.audit.tracer(
        {
          agentId: agent.id,
          action: 'fichier.supprimer',
          cibleTable: 'fichier',
          cibleId: fichier.id,
          avant: {
            entiteId: fichier.entiteId,
            nomOrigine: fichier.nomOrigine,
            mime: fichier.mime,
            taille: fichier.taille,
          },
        },
        transaction,
      );
    });

    try {
      await unlink(join(this.racine(), fichier.chemin));
    } catch {
      this.journal.error(
        `image référencée en base mais absente du volume : ${fichier.id}`,
      );
    }
  }

  async telecharger(
    agent: AgentCourant,
    id: string,
  ): Promise<{ octets: Buffer; mime: string; nomOrigine: string }> {
    const fichier = await this.prisma.sansFiltre.fichier.findUnique({
      where: { id },
    });

    if (!fichier) {
      throw new NotFoundException('fichier inconnu');
    }

    await this.visibilite.entiteVisibleOuIntrouvable(agent, fichier.entiteId);

    const absolu = join(this.racine(), fichier.chemin);

    if (!resolve(absolu).startsWith(resolve(this.racine()))) {
      throw new NotFoundException('fichier inconnu');
    }

    try {
      return {
        octets: await readFile(absolu),
        mime: fichier.mime,
        nomOrigine: fichier.nomOrigine,
      };
    } catch {
      this.journal.error(
        `fichier référencé en base mais absent du volume : ${fichier.id}`,
      );
      throw new NotFoundException('fichier inconnu');
    }
  }

  private cheminOpaque(format: keyof typeof EXTENSIONS): string {
    const aleatoire = randomBytes(16).toString('hex');

    return join(
      aleatoire.slice(0, 2),
      aleatoire.slice(2, 4),
      `${aleatoire}.${EXTENSIONS[format]}`,
    );
  }

  private racine(): string {
    return this.configuration.get('FICHIERS_RACINE', { infer: true });
  }

  private presenter(fichier: {
    id: string;
    entiteId: string;
    nomOrigine: string;
    mime: string;
    taille: number;
    deposeLe: Date;
  }): FichierDto {
    return {
      id: fichier.id,
      entiteId: fichier.entiteId,
      nomOrigine: fichier.nomOrigine,
      mime: fichier.mime,
      taille: fichier.taille,
      deposeLe: fichier.deposeLe.toISOString(),
    };
  }
}
