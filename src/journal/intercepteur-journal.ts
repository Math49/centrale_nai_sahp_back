import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma, Visibilite } from '@prisma/client';
import { from, mergeMap, Observable } from 'rxjs';

import type { RequeteAuthentifiee } from '../auth/agent-courant';
import { ContexteJournal } from './contexte-journal';
import {
  CLE_CONSULTATION,
  CLE_HORS_AUDIT,
  type NatureConsultee,
} from './decorateurs';
import { JournalAuditService } from './journal-audit.service';
import { JournalConsultationService } from './journal-consultation.service';

const METHODES_ECRIVANTES = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Intercepteur de journal — consultation en sortie de lecture, audit en sortie
 * d'écriture.
 *
 * **Applicatif et non trigger** : un trigger ne connaît pas l'agent courant.
 *
 * En sortie seulement, et jamais en entrée : une requête refusée ou en erreur
 * n'a rien produit, et la journaliser laisserait croire à un geste qui n'a pas
 * eu lieu.
 *
 * L'audit générique ne s'écrit que si le service n'a pas tracé lui-même — voir
 * `ContexteJournal`. Un chemin d'écriture nouveau est donc tracé d'office, même
 * si personne n'y a pensé.
 */
@Injectable()
export class IntercepteurJournal implements NestInterceptor {
  private readonly journal = new Logger(IntercepteurJournal.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly contexte: ContexteJournal,
    private readonly audit: JournalAuditService,
    private readonly consultations: JournalConsultationService,
  ) {}

  intercept(
    contexte: ExecutionContext,
    suite: CallHandler,
  ): Observable<unknown> {
    if (contexte.getType() !== 'http') {
      return suite.handle();
    }

    const requete = contexte.switchToHttp().getRequest<RequeteAuthentifiee>();

    const agent = requete.agent;

    if (!agent) {
      // Connexion, santé : aucun agent résolu, rien à imputer à personne.
      return suite.handle();
    }

    const nature = this.reflector.getAllAndOverride<
      NatureConsultee | undefined
    >(CLE_CONSULTATION, [contexte.getHandler(), contexte.getClass()]);

    const horsAudit = this.reflector.getAllAndOverride<boolean | undefined>(
      CLE_HORS_AUDIT,
      [contexte.getHandler(), contexte.getClass()],
    );

    const ecriture = METHODES_ECRIVANTES.has(requete.method) && !horsAudit;

    // La portée doit envelopper l'**abonnement**, pas la construction de
    // l'observable : `suite.handle()` ne fait que décrire le traitement, et
    // Nest ne s'y abonne qu'après. Ouvrir la portée autour du seul appel
    // laisserait le contrôleur s'exécuter en dehors, et l'intercepteur croirait
    // qu'aucun service n'a tracé.
    return new Observable<unknown>((observateur) =>
      this.contexte.executer(() =>
        suite
          .handle()
          .pipe(
            mergeMap((reponse: unknown) =>
              from(
                this.apres(requete, agent, reponse, { nature, ecriture }).then(
                  () => reponse,
                ),
              ),
            ),
          )
          .subscribe(observateur),
      ),
    );
  }

  private async apres(
    requete: RequeteAuthentifiee,
    agent: NonNullable<RequeteAuthentifiee['agent']>,
    reponse: unknown,
    quoi: { nature?: NatureConsultee; ecriture: boolean },
  ): Promise<void> {
    if (quoi.nature) {
      const objet = this.objetConsulte(requete, reponse);

      if (objet) {
        await this.consultations.tracer(agent, quoi.nature, objet);
      }
    }

    if (quoi.ecriture && !this.contexte.dejaTrace()) {
      await this.tracerGeneriquement(requete, agent.id);
    }
  }

  /**
   * L'objet consulté, lu dans la réponse plutôt que rechargé.
   *
   * La fiche porte déjà sa visibilité, et c'est elle qui dit si la lecture a
   * demandé une dérogation. La relire en base coûterait une requête pour une
   * information qu'on tient.
   */
  private objetConsulte(
    requete: RequeteAuthentifiee,
    reponse: unknown,
  ): { id: string; visibilite: Visibilite } | null {
    const corps = reponse as { id?: unknown; visibilite?: unknown } | null;
    const id =
      typeof corps?.id === 'string'
        ? corps.id
        : ((requete.params as Record<string, string> | undefined)?.id ?? null);

    if (!id) {
      return null;
    }

    const visibilite =
      typeof corps?.visibilite === 'string'
        ? (corps.visibilite as Visibilite)
        : Visibilite.public;

    return { id, visibilite };
  }

  /** Trace de repli : le geste, sa cible et ce que la requête portait. */
  private async tracerGeneriquement(
    requete: RequeteAuthentifiee,
    agentId: string,
  ): Promise<void> {
    // `route` n'est pas typé par express ; le gabarit de route — « /entites/:id »
    // — vaut mieux que l'URL concrète, qui ferait autant d'actions distinctes
    // qu'il y a d'identifiants.
    const gabarit = (requete.route as { path?: string } | undefined)?.path;
    const chemin = gabarit ?? requete.path;
    const cible = (requete.params as Record<string, string> | undefined)?.id;

    this.journal.debug(
      `audit générique pour ${requete.method} ${chemin} — le service n'a pas tracé`,
    );

    await this.audit.tracer({
      agentId,
      action: `${requete.method.toLowerCase()} ${chemin}`,
      cibleTable: this.tableDeviner(chemin),
      cibleId: cible ?? null,
      apres: this.corpsLisible(requete.body),
    });
  }

  private tableDeviner(chemin: string): string {
    const premier = chemin.split('/').filter(Boolean)[0] ?? 'inconnu';
    return premier.replace(/s$/, '');
  }

  /**
   * Le corps de la requête, débarrassé de ce qui ne doit jamais être relu.
   *
   * Un mot de passe recopié dans une trace y resterait lisible pour toujours,
   * et le journal se consulte.
   */
  private corpsLisible(corps: unknown): Prisma.InputJsonObject | undefined {
    if (!corps || typeof corps !== 'object' || Array.isArray(corps)) {
      return undefined;
    }

    const retenu: Record<string, unknown> = {};

    for (const [cle, valeur] of Object.entries(corps)) {
      if (/mot.?de.?passe|password|ancien|nouveau|secret|jeton/i.test(cle)) {
        continue;
      }

      retenu[cle] = valeur;
    }

    return retenu as Prisma.InputJsonObject;
  }
}
