import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EtatFait, NatureFait, Visibilite } from '@prisma/client';
import {
  Allow,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { FIABILITE_MAX, FIABILITE_MIN } from '../entites/entites.dto';

export class CreationFaitDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sujetId!: string;

  @ApiProperty({ enum: NatureFait })
  @IsEnum(NatureFait)
  nature!: NatureFait;

  @ApiPropertyOptional({ format: 'uuid', description: 'Si nature = champ' })
  @IsOptional()
  @IsUUID()
  definitionChampId?: string;

  @Allow()
  @ApiPropertyOptional({
    oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
    description: 'Si nature = champ',
  })
  @IsOptional()
  valeur?: string | number | boolean;

  @ApiPropertyOptional({ format: 'uuid', description: 'Si nature = lien' })
  @IsOptional()
  @IsUUID()
  typeLienId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Si nature = lien' })
  @IsOptional()
  @IsUUID()
  cibleId?: string;

  @ApiProperty({ example: "Rapport d'intervention n°2291" })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  source!: string;

  @ApiProperty({ minimum: FIABILITE_MIN, maximum: FIABILITE_MAX })
  @IsInt()
  @Min(FIABILITE_MIN)
  @Max(FIABILITE_MAX)
  fiabilite!: number;

  @ApiProperty({ format: 'date', example: '2026-08-07' })
  @IsDateString()
  dateConstatation!: string;

  @ApiPropertyOptional({ enum: Visibilite })
  @IsOptional()
  @IsEnum(Visibilite)
  visibilite?: Visibilite;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Dossier de saisie — le fait en hérite la visibilité',
  })
  @IsOptional()
  @IsUUID()
  dossierId?: string;
}

export class ModificationFaitDto {
  @Allow()
  @ApiPropertyOptional({
    oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
    description: 'Champ seulement — la cible d’un lien ne se corrige pas',
  })
  @IsOptional()
  valeur?: string | number | boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  source?: string;

  @ApiPropertyOptional({ minimum: FIABILITE_MIN, maximum: FIABILITE_MAX })
  @IsOptional()
  @IsInt()
  @Min(FIABILITE_MIN)
  @Max(FIABILITE_MAX)
  fiabilite?: number;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  dateConstatation?: string;

  @ApiPropertyOptional({ enum: Visibilite })
  @IsOptional()
  @IsEnum(Visibilite)
  visibilite?: Visibilite;
}

export class InfirmationDto {
  @ApiProperty({ description: 'Ce qui contredit le fait' })
  @IsString()
  @MinLength(3)
  @MaxLength(512)
  motif!: string;
}

export class FaitDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) sujetId!: string;
  @ApiProperty({ enum: NatureFait }) nature!: NatureFait;

  @ApiProperty({ nullable: true, format: 'uuid' })
  definitionChampId!: string | null;

  @ApiProperty({
    nullable: true,
    oneOf: [
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'array', items: {} },
    ],
  })
  valeur!: unknown;

  @ApiProperty({ nullable: true, format: 'uuid' })
  typeLienId!: string | null;

  @ApiProperty({ nullable: true, format: 'uuid' }) cibleId!: string | null;

  @ApiProperty() source!: string;
  @ApiProperty() fiabilite!: number;
  @ApiProperty({ format: 'date' }) dateConstatation!: string;
  @ApiProperty({ enum: EtatFait }) etat!: EtatFait;
  @ApiProperty({ enum: Visibilite }) visibilite!: Visibilite;

  @ApiProperty({
    enum: Visibilite,
    description: 'Calculée en base : la plus restrictive des quatre gardiens',
  })
  visibiliteEffective!: Visibilite;

  @ApiProperty({ nullable: true, format: 'uuid' })
  dossierId!: string | null;

  @ApiProperty({ format: 'date-time' }) creeLe!: string;
  @ApiProperty({ format: 'date-time' }) modifieLe!: string;
}
