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

  private async tracerGeneriquement(
    requete: RequeteAuthentifiee,
    agentId: string,
  ): Promise<void> {
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
