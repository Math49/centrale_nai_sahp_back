import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Une écriture, telle que le journal la restitue.
 *
 * L'agent y est désigné par son identifiant **et** par un libellé recalculé à
 * la lecture, jamais recopié à l'écriture : une trace qui aurait figé le nom
 * survivrait à l'anonymisation du compte, qui perdrait alors son sens.
 */
export class EntreeAuditDto {
  @ApiProperty({ description: 'Identifiant de l’entrée, sérialisé en texte' })
  id!: string;

  @ApiProperty({ nullable: true, format: 'uuid' })
  agentId!: string | null;

  @ApiProperty({ description: '« agent supprimé » si le compte est anonymisé' })
  agentLibelle!: string;

  @ApiProperty() action!: string;
  @ApiProperty() cibleTable!: string;

  @ApiProperty({ nullable: true, format: 'uuid' })
  cibleId!: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Libellé de la cible, lorsqu’elle est retrouvable',
  })
  cibleLibelle!: string | null;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  avant?: unknown;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  apres?: unknown;

  @ApiProperty({ format: 'date-time' }) effectueLe!: string;
}

export class EntreeConsultationDto {
  @ApiProperty() id!: string;

  @ApiProperty({ format: 'uuid' }) agentId!: string;
  @ApiProperty() agentLibelle!: string;

  @ApiProperty({ enum: ['entite', 'dossier'] })
  nature!: 'entite' | 'dossier';

  @ApiProperty({ format: 'uuid' }) objetId!: string;
  @ApiProperty({ nullable: true }) objetLibelle!: string | null;

  @ApiProperty({
    description: 'Lecture rendue possible par une permission dérogatoire',
  })
  derogation!: boolean;

  @ApiProperty({
    description: 'Lecture d’un super-admin, signalée comme telle',
  })
  superAdmin!: boolean;

  @ApiProperty({ format: 'date-time' }) consulteLe!: string;
}

export class EntiteOrphelineDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() libelle!: string;
  @ApiProperty() typeCode!: string;
  @ApiProperty({ format: 'date-time' }) creeLe!: string;
  @ApiProperty({ nullable: true }) auteur!: string | null;
}
