import { SetMetadata } from '@nestjs/common';

export const CLE_CONSULTATION = 'journal_consultation';
export const CLE_HORS_AUDIT = 'journal_hors_audit';

/** Nature de l'objet dont une route rend la fiche. */
export type NatureConsultee = 'entite' | 'dossier';

/**
 * Route dont la réponse est **une fiche**, donc une consultation à journaliser.
 *
 * Invariant 7 : toute consultation de fiche est journalisée, y compris celle
 * d'un super-admin. La marque porte sur la fiche, pas sur toute lecture — noter
 * chaque annuaire et chaque compteur noierait le journal, qui existe pour être
 * relu.
 */
export const Consultation = (nature: NatureConsultee) =>
  SetMetadata(CLE_CONSULTATION, nature);

/**
 * Écriture qui ne mérite pas de trace d'audit.
 *
 * À justifier en revue, et réservée à ce qui ne touche pas l'information
 * d'enquête : une connexion, un enregistrement de disposition du graphe.
 */
export const HorsAudit = () => SetMetadata(CLE_HORS_AUDIT, true);
