import { SetMetadata } from '@nestjs/common';

export const CLE_CONSULTATION = 'journal_consultation';
export const CLE_HORS_AUDIT = 'journal_hors_audit';

export type NatureConsultee = 'entite' | 'dossier';

export const Consultation = (nature: NatureConsultee) =>
  SetMetadata(CLE_CONSULTATION, nature);

export const HorsAudit = () => SetMetadata(CLE_HORS_AUDIT, true);
