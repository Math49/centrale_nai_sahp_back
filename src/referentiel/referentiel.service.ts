import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SensLien,
  TypeDonnee,
  type DefinitionChamp,
  type Onglet,
  type OngletTypeLien,
  type TypeEntite,
  type TypeLien,
} from '@prisma/client';

import { JournalAuditService } from '../journal/journal-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  appliquerGabarit,
  extraireCles,
  verifierClesDuGabarit,
  verifierSyntaxeGabarit,
} from './gabarit';
import type {
  CompositionOngletDto,
  CreationChampDto,
  CreationOngletDto,
  CreationTypeEntiteDto,
  CreationTypeLienDto,
  DefinitionChampDto,
  ModificationChampDto,
  ModificationOngletDto,
  ModificationTypeEntiteDto,
  ModificationTypeLienDto,
  OngletDto,
  ReferentielDto,
  ResultatApercuDto,
  TypeEntiteDto,
  TypeLienDto,
} from './referentiel.dto';

type OngletComplet = Onglet & { typesLiens: OngletTypeLien[] };
type TypeEntiteComplet = TypeEntite & {
  champs: DefinitionChamp[];
  onglets: OngletComplet[];
};

@Injectable()
export class ReferentielService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: JournalAuditService,
  ) {}

  // ─────────────────────────── Lecture ───────────────────────────

  /**
   * Catalogue complet en une requête.
   *
   * Le front en dérive tous ses formulaires et toutes ses fiches : le découper
   * en plusieurs appels l'obligerait à recomposer, et à connaître l'ordre des
   * dépendances entre types, champs, liens et onglets.
   */
  async catalogue(): Promise<ReferentielDto> {
    const [typesEntites, typesLiens] = await Promise.all([
      this.prisma.typeEntite.findMany({
        include: {
          champs: { orderBy: { ordre: 'asc' } },
          onglets: {
            orderBy: { ordre: 'asc' },
            include: { typesLiens: { orderBy: { ordre: 'asc' } } },
          },
        },
        orderBy: { ordre: 'asc' },
      }),
      this.prisma.typeLien.findMany({ orderBy: { ordre: 'asc' } }),
    ]);

    return {
      typesEntites: typesEntites.map((type) => this.presenterTypeEntite(type)),
      typesLiens: typesLiens.map((lien) => this.presenterTypeLien(lien)),
    };
  }

  // ─────────────────────── Types d'entités ───────────────────────

  async creerTypeEntite(
    auteurId: string,
    donnees: CreationTypeEntiteDto,
  ): Promise<TypeEntiteDto> {
    // À la création, le type n'a aucun champ : seule la forme du gabarit est
    // vérifiable. Les clés le seront à la première modification.
    verifierSyntaxeGabarit(donnees.modeleLibelle);

    const cree = await this.executer(() =>
      this.prisma.$transaction(async (transaction) => {
        const type = await transaction.typeEntite.create({
          data: {
            ...donnees,
            ordre: await this.prochainOrdre(transaction.typeEntite),
          },
          include: {
            champs: true,
            onglets: { include: { typesLiens: true } },
          },
        });

        await this.tracer(
          transaction,
          auteurId,
          'referentiel.type_entite.creer',
          {
            cibleId: type.id,
            apres: { code: type.code, libelle: type.libelle },
          },
        );

        return type;
      }),
    );

    return this.presenterTypeEntite(cree);
  }

  async modifierTypeEntite(
    auteurId: string,
    id: string,
    donnees: ModificationTypeEntiteDto,
  ): Promise<TypeEntiteDto> {
    const avant = await this.chargerTypeEntite(id);

    if (donnees.modeleLibelle !== undefined) {
      verifierSyntaxeGabarit(donnees.modeleLibelle);
      verifierClesDuGabarit(
        donnees.modeleLibelle,
        avant.champs.map((champ) => champ.cle),
      );
    }

    const apres = await this.executer(() =>
      this.prisma.$transaction(async (transaction) => {
        const type = await transaction.typeEntite.update({
          where: { id },
          data: donnees,
          include: {
            champs: { orderBy: { ordre: 'asc' } },
            onglets: {
              orderBy: { ordre: 'asc' },
              include: { typesLiens: { orderBy: { ordre: 'asc' } } },
            },
          },
        });

        await this.tracer(
          transaction,
          auteurId,
          'referentiel.type_entite.modifier',
          {
            cibleId: id,
            avant: {
              libelle: avant.libelle,
              modeleLibelle: avant.modeleLibelle,
            },
            apres: { libelle: type.libelle, modeleLibelle: type.modeleLibelle },
          },
        );

        return type;
      }),
    );

    return this.presenterTypeEntite(apres);
  }

  async supprimerTypeEntite(auteurId: string, id: string): Promise<void> {
    await this.chargerTypeEntite(id);

    await this.executer(() =>
      this.prisma.$transaction(async (transaction) => {
        await transaction.typeEntite.delete({ where: { id } });
        await this.tracer(
          transaction,
          auteurId,
          'referentiel.type_entite.supprimer',
          { cibleId: id },
        );
      }),
    );
  }

  async ordonnerTypesEntites(auteurId: string, ids: string[]): Promise<void> {
    const existants = await this.prisma.typeEntite.findMany({
      select: { id: true },
    });

    this.verifierJeuComplet(ids, existants);

    await this.prisma.$transaction(async (transaction) => {
      await Promise.all(
        ids.map((id, rang) =>
          transaction.typeEntite.update({
            where: { id },
            data: { ordre: rang },
          }),
        ),
      );

      await this.tracer(
        transaction,
        auteurId,
        'referentiel.type_entite.ordonner',
        { apres: { ids } },
      );
    });
  }

  apercuGabarit(modele: string): ResultatApercuDto {
    verifierSyntaxeGabarit(modele);

    const clesCitees = extraireCles(modele);
    const exemples = Object.fromEntries(
      clesCitees.map((cle, rang) => [cle, `valeur ${rang + 1}`]),
    );

    return { apercu: appliquerGabarit(modele, exemples), clesCitees };
  }

  // ───────────────────────────── Champs ─────────────────────────────

  async creerChamp(
    auteurId: string,
    donnees: CreationChampDto,
  ): Promise<DefinitionChampDto> {
    await this.chargerTypeEntite(donnees.typeEntiteId);
    this.verifierCoherenceChamp(donnees.typeDonnee, donnees);

    const cree = await this.executer(() =>
      this.prisma.$transaction(async (transaction) => {
        const champ = await transaction.definitionChamp.create({
          data: {
            typeEntiteId: donnees.typeEntiteId,
            cle: donnees.cle,
            libelle: donnees.libelle,
            typeDonnee: donnees.typeDonnee,
            obligatoire: donnees.obligatoire ?? false,
            estUnique: donnees.estUnique ?? false,
            multiple: donnees.multiple ?? false,
            options: donnees.options ?? Prisma.DbNull,
            ordre: await this.prochainOrdre(transaction.definitionChamp, {
              typeEntiteId: donnees.typeEntiteId,
            }),
          },
        });

        await this.tracer(transaction, auteurId, 'referentiel.champ.creer', {
          cibleId: champ.id,
          apres: { cle: champ.cle, typeDonnee: champ.typeDonnee },
        });

        return champ;
      }),
    );

    return this.presenterChamp(cree);
  }

  async modifierChamp(
    auteurId: string,
    id: string,
    donnees: ModificationChampDto,
  ): Promise<DefinitionChampDto> {
    const avant = await this.prisma.definitionChamp.findUnique({
      where: { id },
    });

    if (!avant) {
      throw new NotFoundException('champ inconnu');
    }

    this.verifierCoherenceChamp(avant.typeDonnee, {
      estUnique: donnees.estUnique ?? avant.estUnique,
      multiple: donnees.multiple ?? avant.multiple,
      options: donnees.options ?? this.lireOptions(avant.options) ?? undefined,
    });

    const apres = await this.executer(() =>
      this.prisma.$transaction(async (transaction) => {
        const champ = await transaction.definitionChamp.update({
          where: { id },
          data: {
            ...donnees,
            ...(donnees.options ? { options: donnees.options } : {}),
          },
        });

        await this.tracer(transaction, auteurId, 'referentiel.champ.modifier', {
          cibleId: id,
          avant: { libelle: avant.libelle, estUnique: avant.estUnique },
          apres: { libelle: champ.libelle, estUnique: champ.estUnique },
        });

        return champ;
      }),
    );

    return this.presenterChamp(apres);
  }

  async supprimerChamp(auteurId: string, id: string): Promise<void> {
    const champ = await this.prisma.definitionChamp.findUnique({
      where: { id },
      include: { typeEntite: true },
    });

    if (!champ) {
      throw new NotFoundException('champ inconnu');
    }

    // Un gabarit qui cite un champ disparu produirait des libellés troués sur
    // toutes les fiches du type.
    if (extraireCles(champ.typeEntite.modeleLibelle).includes(champ.cle)) {
      throw new ConflictException(
        `le gabarit de libellé du type cite « ${champ.cle} » — le corriger d'abord`,
      );
    }

    await this.executer(() =>
      this.prisma.$transaction(async (transaction) => {
        await transaction.definitionChamp.delete({ where: { id } });
        await this.tracer(
          transaction,
          auteurId,
          'referentiel.champ.supprimer',
          { cibleId: id, avant: { cle: champ.cle } },
        );
      }),
    );
  }

  async ordonnerChamps(
    auteurId: string,
    typeEntiteId: string,
    ids: string[],
  ): Promise<void> {
    const existants = await this.prisma.definitionChamp.findMany({
      where: { typeEntiteId },
      select: { id: true },
    });

    this.verifierJeuComplet(ids, existants);

    await this.prisma.$transaction(async (transaction) => {
      await Promise.all(
        ids.map((id, rang) =>
          transaction.definitionChamp.update({
            where: { id },
            data: { ordre: rang },
          }),
        ),
      );

      await this.tracer(transaction, auteurId, 'referentiel.champ.ordonner', {
        cibleId: typeEntiteId,
        apres: { ids },
      });
    });
  }

  // ─────────────────────────── Types de liens ───────────────────────────

  async creerTypeLien(
    auteurId: string,
    donnees: CreationTypeLienDto,
  ): Promise<TypeLienDto> {
    await Promise.all([
      this.chargerTypeEntite(donnees.typeEntiteSourceId),
      this.chargerTypeEntite(donnees.typeEntiteCibleId),
    ]);

    const cree = await this.executer(() =>
      this.prisma.$transaction(async (transaction) => {
        const lien = await transaction.typeLien.create({
          data: {
            ...donnees,
            multiple: donnees.multiple ?? true,
            ordre: await this.prochainOrdre(transaction.typeLien),
          },
        });

        await this.tracer(
          transaction,
          auteurId,
          'referentiel.type_lien.creer',
          {
            cibleId: lien.id,
            apres: { code: lien.code, libelle: lien.libelle },
          },
        );

        return lien;
      }),
    );

    return this.presenterTypeLien(cree);
  }

  async modifierTypeLien(
    auteurId: string,
    id: string,
    donnees: ModificationTypeLienDto,
  ): Promise<TypeLienDto> {
    const avant = await this.prisma.typeLien.findUnique({ where: { id } });

    if (!avant) {
      throw new NotFoundException('type de lien inconnu');
    }

    // Les contraintes de domaine ne se modifient pas : des liens déjà posés les
    // respectent, et les changer les invaliderait rétroactivement. Créer un
    // autre type de lien est la voie prévue.

    const apres = await this.executer(() =>
      this.prisma.$transaction(async (transaction) => {
        const lien = await transaction.typeLien.update({
          where: { id },
          data: donnees,
        });

        await this.tracer(
          transaction,
          auteurId,
          'referentiel.type_lien.modifier',
          {
            cibleId: id,
            avant: {
              libelle: avant.libelle,
              libelleInverse: avant.libelleInverse,
            },
            apres: {
              libelle: lien.libelle,
              libelleInverse: lien.libelleInverse,
            },
          },
        );

        return lien;
      }),
    );

    return this.presenterTypeLien(apres);
  }

  async supprimerTypeLien(auteurId: string, id: string): Promise<void> {
    const lien = await this.prisma.typeLien.findUnique({ where: { id } });

    if (!lien) {
      throw new NotFoundException('type de lien inconnu');
    }

    await this.executer(() =>
      this.prisma.$transaction(async (transaction) => {
        await transaction.typeLien.delete({ where: { id } });
        await this.tracer(
          transaction,
          auteurId,
          'referentiel.type_lien.supprimer',
          { cibleId: id, avant: { code: lien.code } },
        );
      }),
    );
  }

  // ───────────────────────────── Onglets ─────────────────────────────

  async creerOnglet(
    auteurId: string,
    donnees: CreationOngletDto,
  ): Promise<OngletDto> {
    await this.chargerTypeEntite(donnees.typeEntiteId);

    const cree = await this.executer(() =>
      this.prisma.$transaction(async (transaction) => {
        const onglet = await transaction.onglet.create({
          data: {
            ...donnees,
            ordre: await this.prochainOrdre(transaction.onglet, {
              typeEntiteId: donnees.typeEntiteId,
            }),
          },
          include: { typesLiens: true },
        });

        await this.tracer(transaction, auteurId, 'referentiel.onglet.creer', {
          cibleId: onglet.id,
          apres: { libelle: onglet.libelle },
        });

        return onglet;
      }),
    );

    return this.presenterOnglet(cree);
  }

  async modifierOnglet(
    auteurId: string,
    id: string,
    donnees: ModificationOngletDto,
  ): Promise<OngletDto> {
    await this.chargerOnglet(id);

    const apres = await this.prisma.$transaction(async (transaction) => {
      const onglet = await transaction.onglet.update({
        where: { id },
        data: donnees,
        include: { typesLiens: { orderBy: { ordre: 'asc' } } },
      });

      await this.tracer(transaction, auteurId, 'referentiel.onglet.modifier', {
        cibleId: id,
        apres: { libelle: onglet.libelle },
      });

      return onglet;
    });

    return this.presenterOnglet(apres);
  }

  async supprimerOnglet(auteurId: string, id: string): Promise<void> {
    await this.chargerOnglet(id);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.onglet.delete({ where: { id } });
      await this.tracer(transaction, auteurId, 'referentiel.onglet.supprimer', {
        cibleId: id,
      });
    });
  }

  async ordonnerOnglets(
    auteurId: string,
    typeEntiteId: string,
    ids: string[],
  ): Promise<void> {
    const existants = await this.prisma.onglet.findMany({
      where: { typeEntiteId },
      select: { id: true },
    });

    this.verifierJeuComplet(ids, existants);

    await this.prisma.$transaction(async (transaction) => {
      await Promise.all(
        ids.map((id, rang) =>
          transaction.onglet.update({ where: { id }, data: { ordre: rang } }),
        ),
      );

      await this.tracer(transaction, auteurId, 'referentiel.onglet.ordonner', {
        cibleId: typeEntiteId,
        apres: { ids },
      });
    });
  }

  /**
   * Remplace la composition d'un onglet.
   *
   * C'est ici que se joue la règle du sens : un onglet appartient à un type
   * d'entité, et n'affiche un type de lien que du côté où ce type d'entité se
   * trouve. L'onglet Membres du groupe montre le côté **inverse** de « membre
   * de », qui va de la personne vers le groupe.
   */
  async composerOnglet(
    auteurId: string,
    id: string,
    donnees: CompositionOngletDto,
  ): Promise<OngletDto> {
    const onglet = await this.chargerOnglet(id);

    const doublon = donnees.typesLiens.find(
      (entree, rang) =>
        donnees.typesLiens.findIndex(
          (autre) =>
            autre.typeLienId === entree.typeLienId &&
            autre.sens === entree.sens,
        ) !== rang,
    );

    if (doublon) {
      throw new BadRequestException(
        'le même type de lien est cité deux fois dans le même sens',
      );
    }

    const liens = await this.prisma.typeLien.findMany({
      where: {
        id: { in: donnees.typesLiens.map((entree) => entree.typeLienId) },
      },
    });

    for (const entree of donnees.typesLiens) {
      const lien = liens.find((candidat) => candidat.id === entree.typeLienId);

      if (!lien) {
        throw new BadRequestException('type de lien inconnu');
      }

      const attendu =
        entree.sens === SensLien.direct
          ? lien.typeEntiteSourceId
          : lien.typeEntiteCibleId;

      if (attendu !== onglet.typeEntiteId) {
        const cote = entree.sens === SensLien.direct ? 'source' : 'cible';
        throw new BadRequestException(
          `« ${lien.libelle} » en sens ${entree.sens} : le type d'entité de l'onglet n'est pas le type ${cote} de ce lien`,
        );
      }
    }

    const apres = await this.prisma.$transaction(async (transaction) => {
      await transaction.ongletTypeLien.deleteMany({ where: { ongletId: id } });

      await transaction.ongletTypeLien.createMany({
        data: donnees.typesLiens.map((entree, rang) => ({
          ongletId: id,
          typeLienId: entree.typeLienId,
          sens: entree.sens,
          ordre: rang,
        })),
      });

      await this.tracer(transaction, auteurId, 'referentiel.onglet.composer', {
        cibleId: id,
        apres: {
          typesLiens: donnees.typesLiens.map((entree) => ({
            typeLienId: entree.typeLienId,
            sens: entree.sens,
          })),
        },
      });

      return transaction.onglet.findUniqueOrThrow({
        where: { id },
        include: { typesLiens: { orderBy: { ordre: 'asc' } } },
      });
    });

    return this.presenterOnglet(apres);
  }

  // ───────────────────────────── Interne ─────────────────────────────

  private async chargerTypeEntite(id: string): Promise<TypeEntiteComplet> {
    const type = await this.prisma.typeEntite.findUnique({
      where: { id },
      include: {
        champs: { orderBy: { ordre: 'asc' } },
        onglets: {
          orderBy: { ordre: 'asc' },
          include: { typesLiens: { orderBy: { ordre: 'asc' } } },
        },
      },
    });

    if (!type) {
      throw new NotFoundException("type d'entité inconnu");
    }

    return type;
  }

  private async chargerOnglet(id: string): Promise<OngletComplet> {
    const onglet = await this.prisma.onglet.findUnique({
      where: { id },
      include: { typesLiens: { orderBy: { ordre: 'asc' } } },
    });

    if (!onglet) {
      throw new NotFoundException('onglet inconnu');
    }

    return onglet;
  }

  private verifierCoherenceChamp(
    typeDonnee: TypeDonnee,
    donnees: {
      estUnique?: boolean;
      multiple?: boolean;
      options?: string[];
    },
  ): void {
    const estListe = typeDonnee === TypeDonnee.liste;

    if (estListe && (!donnees.options || donnees.options.length === 0)) {
      throw new BadRequestException(
        'une liste fermée doit énoncer ses valeurs autorisées',
      );
    }

    if (!estListe && donnees.options && donnees.options.length > 0) {
      throw new BadRequestException(
        `des valeurs autorisées n'ont de sens que pour le type « liste », pas « ${typeDonnee} »`,
      );
    }

    if (donnees.estUnique && donnees.multiple) {
      throw new BadRequestException(
        'un champ ne peut pas être à la fois unique et multiple',
      );
    }

    if (donnees.estUnique && typeDonnee === TypeDonnee.fichier) {
      throw new BadRequestException(
        "l'unicité ne s'applique pas à un fichier — deux photos identiques ne sont pas une contradiction",
      );
    }
  }

  private verifierJeuComplet(ids: string[], existants: { id: string }[]): void {
    const attendus = new Set(existants.map((element) => element.id));

    if (ids.length !== attendus.size || ids.some((id) => !attendus.has(id))) {
      throw new BadRequestException(
        `réordonnancement partiel : ${attendus.size} éléments attendus, ${ids.length} reçus`,
      );
    }
  }

  private async prochainOrdre(
    table: { aggregate: (arguments_: unknown) => Promise<unknown> },
    where?: Record<string, unknown>,
  ): Promise<number> {
    const resultat = (await table.aggregate({
      where,
      _max: { ordre: true },
    })) as { _max: { ordre: number | null } };

    return (resultat._max.ordre ?? -1) + 1;
  }

  /** Traduit les violations de contrainte en réponses lisibles. */
  private async executer<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (erreur) {
      if (erreur instanceof Prisma.PrismaClientKnownRequestError) {
        if (erreur.code === 'P2002') {
          throw new ConflictException('code déjà utilisé');
        }
        if (erreur.code === 'P2003' || erreur.code === 'P2014') {
          throw new ConflictException(
            'élément encore utilisé — le référentiel ne se vide pas sous les données qui en dépendent',
          );
        }
      }
      throw erreur;
    }
  }

  private tracer(
    transaction: Prisma.TransactionClient,
    auteurId: string,
    action: string,
    details: {
      cibleId?: string;
      avant?: Prisma.InputJsonValue;
      apres?: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    return this.audit.tracer(
      {
        agentId: auteurId,
        action,
        cibleTable: 'referentiel',
        cibleId: details.cibleId ?? null,
        avant: details.avant,
        apres: details.apres,
      },
      transaction,
    );
  }

  private lireOptions(brut: Prisma.JsonValue | null): string[] | null {
    if (!Array.isArray(brut)) {
      return null;
    }

    return brut.filter(
      (valeur): valeur is string => typeof valeur === 'string',
    );
  }

  private presenterChamp(champ: DefinitionChamp): DefinitionChampDto {
    return {
      id: champ.id,
      typeEntiteId: champ.typeEntiteId,
      cle: champ.cle,
      libelle: champ.libelle,
      typeDonnee: champ.typeDonnee,
      obligatoire: champ.obligatoire,
      estUnique: champ.estUnique,
      multiple: champ.multiple,
      options: this.lireOptions(champ.options),
      ordre: champ.ordre,
    };
  }

  private presenterOnglet(onglet: OngletComplet): OngletDto {
    return {
      id: onglet.id,
      typeEntiteId: onglet.typeEntiteId,
      libelle: onglet.libelle,
      ordre: onglet.ordre,
      typesLiens: onglet.typesLiens
        .slice()
        .sort((a, b) => a.ordre - b.ordre)
        .map((entree) => ({
          typeLienId: entree.typeLienId,
          sens: entree.sens,
          ordre: entree.ordre,
        })),
    };
  }

  private presenterTypeEntite(type: TypeEntiteComplet): TypeEntiteDto {
    return {
      id: type.id,
      code: type.code,
      libelle: type.libelle,
      libellePluriel: type.libellePluriel,
      icone: type.icone,
      modeleLibelle: type.modeleLibelle,
      ordre: type.ordre,
      champs: type.champs.map((champ) => this.presenterChamp(champ)),
      onglets: type.onglets.map((onglet) => this.presenterOnglet(onglet)),
    };
  }

  private presenterTypeLien(lien: TypeLien): TypeLienDto {
    return {
      id: lien.id,
      code: lien.code,
      libelle: lien.libelle,
      libelleInverse: lien.libelleInverse,
      typeEntiteSourceId: lien.typeEntiteSourceId,
      typeEntiteCibleId: lien.typeEntiteCibleId,
      multiple: lien.multiple,
      ordre: lien.ordre,
    };
  }
}
