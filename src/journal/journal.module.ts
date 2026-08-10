import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { ContexteJournal } from './contexte-journal';
import { IntercepteurJournal } from './intercepteur-journal';
import { JournalAuditService } from './journal-audit.service';
import { JournalConsultationService } from './journal-consultation.service';
import { JournalController } from './journal.controller';
import { JournalService } from './journal.service';

/**
 * Journal — consultation et audit.
 *
 * Global : tout module écrit dans l'audit, et l'intercepteur est monté une fois
 * pour toute l'application. C'est ce montage global qui fait que l'oubli d'un
 * développeur produit une trace grossière plutôt qu'un silence.
 */
@Global()
@Module({
  controllers: [JournalController],
  providers: [
    ContexteJournal,
    JournalAuditService,
    JournalConsultationService,
    JournalService,
    { provide: APP_INTERCEPTOR, useClass: IntercepteurJournal },
  ],
  exports: [ContexteJournal, JournalAuditService, JournalConsultationService],
})
export class JournalModule {}
