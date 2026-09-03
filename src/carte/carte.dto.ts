import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EtatEntite, NatureRepere, Visibilite } from '@prisma/client';
import {
  Allow,
  IsEnum,
  IsHexColor,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { AgentHabiliteDto } from '../dossiers/dossiers.dto';

const CODE = /^[a-z][a-z0-9_]*$/;

// ───────────────────────── Types de repères ─────────────────────────

export class TypeRepereDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'labo' }) code!: string;
  @ApiProperty({ example: 'Laboratoire' }) libelle!: string;
  @ApiProperty({ enum: NatureRepere }) nature!: NatureRepere;
  @ApiProperty({ example: 'fas:flask' }) icone!: string;
  @ApiProperty() ordre!: number;
}

export class CreationTypeRepereDto {
  @ApiProperty({ example: 'labo' })
  @IsString()
  @Matches(CODE, {
    message: 'minuscules, chiffres et tirets bas, commençant par une lettre',
  })
  @MaxLength(64)
  code!: string;

  @ApiProperty({ example: 'Laboratoire' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  libelle!: string;

  @ApiProperty({
    enum: NatureRepere,
    description:
      'Définitive : un type de point ne devient pas un type de zone, les repères déjà posés en dépendent',
  })
  @IsEnum(NatureRepere)
  nature!: NatureRepere;

  @ApiProperty({
    example: 'fas:flask',
    description:
      'Le type ne porte pas de couleur : elle se choisit à la pose, sur le repère',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  icone!: string;
}

export class ModificationTypeRepereDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  libelle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  icone?: string;
}

// ───────────────────────────── Repères ─────────────────────────────

export class PointDto {
  @ApiProperty({ minimum: 0, maximum: 1 }) x!: number;
  @ApiProperty({ minimum: 0, maximum: 1 }) y!: number;
}

export class RepereDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) typeRepereId!: string;
  @ApiProperty() typeRepereCode!: string;
  @ApiProperty() typeRepereLibelle!: string;
  @ApiProperty({ enum: NatureRepere }) nature!: NatureRepere;
  @ApiProperty({ description: 'Icône du type' }) icone!: string;

  @ApiProperty({ description: 'Choisie à la pose ; le type n’en porte pas' })
  couleur!: string;

  @ApiProperty({ nullable: true }) opacite!: number | null;

  @ApiProperty({
    description:
      'Géométrie normalisée : { type:"point", x, y }, { type:"rectangle", a, b } ou { type:"cercle", centre, rayon }',
    type: 'object',
    additionalProperties: true,
  })
  geometrie!: unknown;

  @ApiProperty() libelle!: string;
  @ApiProperty({ nullable: true }) note!: string | null;
  @ApiProperty({ enum: Visibilite }) visibilite!: Visibilite;
  @ApiProperty({ enum: EtatEntite }) etat!: EtatEntite;

  @ApiProperty({ description: 'Prêt à l’affichage' }) auteurLibelle!: string;
  @ApiProperty({ format: 'date-time' }) creeLe!: string;
  @ApiProperty({ format: 'date-time' }) modifieLe!: string;

  @ApiProperty({
    type: [AgentHabiliteDto],
    description:
      'Whitelist. Nécessaire dès que le repère est classé : un repère restreint est absent de la carte, pas montré muet.',
  })
  habilitations!: AgentHabiliteDto[];
}

/**
 * Géométrie d'un repère.
 *
 * `@Allow()` plutôt qu'une validation déclarative : la forme dépend de la
 * nature du type, connue à l'exécution seule. `CarteService.validerGeometrie`
 * est le seul gardien, et le seul endroit où la règle s'écrit.
 */
export class CreationRepereDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  typeRepereId!: string;

  @Allow()
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      '{ type:"point", x, y } pour un type de nature point ; { type:"rectangle", a, b } ou { type:"cercle", centre, rayon } pour une zone',
  })
  geometrie!: unknown;

  @ApiProperty({ example: 'Labo présumé — hangar 4' })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  libelle!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiProperty({
    example: '#d99a5b',
    description: 'Obligatoire : c’est le repère qui se signale, pas son type',
  })
  @IsHexColor()
  couleur!: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  opacite?: number;

  @ApiPropertyOptional({ enum: Visibilite })
  @IsOptional()
  @IsEnum(Visibilite)
  visibilite?: Visibilite;
}

export class ModificationRepereDto {
  @Allow()
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  geometrie?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  libelle?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsHexColor()
  couleur?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  opacite?: number;

  @ApiPropertyOptional({ enum: Visibilite })
  @IsOptional()
  @IsEnum(Visibilite)
  visibilite?: Visibilite;
}

// ─────────────────── Points venus des fiches ───────────────────

export class PointDeDonneeDto {
  @ApiProperty({ format: 'uuid', description: 'La donnée qui porte le point' })
  entiteId!: string;

  @ApiProperty() entiteLibelle!: string;
  @ApiProperty() typeEntiteCode!: string;

  @ApiProperty({
    description:
      'Icône à afficher : celle du type de repère choisi à la pose, sinon celle du type de donnée',
  })
  icone!: string;

  @ApiProperty({
    description: 'Couleur choisie à la pose, sinon l’accent de la centrale',
  })
  couleur!: string;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'Type de repère choisi à la pose, s’il y en a un',
  })
  typeRepereId!: string | null;

  @ApiProperty({ nullable: true }) typeRepereLibelle!: string | null;

  @ApiProperty({ description: 'Libellé du champ qui porte le point' })
  champLibelle!: string;

  @ApiProperty({ type: PointDto }) point!: PointDto;
  @ApiProperty({ minimum: 1, maximum: 4 }) fiabilite!: number;
  @ApiProperty({ enum: Visibilite }) visibilite!: Visibilite;
}
