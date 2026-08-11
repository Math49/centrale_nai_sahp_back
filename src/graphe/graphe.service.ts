import { Injectable, NotFoundException } from '@nestjs/common';

import type { AgentCourant } from '../auth/agent-courant';
import { contenuAccessible, objetVisible } from '../visibilite/predicats';
import { VisibiliteService } from '../visibilite/visibilite.service';
import type { Arete, GrapheComplet, Noeud } from './cache-graphe.service';
import { CacheGrapheService } from './cache-graphe.service';

interface VueElaguee {
  graphe: GrapheComplet;
  noeudVisible: (id: string) => boolean;
  areteFranchissable: (arete: Arete) => boolean;
  voisins: (id: string) => Arete[];
}

export interface CheminTrouve {
  noeuds: string[];
  aretes: string[];
  longueur: number;
  maillonLeFaible: number;
}

@Injectable()
export class GrapheService {
  constructor(
    private readonly cache: CacheGrapheService,
    private readonly visibilite: VisibiliteService,
  ) {}

  private async elaguer(agent: AgentCourant): Promise<VueElaguee> {
    const graphe = await this.cache.obtenir();
    const contexte = this.visibilite.contexte(agent);

    const habiliteEntite = new Set(contexte.entitesHabilitees);
    const habiliteDossier = new Set(contexte.dossiersHabilites);

    const noeudVisible = (id: string): boolean => {
      const noeud = graphe.noeuds.get(id);
      return (
        noeud !== undefined &&
        objetVisible(contexte, noeud.visibilite, habiliteEntite.has(id))
      );
    };

    const areteFranchissable = (arete: Arete): boolean =>
      contenuAccessible(contexte, [
        { niveau: arete.visibiliteFait, habilite: false },
        ...(arete.dossierId
          ? [
              {
                niveau: arete.visibiliteDossier!,
                habilite: habiliteDossier.has(arete.dossierId),
              },
            ]
          : []),
        {
          niveau: arete.visibiliteSujet,
          habilite: habiliteEntite.has(arete.sujetId),
        },
        {
          niveau: arete.visibiliteCible,
          habilite: habiliteEntite.has(arete.cibleId),
        },
      ]);

    const voisins = (id: string): Arete[] =>
      (graphe.adjacence.get(id) ?? []).filter(
        (arete) =>
          areteFranchissable(arete) && noeudVisible(this.autreBout(arete, id)),
      );

    return { graphe, noeudVisible, areteFranchissable, voisins };
  }

  private autreBout(arete: Arete, depuis: string): string {
    return arete.sujetId === depuis ? arete.cibleId : arete.sujetId;
  }

  async voisinage(
    agent: AgentCourant,
    depuis: string,
    profondeur: number,
    fiabiliteMinimale: number,
  ): Promise<{
    noeuds: (Noeud & { voisinsNonAffiches: number; recurrence: boolean })[];
    aretes: Arete[];
  }> {
    const vue = await this.elaguer(agent);

    if (!vue.noeudVisible(depuis)) {
      throw new NotFoundException('entité inconnue');
    }

    const retenus = new Set<string>([depuis]);
    const aretes = new Map<string, Arete>();

    let frontiere = [depuis];

    for (let saut = 0; saut < profondeur; saut += 1) {
      const suivante: string[] = [];

      for (const noeud of frontiere) {
        for (const arete of vue.voisins(noeud)) {
          if (arete.fiabilite < fiabiliteMinimale) {
            continue;
          }

          aretes.set(arete.faitId, arete);
          const autre = this.autreBout(arete, noeud);

          if (!retenus.has(autre)) {
            retenus.add(autre);
            suivante.push(autre);
          }
        }
      }

      frontiere = suivante;
    }

    const recurrences = await this.recurrences(agent);

    return {
      noeuds: [...retenus].map((id) => {
        const noeud = vue.graphe.noeuds.get(id)!;

        const nonAffiches = vue
          .voisins(id)
          .filter(
            (arete) =>
              arete.fiabilite >= fiabiliteMinimale &&
              !retenus.has(this.autreBout(arete, id)),
          );

        return {
          ...noeud,
          voisinsNonAffiches: new Set(
            nonAffiches.map((arete) => this.autreBout(arete, id)),
          ).size,
          recurrence: recurrences.has(id),
        };
      }),
      aretes: [...aretes.values()],
    };
  }

  async vueEntiere(
    agent: AgentCourant,
    fiabiliteMinimale: number,
  ): Promise<{
    noeuds: (Noeud & { voisinsNonAffiches: number; recurrence: boolean })[];
    aretes: Arete[];
  }> {
    const vue = await this.elaguer(agent);
    const recurrences = await this.recurrences(agent);

    const aretes = new Map<string, Arete>();

    for (const arete of vue.graphe.aretesParFait.values()) {
      if (
        arete.fiabilite >= fiabiliteMinimale &&
        vue.areteFranchissable(arete) &&
        vue.noeudVisible(arete.sujetId) &&
        vue.noeudVisible(arete.cibleId)
      ) {
        aretes.set(arete.faitId, arete);
      }
    }

    const noeuds = [...vue.graphe.noeuds.keys()]
      .filter((id) => vue.noeudVisible(id))
      .map((id) => ({
        ...vue.graphe.noeuds.get(id)!,

        voisinsNonAffiches: 0,
        recurrence: recurrences.has(id),
      }));

    return { noeuds, aretes: [...aretes.values()] };
  }

