import {
  CallHandler,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';

import type { AgentCourant, RequeteAuthentifiee } from '../auth/agent-courant';
import { VisibiliteService } from './visibilite.service';

/**
 * Garde de sortie — deuxième des trois couches de défense.
 *
 * Il inspecte chaque objet sérialisé avant qu'il ne quitte l'API et redemande à
 * la base si l'agent y avait droit. **Redondance assumée** : le filtre de
 * requête est censé suffire, et c'est justement pourquoi il faut un second
 * regard — une fuite de renseignement ne se rattrape pas.
 *
 * Une incohérence n'est pas rattrapée en silence : elle lève une erreur et
 * s'écrit dans les journaux. Masquer discrètement laisserait le défaut de
 * filtrage vivre, et la prochaine route l'exposerait autrement.
 */
@Injectable()
export class GardeDeSortie implements NestInterceptor {
  private readonly journal = new Logger(GardeDeSortie.name);

  constructor(private readonly visibilite: VisibiliteService) {}

  intercept(
    contexte: ExecutionContext,
    suivant: CallHandler,
  ): Observable<unknown> {
    const requete = contexte.switchToHttp().getRequest<RequeteAuthentifiee>();

    return suivant.handle().pipe(
      mergeMap(async (charge: unknown) => {
        const agent = requete.agent;

        if (agent) {
          await this.verifierCharge(agent, charge, requete.url);
        }

        return charge;
      }),
    );
  }

  /** Publique pour être vérifiable directement, sans passer par une route. */
  async verifierCharge(
    agent: AgentCourant,
    charge: unknown,
    url: string,
  ): Promise<void> {
    const releve = this.relever(charge);

    // Tout ce qui est public sort sans question : le cas courant ne coûte rien.
    if (releve.faits.size === 0 && releve.entites.size === 0) {
      return;
    }

    const [faitsPermis, entitesPermises] = await Promise.all([
      this.visibilite.faitsAccessibles(agent, [...releve.faits]),
      this.visibilite.entitesAccessibles(agent, [...releve.entites]),
    ]);

    const faitsDeTrop = [...releve.faits].filter((id) => !faitsPermis.has(id));
    const entitesDeTrop = [...releve.entites].filter(
      (id) => !entitesPermises.has(id),
    );

    if (faitsDeTrop.length === 0 && entitesDeTrop.length === 0) {
      return;
    }

    this.journal.error(
      `fuite interceptée en sortie de ${url} pour l'agent ${agent.matricule} — ` +
        `faits: ${faitsDeTrop.join(', ') || 'aucun'} · ` +
        `entités: ${entitesDeTrop.join(', ') || 'aucune'}`,
    );

    throw new InternalServerErrorException(
      'incohérence de visibilité détectée en sortie — réponse refusée',
    );
  }

  /**
   * Relève les identifiants à vérifier.
   *
   * On ne contrôle que ce qui n'est pas public : un objet dont la visibilité
   * effective est publique est accessible à tout agent connecté, par
   * construction du calcul en base.
   */
  private relever(charge: unknown): {
    faits: Set<string>;
    entites: Set<string>;
  } {
    const faits = new Set<string>();
    const entites = new Set<string>();

    const parcourir = (noeud: unknown, profondeur: number): void => {
      if (profondeur > 12 || noeud === null || typeof noeud !== 'object') {
        return;
      }

      if (Array.isArray(noeud)) {
        noeud.forEach((element) => parcourir(element, profondeur + 1));
        return;
      }

      const objet = noeud as Record<string, unknown>;

      // Un fait se reconnaît à sa visibilité effective, que seuls les faits
      // portent.
      if (
        typeof objet.visibiliteEffective === 'string' &&
        objet.visibiliteEffective !== 'public'
      ) {
        const id = objet.faitId ?? objet.id;
        if (typeof id === 'string') {
          faits.add(id);
        }
      }

      // Une entité se reconnaît à son type et à sa visibilité propre.
      if (
        typeof objet.typeEntiteId === 'string' &&
        typeof objet.visibilite === 'string' &&
        objet.visibilite !== 'public' &&
        typeof objet.id === 'string'
      ) {
        entites.add(objet.id);
      }

      Object.values(objet).forEach((valeur) =>
        parcourir(valeur, profondeur + 1),
      );
    };

    parcourir(charge, 0);

    return { faits, entites };
  }
}
