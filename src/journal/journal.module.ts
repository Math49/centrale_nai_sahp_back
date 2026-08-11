import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { ContexteJournal } from './contexte-journal';
import { IntercepteurJournal } from './intercepteur-journal';
import { JournalAuditService } from './journal-audit.service';
import { JournalConsultationService } from './journal-consultation.service';
import { JournalController } from './journal.controller';
import { JournalService } from './journal.service';

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
