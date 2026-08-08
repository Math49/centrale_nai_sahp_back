import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EtatEntite,
  EtatFait,
  NatureFait,
  Prisma,
  Visibilite,
  type DefinitionChamp,
  type Entite,
  type Fait,
  type TypeEntite,
  type TypeLien,
} from '@prisma/client';

import { JournalAuditService } from '../journal/journal-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ChampSaisiDto,
  CreationEntiteDto,
  FicheEntiteDto,
  LienSaisiDto,
  ModificationEntiteDto,
  SuggestionDoublonDto,
} from './entites.dto';
import type {
  ChampDeFicheDto,
  EntiteResumeeDto,
  LienDeFicheDto,
} from './entites.dto';
import { UniciteService } from './unicite.service';
import { ValidationDynamiqueService } from './validation-dynamique.service';

/** Provenance résolue : ce que chaque fait finit par porter. */
export interface Provenance {
  source: string;
  fiabilite: number;
  dateConstatation: Date;
  visibilite: Visibilite;
}

interface FiltresAnnuaire {
  typeEntiteId?: string;
  q?: string;
  etat?: EtatEntite;
  limite: number;
  decalage: number;
}

type TypeAvecChamps = TypeEntite & { champs: DefinitionChamp[] };

@Injectable()
export class EntitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: ValidationDynamiqueService,
    private readonly unicite: UniciteService,
    private readonly audit: JournalAuditService,
  ) {}

  // ─────────────────────────── Création ───────────────────────────

  async creer(
    agentId: string,
    donnees: CreationEntiteDto,
  ): Promise<FicheEntiteDto> {
    const type = await this.chargerType(donnees.typeEntiteId);

    const champsSaisis = donnees.champs ?? [];
    const liensSaisis = donnees.liens ?? [];

    this.validation.verifierObligatoires(
      type.champs,
      champsSaisis.map((champ) => champ.definitionChampId),
    );

    const champsPrepares = champsSaisis.map((saisi) =>
      this.preparerChamp(type, saisi, donnees),
    );

    const liensPrepares = await this.preparerLiens(type, liensSaisis, donnees);

    const id = await this.executer(
      { typeEntiteId: type.id, champs: champsPrepares },
      () =>
        this.prisma.$transaction(async (transaction) => {
          const entite = await transaction.entite.create({
            data: {
              typeEntiteId: type.id,
              // Le trigger de projection écrira le vrai libellé dès le premier
              // fait ; l'appel explicite plus bas couvre l'entité sans fait.
              libelle: '',
              note: donnees.note,
              visibilite: donnees.visibilite ?? Visibilite.public,
              creePar: agentId,
            },
          });

          for (const champ of champsPrepares) {
            await transaction.fait.create({
              data: {
                sujetId: entite.id,
                nature: NatureFait.champ,
                definitionChampId: champ.definitionChampId,
                valeur: champ.valeur,
                source: champ.provenance.source,
                fiabilite: champ.provenance.fiabilite,
                dateConstatation: champ.provenance.dateConstatation,
                visibilite: champ.provenance.visibilite,
                creePar: agentId,
              },
            });
          }

          for (const lien of liensPrepares) {
            await transaction.fait.create({
              data: {
                sujetId: entite.id,
                nature: NatureFait.lien,
                typeLienId: lien.typeLienId,
                cibleId: lien.cibleId,
                source: lien.provenance.source,
                fiabilite: lien.provenance.fiabilite,
                dateConstatation: lien.provenance.dateConstatation,
                visibilite: lien.provenance.visibilite,
                creePar: agentId,
              },
            });
          }

          // Une entité sans aucun fait n'a jamais déclenché le trigger.
          await transaction.$executeRaw`SELECT projeter_entite(${entite.id}::uuid)`;

          await this.audit.tracer(
            {
              agentId,
              action: 'entite.creer',
              cibleTable: 'entite',
              cibleId: entite.id,
              apres: {
                typeCode: type.code,
                champs: champsPrepares.length,
                liens: liensPrepares.length,
              },
            },
            transaction,
          );

          return entite.id;
        }),
    );

    return this.lire(id);
  }

  // ─────────────────────────── Lecture ───────────────────────────

  async lire(id: string): Promise<FicheEntiteDto> {
    const entite = await this.prisma.entite.findUnique({
      where: { id },
      include: {
        typeEntite: { include: { champs: { orderBy: { ordre: 'asc' } } } },
      },
    });

    if (!entite) {
      throw new NotFoundException('entité inconnue');
    }

    const [faitsSujet, faitsCible] = await Promise.all([
      this.prisma.fait.findMany({
        where: { sujetId: id, etat: EtatFait.actif },
        include: { cible: { include: { typeEntite: true } }, typeLien: true },
        orderBy: [{ fiabilite: 'desc' }, { dateConstatation: 'desc' }],
      }),
      this.prisma.fait.findMany({
        where: { cibleId: id, etat: EtatFait.actif },
        include: { sujet: { include: { typeEntite: true } }, typeLien: true },
        orderBy: [{ fiabilite: 'desc' }, { dateConstatation: 'desc' }],
      }),
    ]);

    const valeurs = (entite.valeurs ?? {}) as Record<string, unknown>;

    // Un champ non renseigné reste affiché : l'absence d'information est une
    // information. La liste vient donc du référentiel, pas des faits.
    const champs: ChampDeFicheDto[] = entite.typeEntite.champs.map(
      (definition) => {
        const faits = faitsSujet.filter(
          (fait) =>
            fait.nature === NatureFait.champ &&
            fait.definitionChampId === definition.id,
        );

        const sources = new Set(
          faits.map((fait) => fait.source.trim().toLowerCase()),
        );

        return {
          definitionChampId: definition.id,
          cle: definition.cle,
          libelle: definition.libelle,
          typeDonnee: definition.typeDonnee,
          multiple: definition.multiple,
          valeur: valeurs[definition.cle] ?? null,
          faits: faits.map((fait) => this.presenterFaitDeChamp(fait)),
          multiSources: sources.size > 1,
        };
      },
    );

    const liens: LienDeFicheDto[] = [
      ...faitsSujet
        .filter((fait) => fait.nature === NatureFait.lien && fait.cible)
        .map((fait) => ({
          faitId: fait.id,
          sens: 'direct' as const,
          typeLienId: fait.typeLienId!,
          libelle: fait.typeLien!.libelle,
          autreEntite: {
            id: fait.cible!.id,
            libelle: fait.cible!.libelle,
            typeCode: fait.cible!.typeEntite.code,
          },
          source: fait.source,
          fiabilite: fait.fiabilite,
          dateConstatation: this.enDate(fait.dateConstatation),
          visibilite: fait.visibilite,
        })),
      ...faitsCible.map((fait) => ({
        faitId: fait.id,
        sens: 'inverse' as const,
        typeLienId: fait.typeLienId!,
        libelle: fait.typeLien!.libelleInverse,
        autreEntite: {
          id: fait.sujet.id,
          libelle: fait.sujet.libelle,
          typeCode: fait.sujet.typeEntite.code,
        },
        source: fait.source,
        fiabilite: fait.fiabilite,
        dateConstatation: this.enDate(fait.dateConstatation),
        visibilite: fait.visibilite,
      })),
    ];

    return {
      ...this.resumer(entite, entite.typeEntite.code),
      typeLibelle: entite.typeEntite.libelle,
      valeurs,
      note: entite.note,
      champs,
      liens,
      creeLe: entite.creeLe.toISOString(),
      fusionneeVersId: entite.fusionneeVersId,
    };
  }

  async lister(filtres: FiltresAnnuaire): Promise<EntiteResumeeDto[]> {
    const entites = await this.prisma.entite.findMany({
      where: {
        typeEntiteId: filtres.typeEntiteId,
        etat: filtres.etat,
        fusionneeVersId: null,
        ...(filtres.q
          ? { libelle: { contains: filtres.q, mode: 'insensitive' } }
          : {}),
      },
      include: { typeEntite: true },
      orderBy: { modifieLe: 'desc' },
      take: filtres.limite,
      skip: filtres.decalage,
    });

    return entites.map((entite) =>
      this.resumer(entite, entite.typeEntite.code),
    );
  }

  /**
   * Détection de doublons à la frappe.
   *
   * Deux signaux distincts : la similarité trigramme du libellé, floue, et
   * l'identité d'une valeur unique du type, qui elle ne laisse aucun doute.
   */
  async similaires(
    q: string,
    typeEntiteId?: string,
  ): Promise<SuggestionDoublonDto[]> {
    const recherche = q.trim();

    if (recherche.length < 2) {
      return [];
    }

    const candidats = await this.prisma.$queryRaw<
      { id: string; libelle: string; type_code: string; proximite: number }[]
    >`
      SELECT e.id, e.libelle, te.code AS type_code,
             similarity(e.libelle, ${recherche}) AS proximite
        FROM entite e
        JOIN type_entite te ON te.id = e.type_entite_id
       WHERE e.fusionnee_vers_id IS NULL
         AND (${typeEntiteId}::uuid IS NULL OR e.type_entite_id = ${typeEntiteId}::uuid)
         AND (e.libelle ILIKE '%' || ${recherche} || '%'
              OR similarity(e.libelle, ${recherche}) > 0.25)
       ORDER BY proximite DESC, e.libelle ASC
       LIMIT 8
    `;

    const identiques = await this.prisma.$queryRaw<{ entite_id: string }[]>`
      SELECT vu.entite_id
        FROM valeur_unique vu
       WHERE vu.valeur_normalisee = normaliser_valeur(${recherche})
         AND (${typeEntiteId}::uuid IS NULL OR vu.type_entite_id = ${typeEntiteId}::uuid)
    `;

    const surs = new Set(identiques.map((ligne) => ligne.entite_id));

    return candidats.map((candidat) => ({
      id: candidat.id,
      libelle: candidat.libelle,
      typeCode: candidat.type_code,
      proximite: Number(candidat.proximite),
      valeurUniqueIdentique: surs.has(candidat.id),
    }));
  }

  // ─────────────────────────── Écriture ───────────────────────────

  async modifier(
    agentId: string,
    id: string,
    donnees: ModificationEntiteDto,
  ): Promise<FicheEntiteDto> {
    const avant = await this.charger(id);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.entite.update({ where: { id }, data: donnees });

      await this.audit.tracer(
        {
          agentId,
          action: 'entite.modifier',
          cibleTable: 'entite',
          cibleId: id,
          avant: { visibilite: avant.visibilite },
          apres: { visibilite: donnees.visibilite ?? avant.visibilite },
        },
        transaction,
      );
    });

    return this.lire(id);
  }

  /**
   * Archivage — pas de suppression.
   *
   * L'entité sort des écrans courants mais reste consultable, et ses faits
   * restent intacts : rien n'est jamais supprimé.
   */
  async changerEtat(
    agentId: string,
    id: string,
    etat: EtatEntite,
  ): Promise<FicheEntiteDto> {
    const avant = await this.charger(id);

    if (avant.etat === etat) {
      throw new ConflictException(
        etat === EtatEntite.archive ? 'déjà archivée' : 'déjà active',
      );
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.entite.update({ where: { id }, data: { etat } });

      await this.audit.tracer(
        {
          agentId,
          action:
            etat === EtatEntite.archive
              ? 'entite.archiver'
              : 'entite.desarchiver',
          cibleTable: 'entite',
          cibleId: id,
          avant: { etat: avant.etat },
          apres: { etat },
        },
        transaction,
      );
    });

    return this.lire(id);
  }

  // ─────────────────────────── Interne ───────────────────────────

  private async chargerType(id: string): Promise<TypeAvecChamps> {
    const type = await this.prisma.typeEntite.findUnique({
      where: { id },
      include: { champs: { orderBy: { ordre: 'asc' } } },
    });

    if (!type) {
      throw new BadRequestException("type d'entité inconnu");
    }

    return type;
  }

  private async charger(id: string): Promise<Entite> {
    const entite = await this.prisma.entite.findUnique({ where: { id } });

    if (!entite) {
      throw new NotFoundException('entité inconnue');
    }

    return entite;
  }

  private preparerChamp(
    type: TypeAvecChamps,
    saisi: ChampSaisiDto,
    defauts: CreationEntiteDto,
  ): {
    definitionChampId: string;
    valeur: Prisma.InputJsonValue;
    provenance: Provenance;
  } {
    const definition = type.champs.find(
      (champ) => champ.id === saisi.definitionChampId,
    );

    if (!definition) {
      throw new BadRequestException(`champ étranger au type ${type.libelle}`);
    }

    return {
      definitionChampId: definition.id,
      valeur: this.validation.valider(definition, saisi.valeur),
      provenance: this.resoudreProvenance(saisi, defauts),
    };
  }

  private async preparerLiens(
    type: TypeAvecChamps,
    saisis: LienSaisiDto[],
    defauts: CreationEntiteDto,
  ): Promise<
    { typeLienId: string; cibleId: string; provenance: Provenance }[]
  > {
    if (saisis.length === 0) {
      return [];
    }

    const [typesLiens, cibles] = await Promise.all([
      this.prisma.typeLien.findMany({
        where: { id: { in: saisis.map((lien) => lien.typeLienId) } },
      }),
      this.prisma.entite.findMany({
        where: { id: { in: saisis.map((lien) => lien.cibleId) } },
      }),
    ]);

    return saisis.map((saisi) => {
      const typeLien = typesLiens.find(
        (candidat) => candidat.id === saisi.typeLienId,
      );

      if (!typeLien) {
        throw new BadRequestException('type de lien inconnu');
      }

      const cible = cibles.find((candidat) => candidat.id === saisi.cibleId);

      if (!cible) {
        throw new BadRequestException('entité cible inconnue');
      }

      this.verifierDomaine(typeLien, type.id, cible.typeEntiteId);

      return {
        typeLienId: typeLien.id,
        cibleId: cible.id,
        provenance: this.resoudreProvenance(saisi, defauts),
      };
    });
  }

  /**
   * Contraintes de domaine du type de lien.
   *
   * « interpellé lors de » va de Personne vers Événement, et nulle part
   * ailleurs. Sans ce contrôle, le graphe se remplirait d'arêtes que les
   * filtres et les onglets ne sauraient plus placer.
   */
  private verifierDomaine(
    typeLien: TypeLien,
    typeSujetId: string,
    typeCibleId: string,
  ): void {
    if (typeLien.typeEntiteSourceId !== typeSujetId) {
      throw new BadRequestException(
        `« ${typeLien.libelle} » ne part pas de ce type d'entité`,
      );
    }

    if (typeLien.typeEntiteCibleId !== typeCibleId) {
      throw new BadRequestException(
        `« ${typeLien.libelle} » ne pointe pas vers ce type d'entité`,
      );
    }
  }

  /**
   * Résout la provenance d'un fait : ce qu'il porte en propre, sinon les
   * valeurs du bandeau de source active fournies au niveau de la requête.
   */
  private resoudreProvenance(
    saisi: {
      source?: string;
      fiabilite?: number;
      dateConstatation?: string;
      visibilite?: Visibilite;
    },
    defauts: {
      source?: string;
      fiabilite?: number;
      dateConstatation?: string;
      visibilite?: Visibilite;
    },
  ): Provenance {
    const source = saisi.source ?? defauts.source;
    const fiabilite = saisi.fiabilite ?? defauts.fiabilite;
    const dateConstatation = saisi.dateConstatation ?? defauts.dateConstatation;

    if (!source || source.trim().length === 0) {
      throw new BadRequestException('aucun fait sans source');
    }

    if (!fiabilite) {
      throw new BadRequestException('fiabilité absente');
    }

    if (!dateConstatation) {
      throw new BadRequestException('date de constatation absente');
    }

    return {
      source: source.trim(),
      fiabilite,
      dateConstatation: new Date(dateConstatation),
      visibilite: saisi.visibilite ?? defauts.visibilite ?? Visibilite.public,
    };
  }

  private presenterFaitDeChamp(fait: Fait) {
    return {
      id: fait.id,
      valeur: fait.valeur,
      source: fait.source,
      fiabilite: fait.fiabilite,
      dateConstatation: this.enDate(fait.dateConstatation),
      visibilite: fait.visibilite,
    };
  }

  private resumer(entite: Entite, typeCode: string): EntiteResumeeDto {
    return {
      id: entite.id,
      typeEntiteId: entite.typeEntiteId,
      typeCode,
      libelle: entite.libelle,
      visibilite: entite.visibilite,
      etat: entite.etat,
      modifieLe: entite.modifieLe.toISOString(),
    };
  }

  private enDate(valeur: Date): string {
    return valeur.toISOString().slice(0, 10);
  }

  /**
   * Traduit les refus venus de la base en réponses lisibles.
   *
   * C'est la base qui refuse ; l'application se contente de dire pourquoi.
   */
  private async executer<T>(
    contexte: {
      typeEntiteId: string;
      champs: { definitionChampId: string; valeur: unknown }[];
      entiteId?: string;
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

      if (message.includes('fait_coherence')) {
        throw new BadRequestException(
          'fait incohérent : un champ et un lien ne se mélangent pas',
        );
      }

      throw erreur;
    }
  }
}
