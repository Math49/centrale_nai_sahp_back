import { Injectable } from '@nestjs/common';

import type { AgentCourant } from '../auth/agent-courant';
import { PrismaService } from '../prisma/prisma.service';
import { ReferentielService } from '../referentiel/referentiel.service';
import type { Arete, Noeud } from './cache-graphe.service';
import type {
  AreteGrapheDto,
  CheminDto,
  CheminsDto,
  DispositionDto,
  NoeudGrapheDto,
  VoisinageDto,
} from './graphe.dto';
import { GrapheService, type CheminTrouve } from './graphe.service';

@Injectable()
export class GrapheAssembleurService {
  constructor(
    private readonly graphe: GrapheService,
    private readonly referentiel: ReferentielService,
    private readonly prisma: PrismaService,
  ) {}

  async voisinage(
    agent: AgentCourant,
    options: {
      depuis: string;
      profondeur: number;
      fiabiliteMinimale: number;
      dossierId?: string;
    },
  ): Promise<VoisinageDto> {
    const brut = await this.graphe.voisinage(
      agent,
      options.depuis,
      options.profondeur,
      options.fiabiliteMinimale,
    );

    const [libelles, positions] = await Promise.all([
      this.libellesDeLiens(),
      this.positions(
        brut.noeuds.map((noeud) => noeud.id),
        options.dossierId,
      ),
    ]);

    return {
      noeuds: brut.noeuds.map((noeud) =>
        this.presenterNoeud(noeud, positions, {
          voisinsNonAffiches: noeud.voisinsNonAffiches,
          recurrence: noeud.recurrence,
        }),
      ),
      aretes: brut.aretes.map((arete) => this.presenterArete(arete, libelles)),
    };
  }

  async vueEntiere(
    agent: AgentCourant,
    options: { fiabiliteMinimale: number; dossierId?: string },
  ): Promise<VoisinageDto> {
    const brut = await this.graphe.vueEntiere(agent, options.fiabiliteMinimale);

    const [libelles, positions] = await Promise.all([
      this.libellesDeLiens(),
      this.positions(
        brut.noeuds.map((noeud) => noeud.id),
        options.dossierId,
      ),
    ]);

    return {
      noeuds: brut.noeuds.map((noeud) =>
        this.presenterNoeud(noeud, positions, {
          voisinsNonAffiches: noeud.voisinsNonAffiches,
          recurrence: noeud.recurrence,
        }),
      ),
      aretes: brut.aretes.map((arete) => this.presenterArete(arete, libelles)),
    };
  }

  async chemins(
    agent: AgentCourant,
    de: string,
    vers: string,
    fiabiliteMinimale: number,
  ): Promise<CheminsDto> {
    const { plusCourt, plusSolide } = await this.graphe.chemins(
      agent,
      de,
      vers,
      fiabiliteMinimale,
    );

    const [libelles, recurrences] = await Promise.all([
      this.libellesDeLiens(),
      this.graphe.recurrences(agent),
    ]);

    const habiller = async (
      chemin: CheminTrouve | null,
    ): Promise<CheminDto | null> => {
      if (!chemin) {
        return null;
      }

      const noeuds = await this.graphe.nommer(agent, chemin.noeuds);
      const aretes = await this.graphe.aretes(agent, chemin.aretes);

      return {
        noeuds: chemin.noeuds
          .map((id) => noeuds.get(id))
          .filter((noeud): noeud is Noeud => noeud !== undefined)
          .map((noeud) =>
            this.presenterNoeud(noeud, new Map(), {
              voisinsNonAffiches: 0,
              recurrence: recurrences.has(noeud.id),
            }),
          ),
        aretes: chemin.aretes
          .map((faitId) => aretes.get(faitId))
          .filter((arete): arete is Arete => arete !== undefined)
          .map((arete) => this.presenterArete(arete, libelles)),
        longueur: chemin.longueur,
        maillonLeFaible: chemin.maillonLeFaible,
      };
    };

    return {
      plusCourt: await habiller(plusCourt),
      plusSolide: await habiller(plusSolide),
    };
  }

  async enregistrerPositions(
    agent: AgentCourant,
    disposition: DispositionDto,
  ): Promise<void> {
    for (const position of disposition.positions) {
      const existante = await this.prisma.positionGraphe.findFirst({
        where: {
          entiteId: position.entiteId,
          dossierId: disposition.dossierId ?? null,
        },
        select: { id: true },
      });

      if (existante) {
        await this.prisma.positionGraphe.update({
          where: { id: existante.id },
          data: { x: position.x, y: position.y, modifiePar: agent.id },
        });
      } else {
        await this.prisma.positionGraphe.create({
          data: {
            entiteId: position.entiteId,
            dossierId: disposition.dossierId ?? null,
            x: position.x,
            y: position.y,
            modifiePar: agent.id,
          },
        });
      }
    }
  }

  private async positions(
    entiteIds: string[],
    dossierId?: string,
  ): Promise<Map<string, { x: number; y: number }>> {
    if (entiteIds.length === 0) {
      return new Map();
    }

    const enregistrees = await this.prisma.positionGraphe.findMany({
      where: {
        entiteId: { in: entiteIds },

        ...(dossierId
          ? { OR: [{ dossierId }, { dossierId: null }] }
          : { dossierId: null }),
      },
    });

    const positions = new Map<string, { x: number; y: number }>();

    for (const position of enregistrees) {
      const dejaPropre = positions.has(position.entiteId);
      const estPropre = position.dossierId !== null;

      if (!dejaPropre || estPropre) {
        positions.set(position.entiteId, { x: position.x, y: position.y });
      }
    }

    return positions;
  }

  private async libellesDeLiens(): Promise<Map<string, string>> {
    const catalogue = await this.referentiel.catalogue();

    return new Map(catalogue.typesLiens.map((lien) => [lien.id, lien.libelle]));
  }

  private presenterNoeud(
    noeud: Noeud,
    positions: Map<string, { x: number; y: number }>,
    extra: { voisinsNonAffiches: number; recurrence: boolean },
  ): NoeudGrapheDto {
    const position = positions.get(noeud.id);

    return {
      id: noeud.id,
      libelle: noeud.libelle,
      typeCode: noeud.typeCode,
      typeEntiteId: noeud.typeEntiteId,
      visibilite: noeud.visibilite,
      voisinsNonAffiches: extra.voisinsNonAffiches,
      recurrence: extra.recurrence,
      x: position?.x ?? null,
      y: position?.y ?? null,
    };
  }

  private presenterArete(
    arete: Arete,
    libelles: Map<string, string>,
  ): AreteGrapheDto {
    return {
      id: arete.faitId,
      sujetId: arete.sujetId,
      cibleId: arete.cibleId,
      typeLienId: arete.typeLienId,
      libelle: libelles.get(arete.typeLienId) ?? 'lien',
      fiabilite: arete.fiabilite,
    };
  }
}
