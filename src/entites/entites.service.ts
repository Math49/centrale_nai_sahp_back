import {
  BadRequestException,
  ConflictException,
  Injectable,
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

import type { AgentCourant } from '../auth/agent-courant';
import { DossiersService } from '../dossiers/dossiers.service';
import { JournalAuditService } from '../journal/journal-audit.service';
import { BusInvalidation } from '../graphe/bus-invalidation';
import { PrismaService } from '../prisma/prisma.service';
import { VisibiliteService } from '../visibilite/visibilite.service';
import type {
  ChampDeFicheDto,
  ChampSaisiDto,
  CreationEntiteDto,
  EntiteResumeeDto,
  EvenementHistoriqueDto,
  FicheEntiteDto,
  LienDeFicheDto,
  LienSaisiDto,
  ModificationEntiteDto,
  SuggestionDoublonDto,
} from './entites.dto';
import { UniciteService } from './unicite.service';
import { ValidationDynamiqueService } from './validation-dynamique.service';

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

const DELAI_ANNULATION = 60 * 60 * 1000;

const PRESEANCE: Prisma.FaitOrderByWithRelationInput[] = [
  { fiabilite: 'desc' },
  { dateConstatation: 'desc' },
  { creeLe: 'desc' },
];

@Injectable()
export class EntitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: ValidationDynamiqueService,
    private readonly unicite: UniciteService,
    private readonly visibilite: VisibiliteService,
    private readonly dossiers: DossiersService,
    private readonly audit: JournalAuditService,
    private readonly bus: BusInvalidation,
  ) {}

  async creer(
    agent: AgentCourant,
    donnees: CreationEntiteDto,
  ): Promise<FicheEntiteDto> {
    const type = await this.chargerType(donnees.typeEntiteId);

    if (donnees.visibilite !== undefined) {
      this.visibilite.verifierDroitDeClasser(agent, donnees.visibilite);
    }

    const champsSaisis = donnees.champs ?? [];
    const liensSaisis = donnees.liens ?? [];

    this.validation.verifierObligatoires(
      type.champs,
      champsSaisis.map((champ) => champ.definitionChampId),
    );

    if (donnees.dossierId) {
      await this.verifierDossier(donnees.dossierId);
    }

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

              libelle: '',
              note: donnees.note,
              visibilite: donnees.visibilite ?? Visibilite.public,
              creePar: agent.id,
            },
          });

          for (const champ of champsPrepares) {
            await transaction.fait.create({
              data: {
                sujetId: entite.id,
                nature: NatureFait.champ,
                definitionChampId: champ.definitionChampId,
                valeur: champ.valeur,
                dossierId: donnees.dossierId,
                source: champ.provenance.source,
                fiabilite: champ.provenance.fiabilite,
                dateConstatation: champ.provenance.dateConstatation,
                visibilite: champ.provenance.visibilite,
                creePar: agent.id,
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
                dossierId: donnees.dossierId,
                source: lien.provenance.source,
                fiabilite: lien.provenance.fiabilite,
                dateConstatation: lien.provenance.dateConstatation,
                visibilite: lien.provenance.visibilite,
                creePar: agent.id,
              },
            });
          }

          if (donnees.dossierId) {
            await transaction.suivi.create({
              data: {
                dossierId: donnees.dossierId,
                entiteId: entite.id,
                ajoutePar: agent.id,
              },
            });
          }

          await transaction.$executeRaw`SELECT projeter_entite(${entite.id}::uuid)`;

          await this.audit.tracer(
            {
              agentId: agent.id,
              action: 'entite.creer',
              cibleTable: 'entite',
              cibleId: entite.id,
              apres: {
                typeCode: type.code,
                champs: champsPrepares.length,
                liens: liensPrepares.length,
                dossierId: donnees.dossierId ?? null,
              },
            },
            transaction,
          );

          return entite.id;
        }),
    );

    this.bus.signaler();
    return this.lire(agent, id);
  }

  async lire(agent: AgentCourant, id: string): Promise<FicheEntiteDto> {
    const controle = await this.visibilite.entiteVisibleOuIntrouvable(
      agent,
      id,
    );

    const entite = await this.prisma.sansFiltre.entite.findUniqueOrThrow({
      where: { id: controle.id },
      include: {
        typeEntite: {
          include: {
            champs: { orderBy: { ordre: 'asc' } },
            onglets: {
              orderBy: { ordre: 'asc' },
              include: { typesLiens: { orderBy: { ordre: 'asc' } } },
            },
          },
        },
      },
    });

    const client = this.visibilite.clientPour(agent);
    const dossiers = await this.dossiers.rattachements(agent, id);

    const [faitsSujet, faitsCible] = await Promise.all([
      client.fait.findMany({
        where: { sujetId: id, etat: EtatFait.actif },
        include: { cible: { include: { typeEntite: true } }, typeLien: true },
        orderBy: PRESEANCE,
      }),
      client.fait.findMany({
        where: { cibleId: id, etat: EtatFait.actif },
        include: { sujet: { include: { typeEntite: true } }, typeLien: true },
        orderBy: PRESEANCE,
      }),
    ]);

    const champs = this.assemblerChamps(entite.typeEntite.champs, faitsSujet);

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
          visibiliteEffective: fait.visibiliteEffective,
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
        visibiliteEffective: fait.visibiliteEffective,
      })),
    ];

    const regroupes = new Set<string>();

    const onglets = entite.typeEntite.onglets.map((onglet) => {
      const appartient = (lien: LienDeFicheDto) =>
        onglet.typesLiens.some(
          (entree) =>
            entree.typeLienId === lien.typeLienId && entree.sens === lien.sens,
        );

      const contenu = liens.filter(appartient);
      contenu.forEach((lien) => regroupes.add(lien.faitId));

      return {
        id: onglet.id,
        libelle: onglet.libelle,
        ordre: onglet.ordre,

        compteur: contenu.length,
        liens: contenu,
      };
    });

    return {
      ...this.resumer(entite, entite.typeEntite.code),
      typeLibelle: entite.typeEntite.libelle,
      valeurs: Object.fromEntries(
        champs
          .filter((champ) => champ.valeur !== null)
          .map((champ) => [champ.cle, champ.valeur]),
      ),
      contenuLisible: this.visibilite.contenuDEntiteLisible(agent, entite),
      note: entite.note,
      dossiers,
      champs,
      onglets,
      liensHorsOnglet: liens.filter((lien) => !regroupes.has(lien.faitId)),
      liens,
      creeLe: entite.creeLe.toISOString(),
      fusionneeVersId: entite.fusionneeVersId,
    };
  }

  async historique(
    agent: AgentCourant,
    id: string,
  ): Promise<EvenementHistoriqueDto[]> {
    await this.visibilite.entiteVisibleOuIntrouvable(agent, id);

    const client = this.visibilite.clientPour(agent);

    const [inactifs, visibles] = await Promise.all([
      client.fait.findMany({
        where: { sujetId: id, etat: { not: EtatFait.actif } },
        include: {
          definitionChamp: true,
          typeLien: true,
          cible: true,
          auteur: true,
        },
        orderBy: { modifieLe: 'desc' },
      }),
      client.fait.findMany({ where: { sujetId: id }, select: { id: true } }),
    ]);

    const traces = await this.prisma.sansFiltre.journalAudit.findMany({
      where: {
        OR: [
          { cibleTable: 'entite', cibleId: id },
          {
            cibleTable: 'fait',
            cibleId: { in: visibles.map((fait) => fait.id) },
          },
        ],
      },
      include: { agent: true },
      orderBy: { effectueLe: 'desc' },
      take: 100,
    });

    const evenements: EvenementHistoriqueDto[] = [
      ...inactifs.map((fait) => ({
        id: fait.id,
        nature: 'fait' as const,
        libelle:
          fait.nature === NatureFait.champ
            ? `${fait.definitionChamp?.libelle ?? 'champ'} — ${fait.etat}`
            : `${fait.typeLien?.libelle ?? 'lien'} ${fait.cible?.libelle ?? ''} — ${fait.etat}`,
        source: fait.source,
        fiabilite: fait.fiabilite,
        auteur: this.nommerAuteur(fait.auteur),
        survenuLe: fait.modifieLe.toISOString(),
      })),
      ...traces.map((trace) => ({
        id: trace.id.toString(),
        nature: 'modification' as const,
        libelle: trace.action,
        source: null,
        fiabilite: null,
        auteur: this.nommerAuteur(trace.agent),
        survenuLe: trace.effectueLe.toISOString(),
      })),
    ];

    return evenements.sort((a, b) => b.survenuLe.localeCompare(a.survenuLe));
  }

  private nommerAuteur(
    agent: { prenom: string; nom: string; anonymise: boolean } | null,
  ): string | null {
    if (!agent) {
      return null;
    }

    return agent.anonymise ? 'agent supprimé' : `${agent.prenom} ${agent.nom}`;
  }

  async lister(
    agent: AgentCourant,
    filtres: FiltresAnnuaire,
  ): Promise<EntiteResumeeDto[]> {
    const client = this.visibilite.clientPour(agent);

    const entites = await client.entite.findMany({
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

  async similaires(
    agent: AgentCourant,
    q: string,
    typeEntiteId?: string,
  ): Promise<SuggestionDoublonDto[]> {
    const recherche = q.trim();

    if (recherche.length < 2) {
      return [];
    }

    const contexte = this.visibilite.contexte(agent);
    const ouvert = contexte.superAdmin || contexte.derogationPrive;
    const habilitees = [...contexte.entitesHabilitees];

    const candidats = await this.prisma.sansFiltre.$queryRaw<
      { id: string; libelle: string; type_code: string; proximite: number }[]
    >`
      SELECT e.id, e.libelle, te.code AS type_code,
             similarity(e.libelle, ${recherche}) AS proximite
        FROM entite e
        JOIN type_entite te ON te.id = e.type_entite_id
       WHERE e.fusionnee_vers_id IS NULL
         AND (${typeEntiteId}::uuid IS NULL OR e.type_entite_id = ${typeEntiteId}::uuid)
         AND (${ouvert}
              OR e.visibilite <> 'prive'
              OR e.id = ANY(${habilitees}::uuid[]))
         AND (e.libelle ILIKE '%' || ${recherche} || '%'
              OR similarity(e.libelle, ${recherche}) > 0.25)
       ORDER BY proximite DESC, e.libelle ASC
       LIMIT 8
    `;

    const identiques = await this.prisma.sansFiltre.$queryRaw<
      { entite_id: string }[]
    >`
      SELECT vu.entite_id
        FROM valeur_unique vu
        JOIN entite e ON e.id = vu.entite_id
       WHERE vu.valeur_normalisee = normaliser_valeur(${recherche})
         AND (${typeEntiteId}::uuid IS NULL OR vu.type_entite_id = ${typeEntiteId}::uuid)
         AND (${ouvert}
              OR e.visibilite <> 'prive'
              OR e.id = ANY(${habilitees}::uuid[]))
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

  async modifier(
    agent: AgentCourant,
    id: string,
    donnees: ModificationEntiteDto,
  ): Promise<FicheEntiteDto> {
    const avant = await this.visibilite.entiteVisibleOuIntrouvable(agent, id);

    if (donnees.visibilite !== undefined) {
      this.visibilite.verifierDroitDeClasser(agent, donnees.visibilite);
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.entite.update({ where: { id }, data: donnees });

      await this.audit.tracer(
        {
          agentId: agent.id,
          action: 'entite.modifier',
          cibleTable: 'entite',
          cibleId: id,
          avant: { visibilite: avant.visibilite },
          apres: { visibilite: donnees.visibilite ?? avant.visibilite },
        },
        transaction,
      );
    });

    this.bus.signaler();
    return this.lire(agent, id);
  }

  async fusionner(
    agent: AgentCourant,
    id: string,
    versId: string,
  ): Promise<FicheEntiteDto> {
    if (id === versId) {
      throw new BadRequestException(
        'une entité ne fusionne pas avec elle-même',
      );
    }

    const [absorbee, conservee] = await Promise.all([
      this.visibilite.entiteVisibleOuIntrouvable(agent, id),
      this.visibilite.entiteVisibleOuIntrouvable(agent, versId),
    ]);

    if (absorbee.typeEntiteId !== conservee.typeEntiteId) {
      throw new ConflictException(
        'deux entités de types différents ne sont pas des doublons',
      );
    }

    const etat = await this.prisma.sansFiltre.entite.findUniqueOrThrow({
      where: { id },
      select: { fusionneeVersId: true },
    });

    if (etat.fusionneeVersId) {
      throw new ConflictException('cette entité a déjà été fusionnée');
    }

    await this.executer(
      { typeEntiteId: conservee.typeEntiteId, entiteId: versId, champs: [] },
      () =>
        this.prisma.$transaction(async (transaction) => {
          const entreLesDeux = await transaction.fait.updateMany({
            where: {
              nature: NatureFait.lien,
              etat: EtatFait.actif,
              OR: [
                { sujetId: id, cibleId: versId },
                { sujetId: versId, cibleId: id },
              ],
            },
            data: { etat: EtatFait.infirme, modifiePar: agent.id },
          });

          await transaction.fait.updateMany({
            where: { sujetId: id },
            data: { sujetId: versId },
          });
          await transaction.fait.updateMany({
            where: { cibleId: id },
            data: { cibleId: versId },
          });

          await transaction.fichier.updateMany({
            where: { entiteId: id },
            data: { entiteId: versId },
          });
          await transaction.dossier.updateMany({
            where: { entitePivotId: id },
            data: { entitePivotId: versId },
          });

          await this.reporterSuivis(transaction, id, versId);
          await this.reporterHabilitations(transaction, id, versId);

          await transaction.positionGraphe.deleteMany({
            where: { entiteId: id },
          });

          await transaction.entite.update({
            where: { id },
            data: { fusionneeVersId: versId, etat: EtatEntite.archive },
          });

          await this.audit.tracer(
            {
              agentId: agent.id,
              action: 'entite.fusionner',
              cibleTable: 'entite',
              cibleId: id,
              avant: { etat: EtatEntite.actif, fusionneeVersId: null },
              apres: {
                etat: EtatEntite.archive,
                fusionneeVersId: versId,
                liensEntreDoublonsInfirmes: entreLesDeux.count,
              },
            },
            transaction,
          );
        }),
    );

    this.bus.signaler();
    return this.lire(agent, versId);
  }

  private async reporterSuivis(
    transaction: Prisma.TransactionClient,
    absorbee: string,
    conservee: string,
  ): Promise<void> {
    const suivis = await transaction.suivi.findMany({
      where: { entiteId: absorbee },
    });

    for (const suivi of suivis) {
      await transaction.suivi.upsert({
        where: {
          dossierId_entiteId: {
            dossierId: suivi.dossierId,
            entiteId: conservee,
          },
        },
        create: {
          dossierId: suivi.dossierId,
          entiteId: conservee,
          ajoutePar: suivi.ajoutePar,
        },
        update: {},
      });
    }

    await transaction.suivi.deleteMany({ where: { entiteId: absorbee } });
  }

  private async reporterHabilitations(
    transaction: Prisma.TransactionClient,
    absorbee: string,
    conservee: string,
  ): Promise<void> {
    const habilitations = await transaction.habilitationEntite.findMany({
      where: { entiteId: absorbee },
    });

    for (const habilitation of habilitations) {
      await transaction.habilitationEntite.upsert({
        where: {
          entiteId_agentId: {
            entiteId: conservee,
            agentId: habilitation.agentId,
          },
        },
        create: {
          entiteId: conservee,
          agentId: habilitation.agentId,
          accordePar: habilitation.accordePar,
        },
        update: {},
      });
    }

    await transaction.habilitationEntite.deleteMany({
      where: { entiteId: absorbee },
    });
  }

  async changerEtat(
    agent: AgentCourant,
    id: string,
    etat: EtatEntite,
  ): Promise<FicheEntiteDto> {
    await this.visibilite.entiteVisibleOuIntrouvable(agent, id);

    const avant = await this.prisma.sansFiltre.entite.findUniqueOrThrow({
      where: { id },
    });

    if (avant.etat === etat) {
      throw new ConflictException(
        etat === EtatEntite.archive ? 'déjà archivée' : 'déjà active',
      );
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.entite.update({ where: { id }, data: { etat } });

      await this.audit.tracer(
        {
          agentId: agent.id,
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

    this.bus.signaler();
    return this.lire(agent, id);
  }

  async annulerCreation(agent: AgentCourant, id: string): Promise<void> {
    await this.visibilite.entiteVisibleOuIntrouvable(agent, id);

    const entite = await this.prisma.sansFiltre.entite.findUniqueOrThrow({
      where: { id },
    });

    if (entite.creePar !== agent.id) {
      throw new ConflictException(
        'seule la saisie qu’on vient de faire soi-même s’annule — sinon, archiver',
      );
    }

    if (Date.now() - entite.creeLe.getTime() > DELAI_ANNULATION) {
      throw new ConflictException(
        'saisie trop ancienne pour être annulée — l’archiver',
      );
    }

    const [referencesEntrantes, fichiers, dossiers] = await Promise.all([
      this.prisma.sansFiltre.fait.count({
        where: { cibleId: id, sujetId: { not: id } },
      }),
      this.prisma.sansFiltre.fichier.count({ where: { entiteId: id } }),
      this.prisma.sansFiltre.dossier.count({ where: { entitePivotId: id } }),
    ]);

    if (referencesEntrantes > 0) {
      throw new ConflictException(
        'déjà désignée par un autre fait — l’archiver plutôt que l’annuler',
      );
    }

    if (fichiers > 0 || dossiers > 0) {
      throw new ConflictException(
        'des fichiers ou un dossier s’y rattachent — l’archiver',
      );
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.fait.deleteMany({ where: { sujetId: id } });
      await transaction.entite.delete({ where: { id } });

      await this.audit.tracer(
        {
          agentId: agent.id,
          action: 'entite.annuler_creation',
          cibleTable: 'entite',
          cibleId: id,
          avant: { libelle: entite.libelle, typeEntiteId: entite.typeEntiteId },
        },
        transaction,
      );
    });
  }

  private assemblerChamps(
    definitions: DefinitionChamp[],
    faitsSujet: Fait[],
  ): ChampDeFicheDto[] {
    return definitions.map((definition) => {
      const faits = faitsSujet.filter(
        (fait) =>
          fait.nature === NatureFait.champ &&
          fait.definitionChampId === definition.id &&
          fait.valeur !== null,
      );

      const sources = new Set(
        faits.map((fait) => fait.source.trim().toLowerCase()),
      );

      const valeur = definition.multiple
        ? faits.length > 0
          ? faits.map((fait) => fait.valeur)
          : null
        : (faits[0]?.valeur ?? null);

      return {
        definitionChampId: definition.id,
        cle: definition.cle,
        libelle: definition.libelle,
        typeDonnee: definition.typeDonnee,
        multiple: definition.multiple,
        valeur,
        faits: faits.map((fait) => this.presenterFaitDeChamp(fait)),
        multiSources: sources.size > 1,
      };
    });
  }

  private async chargerType(id: string): Promise<TypeAvecChamps> {
    const type = await this.prisma.sansFiltre.typeEntite.findUnique({
      where: { id },
      include: { champs: { orderBy: { ordre: 'asc' } } },
    });

    if (!type) {
      throw new BadRequestException("type d'entité inconnu");
    }

    return type;
  }

  private async verifierDossier(id: string): Promise<void> {
    const dossier = await this.prisma.sansFiltre.dossier.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!dossier) {
      throw new BadRequestException('dossier de saisie inconnu');
    }
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
      this.prisma.sansFiltre.typeLien.findMany({
        where: { id: { in: saisis.map((lien) => lien.typeLienId) } },
      }),

      this.prisma.sansFiltre.entite.findMany({
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
      visibiliteEffective: fait.visibiliteEffective,
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
