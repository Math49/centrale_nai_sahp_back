import { ApiProperty } from '@nestjs/swagger';
import { Visibilite } from '@prisma/client';

export const FAMILLES_SIGNAL = [
  'recoupement',
  'recurrence',
  'vieillissement',
] as const;

export type FamilleSignal = (typeof FAMILLES_SIGNAL)[number];

export class SignalDto {
  @ApiProperty({
    description: 'Clé stable, pour que le front puisse suivre un signal',
  })
  id!: string;

  @ApiProperty({ enum: FAMILLES_SIGNAL })
  famille!: FamilleSignal;

  @ApiProperty({ format: 'uuid' }) entiteId!: string;
  @ApiProperty() entiteLibelle!: string;
  @ApiProperty() typeCode!: string;

  @ApiProperty({ description: 'Ce que la centrale a remarqué, en une phrase' })
  resume!: string;

  @ApiProperty({ description: 'Ce sur quoi elle s’appuie' })
  detail!: string;

  @ApiProperty({
    nullable: true,
    format: 'uuid',
    description: 'Le fait en cause, pour le vieillissement',
  })
  faitId!: string | null;
}

export class DossierDeLAgentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nom!: string;
  @ApiProperty({ enum: Visibilite }) visibilite!: Visibilite;
  @ApiProperty({ format: 'uuid' }) entitePivotId!: string;
  @ApiProperty() entitePivotLibelle!: string;

  @ApiProperty({
    description: 'Habilité nommément, ou auteur du dossier',
  })
  motif!: 'habilitation' | 'creation';
}

export class ActiviteDto {
  @ApiProperty({ format: 'uuid' }) faitId!: string;
  @ApiProperty({ format: 'uuid' }) entiteId!: string;
  @ApiProperty() entiteLibelle!: string;
  @ApiProperty() resume!: string;
  @ApiProperty() source!: string;
  @ApiProperty({ minimum: 1, maximum: 4 }) fiabilite!: number;

  @ApiProperty({
    nullable: true,
    description: '« agent supprimé » si anonymisé',
  })
  auteur!: string | null;

  @ApiProperty({ format: 'date-time' }) survenuLe!: string;
}

export class ResultatRechercheDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() libelle!: string;
  @ApiProperty({ enum: ['entite', 'dossier'] }) nature!: 'entite' | 'dossier';
  @ApiProperty({ nullable: true }) typeCode!: string | null;
  @ApiProperty({ enum: Visibilite }) visibilite!: Visibilite;
}

export class AccueilDto {
  @ApiProperty({ type: [SignalDto] }) signaux!: SignalDto[];
  @ApiProperty({ type: [DossierDeLAgentDto] })
  mesDossiers!: DossierDeLAgentDto[];
  @ApiProperty({ type: [ActiviteDto] }) derniereActivite!: ActiviteDto[];
}