  async chemins(
    agent: AgentCourant,
    de: string,
    vers: string,
    fiabiliteMinimale: number,
  ): Promise<{
    plusCourt: CheminTrouve | null;
    plusSolide: CheminTrouve | null;
  }> {
    const vue = await this.elaguer(agent);

    if (!vue.noeudVisible(de) || !vue.noeudVisible(vers)) {
      throw new NotFoundException('entité inconnue');
    }

    const plusCourt = this.parcourir(vue, de, vers, fiabiliteMinimale);

    let plusSolide: CheminTrouve | null = null;

    for (let seuil = 4; seuil >= fiabiliteMinimale; seuil -= 1) {
      const candidat = this.parcourir(vue, de, vers, seuil);

      if (candidat) {
        plusSolide = candidat;
        break;
      }
    }

    if (
      plusCourt &&
      plusSolide &&
      plusCourt.aretes.join() === plusSolide.aretes.join()
    ) {
      return { plusCourt, plusSolide: null };
    }

    return { plusCourt, plusSolide };
  }

  private parcourir(
    vue: VueElaguee,
    de: string,
    vers: string,
    fiabiliteMinimale: number,
  ): CheminTrouve | null {
    if (de === vers) {
      return { noeuds: [de], aretes: [], longueur: 0, maillonLeFaible: 4 };
    }

    const venuDe = new Map<string, { noeud: string; arete: Arete }>();
    const vus = new Set<string>([de]);
    let frontiere = [de];

    while (frontiere.length > 0) {
      const suivante: string[] = [];

      for (const noeud of frontiere) {
        for (const arete of vue.voisins(noeud)) {
          if (arete.fiabilite < fiabiliteMinimale) {
            continue;
          }

          const autre = this.autreBout(arete, noeud);

          if (vus.has(autre)) {
            continue;
          }

          vus.add(autre);
          venuDe.set(autre, { noeud, arete });

          if (autre === vers) {
            return this.remonter(venuDe, de, vers);
          }

          suivante.push(autre);
        }
      }

      frontiere = suivante;
    }

    return null;
  }

  private remonter(
    venuDe: Map<string, { noeud: string; arete: Arete }>,
    de: string,
    vers: string,
  ): CheminTrouve {
    const noeuds: string[] = [vers];
    const aretes: Arete[] = [];

    let courant = vers;

    while (courant !== de) {
      const etape = venuDe.get(courant)!;
      aretes.unshift(etape.arete);
      noeuds.unshift(etape.noeud);
      courant = etape.noeud;
    }

    return {
      noeuds,
      aretes: aretes.map((arete) => arete.faitId),
      longueur: aretes.length,
      maillonLeFaible: Math.min(...aretes.map((arete) => arete.fiabilite)),
    };
  }

  async recurrences(agent: AgentCourant): Promise<Set<string>> {
    const vue = await this.elaguer(agent);
    const contexte = this.visibilite.contexte(agent);

    const dossiersLisibles = new Set(
      [...vue.graphe.visibiliteDesDossiers.entries()]
        .filter(([id, niveau]) =>
          objetVisible(
            contexte,
            niveau,
            contexte.dossiersHabilites.includes(id),
          ),
        )
        .map(([id]) => id),
    );

    const recurrentes = new Set<string>();

    for (const id of vue.graphe.noeuds.keys()) {
      if (!vue.noeudVisible(id)) {
        continue;
      }

      const dossiers = new Set<string>();

      for (const arete of vue.voisins(id)) {
        const voisin = this.autreBout(arete, id);

        for (const dossier of vue.graphe.dossiersParEntite.get(voisin) ?? []) {
          if (dossiersLisibles.has(dossier)) {
            dossiers.add(dossier);
          }
        }
      }

      if (dossiers.size >= 2) {
        recurrentes.add(id);
      }
    }

    return recurrentes;
  }

  async aretes(
    agent: AgentCourant,
    faitIds: readonly string[],
  ): Promise<Map<string, Arete>> {
    const vue = await this.elaguer(agent);
    const trouvees = new Map<string, Arete>();

    for (const faitId of faitIds) {
      const arete = vue.graphe.aretesParFait.get(faitId);

      if (arete && vue.areteFranchissable(arete)) {
        trouvees.set(faitId, arete);
      }
    }

    return trouvees;
  }

  async voisinsDirects(
    agent: AgentCourant,
    ids: readonly string[],
  ): Promise<Map<string, Set<string>>> {
    const vue = await this.elaguer(agent);
    const voisinages = new Map<string, Set<string>>();

    for (const id of ids) {
      if (!vue.noeudVisible(id)) {
        voisinages.set(id, new Set());
        continue;
      }

      voisinages.set(
        id,
        new Set(vue.voisins(id).map((arete) => this.autreBout(arete, id))),
      );
    }

    return voisinages;
  }

  async nommer(
    agent: AgentCourant,
    ids: string[],
  ): Promise<Map<string, Noeud>> {
    const vue = await this.elaguer(agent);

    return new Map(
      ids
        .filter((id) => vue.noeudVisible(id))
        .map((id) => [id, vue.graphe.noeuds.get(id)!]),
    );
  }
}
