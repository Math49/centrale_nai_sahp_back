import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EtatEntite, EtatFait, NatureFait, Visibilite } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { BusInvalidation } from './bus-invalidation';

export interface Noeud {
  id: string;
  libelle: string;
  typeEntiteId: string;
  typeCode: string;
  visibilite: Visibilite;
}

export interface Arete {
  faitId: string;
  typeLienId: string;
  sujetId: string;
  cibleId: string;
  fiabilite: number;
  visibiliteFait: Visibilite;
  dossierId: string | null;
  visibiliteDossier: Visibilite | null;
  visibiliteSujet: Visibilite;
  visibiliteCible: Visibilite;
}

export interface GrapheComplet {
  noeuds: Map<string, Noeud>;

  adjacence: Map<string, Arete[]>;

  aretesParFait: Map<string, Arete>;

  dossiersParEntite: Map<string, Set<string>>;
  visibiliteDesDossiers: Map<string, Visibilite>;
  charge: Date;
}

@Injectable()
export class CacheGrapheService implements OnModuleInit {
  private readonly journal = new Logger(CacheGrapheService.name);

  private graphe: GrapheComplet | null = null;
  private chargement: Promise<GrapheComplet> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: BusInvalidation,
  ) {}

  async onModuleInit(): Promise<void> {
    this.bus.auSignal(() => this.invalider());

    await this.obtenir().catch((erreur: Error) => {
      this.journal.warn(`graphe non chargé au démarrage — ${erreur.message}`);
      return null;
    });
  }

  invalider(): void {
    this.graphe = null;
  }

  async obtenir(): Promise<GrapheComplet> {
    if (this.graphe) {
      return this.graphe;
    }

    this.chargement ??= this.charger().finally(() => {
      this.chargement = null;
    });

    return this.chargement;
  }

  private async charger(): Promise<GrapheComplet> {
    const debut = Date.now();

    const [entites, faits, suivis, dossiers] = await Promise.all([
      this.prisma.sansFiltre.entite.findMany({
        where: { etat: EtatEntite.actif, fusionneeVersId: null },
        include: { typeEntite: { select: { code: true } } },
      }),
      this.prisma.sansFiltre.fait.findMany({
        where: { nature: NatureFait.lien, etat: EtatFait.actif },
        select: {
          id: true,
          typeLienId: true,
          sujetId: true,
          cibleId: true,
          fiabilite: true,
          visibilite: true,
          dossierId: true,
        },
      }),
      this.prisma.sansFiltre.suivi.findMany({
        select: { dossierId: true, entiteId: true },
      }),
      this.prisma.sansFiltre.dossier.findMany({
        select: { id: true, visibilite: true },
      }),
    ]);

    const noeuds = new Map<string, Noeud>(
      entites.map((entite) => [
        entite.id,
        {
          id: entite.id,
          libelle: entite.libelle,
          typeEntiteId: entite.typeEntiteId,
          typeCode: entite.typeEntite.code,
          visibilite: entite.visibilite,
        },
      ]),
    );

    const visibiliteDesDossiers = new Map(
      dossiers.map((dossier) => [dossier.id, dossier.visibilite]),
    );

    const adjacence = new Map<string, Arete[]>();
    const aretesParFait = new Map<string, Arete>();

    const relier = (depuis: string, arete: Arete): void => {
      const liste = adjacence.get(depuis);
      if (liste) {
        liste.push(arete);
      } else {
        adjacence.set(depuis, [arete]);
      }
    };

    for (const fait of faits) {
      const sujet = noeuds.get(fait.sujetId);
      const cible = fait.cibleId ? noeuds.get(fait.cibleId) : undefined;

      if (!sujet || !cible) {
        continue;
      }

      const arete: Arete = {
        faitId: fait.id,
        typeLienId: fait.typeLienId!,
        sujetId: fait.sujetId,
        cibleId: cible.id,
        fiabilite: fait.fiabilite,
        visibiliteFait: fait.visibilite,
        dossierId: fait.dossierId,
        visibiliteDossier: fait.dossierId
          ? (visibiliteDesDossiers.get(fait.dossierId) ?? Visibilite.public)
          : null,
        visibiliteSujet: sujet.visibilite,
        visibiliteCible: cible.visibilite,
      };

      relier(arete.sujetId, arete);
      relier(arete.cibleId, arete);
      aretesParFait.set(arete.faitId, arete);
    }

    const dossiersParEntite = new Map<string, Set<string>>();

    for (const suivi of suivis) {
      const existants = dossiersParEntite.get(suivi.entiteId);
      if (existants) {
        existants.add(suivi.dossierId);
      } else {
        dossiersParEntite.set(suivi.entiteId, new Set([suivi.dossierId]));
      }
    }

    this.graphe = {
      noeuds,
      adjacence,
      aretesParFait,
      dossiersParEntite,
      visibiliteDesDossiers,
      charge: new Date(),
    };

    this.journal.log(
      `graphe chargé — ${noeuds.size} nœuds, ${faits.length} arêtes, ${Date.now() - debut} ms`,
    );

    return this.graphe;
  }
}
