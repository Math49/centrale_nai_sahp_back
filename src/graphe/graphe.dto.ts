import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Visibilite } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class NoeudGrapheDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() libelle!: string;
  @ApiProperty() typeCode!: string;
  @ApiProperty({ format: 'uuid' }) typeEntiteId!: string;
  @ApiProperty({ enum: Visibilite }) visibilite!: Visibilite;

  @ApiProperty({
    description:
      'Voisins atteignables mais non affichés — le badge d’expansion. Ne compte jamais ce qui est masqué à cet agent.',
  })
  voisinsNonAffiches!: number;

  @ApiProperty({
    description:
      'Relie plusieurs entités appartenant à des dossiers différents',
  })
  recurrence!: boolean;

  @ApiProperty({ nullable: true }) x!: number | null;
  @ApiProperty({ nullable: true }) y!: number | null;
}

export class AreteGrapheDto {
  @ApiProperty({ format: 'uuid', description: 'Identifiant du fait' })
  id!: string;

  @ApiProperty({ format: 'uuid' }) sujetId!: string;
  @ApiProperty({ format: 'uuid' }) cibleId!: string;
  @ApiProperty({ format: 'uuid' }) typeLienId!: string;
  @ApiProperty() libelle!: string;

  @ApiProperty({ minimum: 1, maximum: 4 }) fiabilite!: number;
}

export class VoisinageDto {
  @ApiProperty({ type: [NoeudGrapheDto] }) noeuds!: NoeudGrapheDto[];
  @ApiProperty({ type: [AreteGrapheDto] }) aretes!: AreteGrapheDto[];
}

export class CheminDto {
  @ApiProperty({ type: [NoeudGrapheDto] }) noeuds!: NoeudGrapheDto[];
  @ApiProperty({ type: [AreteGrapheDto] }) aretes!: AreteGrapheDto[];

  @ApiProperty({ description: 'Nombre de sauts' }) longueur!: number;

  @ApiProperty({
    minimum: 1,
    maximum: 4,
    description:
      'La fiabilité du chemin est celle de son maillon le plus faible',
  })
  maillonLeFaible!: number;
}

export class CheminsDto {
  @ApiProperty({
    type: CheminDto,
    nullable: true,
    description: 'Le trajet le plus court. Nul si aucun chemin n’existe.',
  })
  plusCourt!: CheminDto | null;

  @ApiProperty({
    type: CheminDto,
    nullable: true,
    description:
      'Le trajet dont le maillon le plus faible est le plus élevé. Nul lorsqu’il coïncide avec le plus court — un seul est alors affiché.',
  })
  plusSolide!: CheminDto | null;
}

export class PositionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  entiteId!: string;

  @ApiProperty()
  @IsNumber()
  x!: number;

  @ApiProperty()
  @IsNumber()
  y!: number;
}

export class DispositionDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Disposition propre à ce dossier. Absent : disposition globale.',
  })
  @IsOptional()
  @IsUUID()
  dossierId?: string;

  @ApiProperty({ type: [PositionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PositionDto)
  positions!: PositionDto[];
}
