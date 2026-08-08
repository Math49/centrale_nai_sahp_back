import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NatureFait, Prisma, Visibilite, type Fait } from '@prisma/client';

import { UniciteService } from '../entites/unicite.service';
import { ValidationDynamiqueService } from '../entites/validation-dynamique.service';
import { JournalAuditService } from '../journal/journal-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreationFaitDto,
  FaitDto,
  ModificationFaitDto,
} from './faits.dto';

@Injectable()
export class FaitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: ValidationDynamiqueService,
    private readonly unicite: UniciteService,
    private readonly audit: JournalAuditService,
  ) {}

  async creer(agentId: string, donnees: CreationFaitDto): Promise<FaitDto> {
    const sujet = await this.prisma.entite.findUnique({
      where: { id: donnees.sujetId },
      include: { typeEntite: true },
    });

    if (!sujet) {
      throw new NotFoundException('entité sujet inconnue');
    }

    const data: Prisma.FaitUncheckedCreateInput = {
      sujetId: sujet.id,
      nature: donnees.nature,
      source: donnees.source.trim(),
      fiabilite: donnees.fiabilite,
      dateConstatation: new Date(donnees.dateConstatation),
      visibilite: donnees.visibilite ?? Visibilite.public,
      creePar: agentId,
    };

    if (donnees.nature === NatureFait.champ) {
      if (!donnees.definitionChampId) {
        throw new BadRequestException('champ non désigné');
      }

      const definition = await this.prisma.definitionChamp.findUnique({
        where: { id: donnees.definitionChampId },
      });

      if (!definition || definition.typeEntiteId !== sujet.typeEntiteId) {
        throw new BadRequestException(
          `champ étranger au type ${sujet.typeEntite.libelle}`,
        );
      }

      data.definitionChampId = definition.id;
      data.valeur = this.validation.valider(definition, donnees.valeur);
    } else {
      if (!donnees.typeLienId || !donnees.cibleId) {
        throw new BadRequestException('lien incomplet');
      }

      const [typeLien, cible] = await Promise.all([
        this.prisma.typeLien.findUnique({ where: { id: donnees.typeLienId } }),
        this.prisma.entite.findUnique({ where: { id: donnees.cibleId } }),
      ]);

      if (!typeLien) {
        throw new BadRequestException('type de lien inconnu');
      }

      if (!cible) {
        throw new BadRequestException('entité cible inconnue');
      }

      if (typeLien.typeEntiteSourceId !== sujet.typeEntiteId) {
        throw new BadRequestException(
          `« ${typeLien.libelle} » ne part pas de ce type d'entité`,
        );
      }

      if (typeLien.typeEntiteCibleId !== cible.typeEntiteId) {
        throw new BadRequestException(
          `« ${typeLien.libelle} » ne pointe pas vers ce type d'entité`,
        );
      }

      data.typeLienId = typeLien.id;
      data.cibleId = cible.id;
    }

    const fait = await this.executer(
      {
        typeEntiteId: sujet.typeEntiteId,
        entiteId: sujet.id,
        champs: data.definitionChampId
          ? [
              {
                definitionChampId: data.definitionChampId,
                valeur: donnees.valeur,
              },
            ]
          : [],
      },
      () =>
        this.prisma.$transaction(async (transaction) => {
          const cree = await transaction.fait.create({ data });

          await this.audit.tracer(
            {
              agentId,
              action: 'fait.creer',
              cibleTable: 'fait',
              cibleId: cree.id,
              apres: { sujetId: cree.sujetId, nature: cree.nature },
            },
            transaction,
          );

          return cree;
        }),
    );

    return this.presenter(fait);
  }

  /**
   * Modification d'un fait.
   *
   * La cible d'un lien ne se corrige pas : un lien mal posé s'infirme (lot 11)
   * et se refait. Corriger la cible en place réécrirait l'histoire du graphe
   * sans laisser de trace de ce qui avait été affirmé.
   */
  async modifier(
    agentId: string,
    id: string,
    donnees: ModificationFaitDto,
  ): Promise<FaitDto> {
    const avant = await this.prisma.fait.findUnique({
      where: { id },
      include: { definitionChamp: true },
    });

    if (!avant) {
      throw new NotFoundException('fait inconnu');
    }

    if (avant.etat !== 'actif') {
      throw new ConflictException(
        'fait infirmé ou archivé — il reste consultable mais ne se modifie plus',
      );
    }

    const data: Prisma.FaitUncheckedUpdateInput = {
      modifiePar: agentId,
    };

    if (donnees.valeur !== undefined) {
      if (avant.nature !== NatureFait.champ || !avant.definitionChamp) {
        throw new BadRequestException(
          'seule la valeur d’un champ se modifie ; un lien mal posé s’infirme',
        );
      }
      data.valeur = this.validation.valider(
        avant.definitionChamp,
        donnees.valeur,
      );
    }

    if (donnees.source !== undefined) data.source = donnees.source.trim();
    if (donnees.fiabilite !== undefined) data.fiabilite = donnees.fiabilite;
    if (donnees.visibilite !== undefined) data.visibilite = donnees.visibilite;
    if (donnees.dateConstatation !== undefined) {
      data.dateConstatation = new Date(donnees.dateConstatation);
    }

    const fait = await this.executer(
      {
        typeEntiteId: avant.definitionChamp?.typeEntiteId ?? '',
        entiteId: avant.sujetId,
        champs: avant.definitionChampId
          ? [
              {
                definitionChampId: avant.definitionChampId,
                valeur: donnees.valeur,
              },
            ]
          : [],
      },
      () =>
        this.prisma.$transaction(async (transaction) => {
          const misAJour = await transaction.fait.update({
            where: { id },
            data,
          });

          await this.audit.tracer(
            {
              agentId,
              action: 'fait.modifier',
              cibleTable: 'fait',
              cibleId: id,
              avant: {
                valeur: avant.valeur as Prisma.InputJsonValue,
                source: avant.source,
                fiabilite: avant.fiabilite,
              },
              apres: {
                valeur: misAJour.valeur as Prisma.InputJsonValue,
                source: misAJour.source,
                fiabilite: misAJour.fiabilite,
              },
            },
            transaction,
          );

          return misAJour;
        }),
    );

    return this.presenter(fait);
  }

  private presenter(fait: Fait): FaitDto {
    return {
      id: fait.id,
      sujetId: fait.sujetId,
      nature: fait.nature,
      definitionChampId: fait.definitionChampId,
      valeur: fait.valeur,
      typeLienId: fait.typeLienId,
      cibleId: fait.cibleId,
      source: fait.source,
      fiabilite: fait.fiabilite,
      dateConstatation: fait.dateConstatation.toISOString().slice(0, 10),
      etat: fait.etat,
      visibilite: fait.visibilite,
      creeLe: fait.creeLe.toISOString(),
      modifieLe: fait.modifieLe.toISOString(),
    };
  }

  private async executer<T>(
    contexte: {
      typeEntiteId: string;
      entiteId: string;
      champs: { definitionChampId: string; valeur: unknown }[];
    },
    action: () => Promise<T>,
  ): Promise<T> {
    try {
      return await action();
    } catch (erreur) {
      if (this.unicite.estUnRefusDUnicite(erreur)) {
        const explication = await this.unicite.decrireLeConflit(
          contexte.typeEntiteId,
          contexte.champs,
          contexte.entiteId,
        );

        throw new ConflictException(explication ?? 'valeur déjà attribuée');
      }

      const message = erreur instanceof Error ? erreur.message : String(erreur);

      if (message.includes('fait_pas_de_boucle')) {
        throw new BadRequestException('une entité ne se relie pas à elle-même');
      }

      throw erreur;
    }
  }
}
