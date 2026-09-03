import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EtatEntite, Visibilite } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { AgentHabiliteDto } from '../dossiers/dossiers.dto';

const CODE = /^[a-z][a-z0-9_]*$/;

// ────────────────────────── Colonnes ──────────────────────────

export class ColonneKanbanDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'en_cours' }) code!: string;
  @ApiProperty({ example: 'En cours' }) libelle!: string;
  @ApiProperty() ordre!: number;
}

export class CreationColonneDto {
  @ApiProperty({ example: 'en_cours' })
  @IsString()
  @Matches(CODE, {
    message: 'minuscules, chiffres et tirets bas, commençant par une lettre',
  })
  @MaxLength(64)
  code!: string;

  @ApiProperty({ example: 'En cours' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  libelle!: string;
}

export class ModificationColonneDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  libelle?: string;
}

// ─────────────────────────── Cartes ───────────────────────────

export class AgentAssigneDto {
  @ApiProperty({ format: 'uuid' }) agentId!: string;

  @ApiProperty({ description: '« agent supprimé » si le compte est anonymisé' })
  libelle!: string;

  @ApiProperty() matricule!: string;

  @ApiProperty({
    description:
      'Initiales, pour la pastille du tableau. Deux lettres au plus, « ? » si le compte est anonymisé.',
  })
  initiales!: string;

  @ApiProperty({
    description:
      'Cet agent peut-il réellement lire la carte ? Assigner n’habilite pas.',
  })
  peutLire!: boolean;

  @ApiProperty({ format: 'date-time' }) assigneLe!: string;
}

export class RattachementCarteDto {
  @ApiProperty({ format: 'uuid' }) id!: string;

  @ApiProperty({
    nullable: true,
    description:
      'Nul lorsque l’objet rattaché n’est pas consultable — le lien existe, son contenu non',
  })
  libelle!: string | null;
}

export class CarteEnqueteDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) colonneId!: string;
  @ApiProperty() rang!: number;
  @ApiProperty() titre!: string;
  @ApiProperty({ nullable: true }) description!: string | null;

  @ApiProperty({ nullable: true, format: 'date' })
  echeance!: string | null;

  @ApiProperty({ type: RattachementCarteDto, nullable: true })
  dossier!: RattachementCarteDto | null;

  @ApiProperty({ type: RattachementCarteDto, nullable: true })
  entite!: RattachementCarteDto | null;

  @ApiProperty({
    type: [AgentAssigneDto],
    description: 'Qui s’en occupe. Sans effet sur le droit de lire.',
  })
  assignes!: AgentAssigneDto[];

  @ApiProperty({ enum: Visibilite }) visibilite!: Visibilite;
  @ApiProperty({ enum: EtatEntite }) etat!: EtatEntite;

  @ApiProperty() auteurLibelle!: string;
  @ApiProperty({ format: 'date-time' }) creeLe!: string;
  @ApiProperty({ format: 'date-time' }) modifieLe!: string;

  @ApiProperty({
    type: [AgentHabiliteDto],
    description:
      'Whitelist. C’est elle, et non l’assignation, qui ouvre l’accès.',
  })
  habilitations!: AgentHabiliteDto[];
}

export class CreationCarteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  colonneId!: string;

  @ApiProperty({ example: 'Identifier le fournisseur de Los Vagos' })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  titre!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional({ format: 'date', example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  echeance?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  dossierId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  entiteId?: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      'Comptes qui s’en occupent. **N’ouvre pas l’accès** : une carte classée demande en plus une habilitation.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  assignes?: string[];

  @ApiPropertyOptional({ enum: Visibilite })
  @IsOptional()
  @IsEnum(Visibilite)
  visibilite?: Visibilite;
}

export class ModificationCarteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  titre?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  echeance?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  dossierId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  entiteId?: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Jeu complet — il remplace le précédent',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  assignes?: string[];

  @ApiPropertyOptional({ enum: Visibilite })
  @IsOptional()
  @IsEnum(Visibilite)
  visibilite?: Visibilite;
}

/**
 * Déplacement d'une carte.
 *
 * Le rang est celui qu'elle doit occuper dans la colonne d'arrivée ; le service
 * réécrit les rangs des deux colonnes concernées. Envoyer un jeu complet comme
 * pour le référentiel serait plus lourd à produire côté tableau, où l'on ne
 * connaît que la carte saisie et l'endroit du dépôt.
 */
export class DeplacementCarteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  colonneId!: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  rang!: number;
}
