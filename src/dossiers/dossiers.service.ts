import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Visibilite, type Dossier } from '@prisma/client';

import { JournalAuditService } from '../journal/journal-audit.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Dossiers — noyau posé au lot 5, exposé au lot 8.
 *
 * Le moteur de visibilité en dépend : un fait hérite de la visibilité de son
 * dossier de saisie, et la règle des gardiens compte le dossier parmi les
 * quatre objets à franchir. Les routes, le panneau de dossier et la gestion du
 * suivi viennent au lot 8 ; ce service porte ce qu'il faut pour que la
 * visibilité soit vérifiable dès maintenant.
 *
 * **Le dossier ne contient rien.** Il contextualise.
 */
@Injectable()
export class DossiersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: JournalAuditService,
  ) {}

  async creer(
    agentId: string,
    donnees: {
      nom: string;
      entitePivotId: string;
      visibilite?: Visibilite;
      note?: string;
    },
  ): Promise<Dossier> {
    const pivot = await this.prisma.sansFiltre.entite.findUnique({
      where: { id: donnees.entitePivotId },
    });

    if (!pivot) {
      throw new NotFoundException('entité pivot inconnue');
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const dossier = await transaction.dossier.create({
          data: {
            nom: donnees.nom.trim(),
            entitePivotId: pivot.id,
            visibilite: donnees.visibilite ?? Visibilite.public,
            note: donnees.note,
            creePar: agentId,
          },
        });

        // Le pivot est suivi par son dossier dès la création : c'est ce qui
        // rend « ouvrir le dossier » équivalent à « ouvrir sa fiche ».
        await transaction.suivi.create({
          data: {
            dossierId: dossier.id,
            entiteId: pivot.id,
            ajoutePar: agentId,
          },
        });

        await this.audit.tracer(
          {
            agentId,
            action: 'dossier.creer',
            cibleTable: 'dossier',
            cibleId: dossier.id,
            apres: { nom: dossier.nom, visibilite: dossier.visibilite },
          },
          transaction,
        );

        return dossier;
      });
    } catch (erreur) {
      if (
        erreur instanceof Prisma.PrismaClientKnownRequestError &&
        erreur.code === 'P2002'
      ) {
        throw new ConflictException('un dossier porte déjà ce nom');
      }
      throw erreur;
    }
  }

  /**
   * Change la visibilité d'un dossier.
   *
   * La cascade en base recalcule aussitôt la visibilité effective de tous les
   * faits saisis depuis ce dossier : c'est le cas de référence — l'entité reste
   * publique, le dossier passe en privé, et tout ce qui en vient disparaît.
   */
  async definirVisibilite(
    agentId: string,
    id: string,
    visibilite: Visibilite,
  ): Promise<Dossier> {
    const avant = await this.charger(id);

    return this.prisma.$transaction(async (transaction) => {
      const apres = await transaction.dossier.update({
        where: { id },
        data: { visibilite },
      });

      await this.audit.tracer(
        {
          agentId,
          action: 'dossier.modifier',
          cibleTable: 'dossier',
          cibleId: id,
          avant: { visibilite: avant.visibilite },
          apres: { visibilite },
        },
        transaction,
      );

      return apres;
    });
  }

  async suivre(
    agentId: string,
    dossierId: string,
    entiteId: string,
  ): Promise<void> {
    await this.charger(dossierId);

    await this.prisma.suivi.upsert({
      where: { dossierId_entiteId: { dossierId, entiteId } },
      create: { dossierId, entiteId, ajoutePar: agentId },
      update: {},
    });
  }

  /** Whitelist : l'habilitation est nominative, jamais déduite d'un grade. */
  async habiliter(
    accordePar: string,
    dossierId: string,
    agentId: string,
  ): Promise<void> {
    await this.charger(dossierId);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.habilitationDossier.upsert({
        where: { dossierId_agentId: { dossierId, agentId } },
        create: { dossierId, agentId, accordePar },
        update: {},
      });

      await this.audit.tracer(
        {
          agentId: accordePar,
          action: 'dossier.habiliter',
          cibleTable: 'habilitation_dossier',
          cibleId: dossierId,
          apres: { agentHabilite: agentId },
        },
        transaction,
      );
    });
  }

  async retirerHabilitation(
    retirePar: string,
    dossierId: string,
    agentId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.habilitationDossier.deleteMany({
        where: { dossierId, agentId },
      });

      await this.audit.tracer(
        {
          agentId: retirePar,
          action: 'dossier.retirer_habilitation',
          cibleTable: 'habilitation_dossier',
          cibleId: dossierId,
          avant: { agentHabilite: agentId },
        },
        transaction,
      );
    });
  }

  /** Habilitation nominative sur une entité, l'autre whitelist. */
  async habiliterSurEntite(
    accordePar: string,
    entiteId: string,
    agentId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.habilitationEntite.upsert({
        where: { entiteId_agentId: { entiteId, agentId } },
        create: { entiteId, agentId, accordePar },
        update: {},
      });

      await this.audit.tracer(
        {
          agentId: accordePar,
          action: 'entite.habiliter',
          cibleTable: 'habilitation_entite',
          cibleId: entiteId,
          apres: { agentHabilite: agentId },
        },
        transaction,
      );
    });
  }

  private async charger(id: string): Promise<Dossier> {
    const dossier = await this.prisma.sansFiltre.dossier.findUnique({
      where: { id },
    });

    if (!dossier) {
      throw new NotFoundException('dossier inconnu');
    }

    return dossier;
  }
}
