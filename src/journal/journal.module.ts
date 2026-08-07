import { Global, Module } from '@nestjs/common';

import { JournalAuditService } from './journal-audit.service';

/**
 * Le lot 11 y ajoutera le journal de consultation, l'intercepteur générique et
 * les routes de lecture. Le lot 1 n'a besoin que de l'écriture d'audit.
 */
@Global()
@Module({
  providers: [JournalAuditService],
  exports: [JournalAuditService],
})
export class JournalModule {}
