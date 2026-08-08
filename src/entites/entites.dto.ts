import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EtatEntite, TypeDonnee, Visibilite } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  Allow,
  IsArray,
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
  ValidateNested,
} from 'class-validator';

/** 1 douteux · 2 à confirmer · 3 probable · 4 certain. */
export const FIABILITE_MIN = 1;
export const FIABILITE_MAX = 4;

/**
 * Source, fiabilité et date de constatation, portées par chaque fait.
 *
 * Facultatives fait par fait : le bandeau de source active de l'écran de saisie
 * en fournit les valeurs par défaut au niveau de la requête, et l'agent ne
 * corrige que les exceptions.
 */
export class ProvenanceDto {
  @ApiPropertyOptional({ example: "Rapport d'intervention n°2291" })
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

  @ApiPropertyOptional({ example: '2026-08-07', format: 'date' })
  @IsOptional()
  @IsDateString()
  dateConstatation?: string;

  @ApiPropertyOptional({ enum: Visibilite })
  @IsOptional()
  @IsEnum(Visibilite)
  visibilite?: Visibilite;
}

export class ChampSaisiDto extends ProvenanceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  definitionChampId!: string;

  // La forme attendue dépend du champ visé et ne se connaît qu'à l'exécution :
  // c'est ValidationDynamiqueService qui tranche. `@Allow()` empêche seulement
  // le pipe global de retirer la propriété au titre du whitelist.
  @Allow()
  @ApiProperty({
    description:
      'Texte, nombre, booléen ou valeur de liste, selon le type du champ',
  })
  valeur!: unknown;
}

export class LienSaisiDto extends ProvenanceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  typeLienId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  cibleId!: string;
}

export class CreationEntiteDto extends ProvenanceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  typeEntiteId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Dossier depuis lequel la saisie a lieu. Ses faits en héritent la visibilité ; l’entité, elle, ne porte que la sienne.',
  })
  @IsOptional()
  @IsUUID()
  dossierId?: string;

  @ApiPropertyOptional({
    description: 'Champ libre, sans source ni fiabilité — ce n’est pas un fait',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  note?: string;

  @ApiPropertyOptional({ type: [ChampSaisiDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChampSaisiDto)
  champs?: ChampSaisiDto[];

  @ApiPropertyOptional({ type: [LienSaisiDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LienSaisiDto)
  liens?: LienSaisiDto[];
}

export class ModificationEntiteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  note?: string;

  @ApiPropertyOptional({
    enum: Visibilite,
    description: 'Exige la permission visibilite.definir',
  })
  @IsOptional()
  @IsEnum(Visibilite)
  visibilite?: Visibilite;
}

// ───────────────────────────── Lecture ─────────────────────────────

export class FaitDeChampDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() valeur!: unknown;
  @ApiProperty() source!: string;
  @ApiProperty({ minimum: FIABILITE_MIN, maximum: FIABILITE_MAX })
  fiabilite!: number;
  @ApiProperty({ format: 'date' }) dateConstatation!: string;
  @ApiProperty({ enum: Visibilite }) visibilite!: Visibilite;

  @ApiProperty({
    enum: Visibilite,
    description:
      'La plus restrictive parmi le fait, son dossier de saisie, son sujet et sa cible',
  })
  visibiliteEffective!: Visibilite;
}

export class ChampDeFicheDto {
  @ApiProperty({ format: 'uuid' }) definitionChampId!: string;
  @ApiProperty() cle!: string;
  @ApiProperty() libelle!: string;
  @ApiProperty({ enum: TypeDonnee }) typeDonnee!: TypeDonnee;
  @ApiProperty() multiple!: boolean;

  @ApiProperty({
    description: 'Valeur projetée, celle qui s’affiche en évidence',
  })
  valeur!: unknown;

  @ApiProperty({
    type: [FaitDeChampDto],
    description:
      'Les faits qui la soutiennent. Plus d’un signale un recoupement de sources.',
  })
  faits!: FaitDeChampDto[];

  @ApiProperty({
    description: 'Plusieurs sources distinctes affirment la même valeur',
  })
  multiSources!: boolean;
}

export class ExtremiteDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() libelle!: string;
  @ApiProperty() typeCode!: string;
}

export class LienDeFicheDto {
  @ApiProperty({ format: 'uuid', description: 'Identifiant du fait' })
  faitId!: string;

  @ApiProperty({
    enum: ['direct', 'inverse'],
    description:
      'Le même fait, vu depuis l’une ou l’autre extrémité. Une seule arête existe en base.',
  })
  sens!: 'direct' | 'inverse';

  @ApiProperty({ format: 'uuid' }) typeLienId!: string;

  @ApiProperty({ description: 'Libellé lu depuis cette fiche' })
  libelle!: string;

  @ApiProperty({ type: ExtremiteDto }) autreEntite!: ExtremiteDto;
  @ApiProperty() source!: string;
  @ApiProperty() fiabilite!: number;
  @ApiProperty({ format: 'date' }) dateConstatation!: string;
  @ApiProperty({ enum: Visibilite }) visibilite!: Visibilite;
  @ApiProperty({ enum: Visibilite }) visibiliteEffective!: Visibilite;
}

export class EntiteResumeeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) typeEntiteId!: string;
  @ApiProperty() typeCode!: string;
  @ApiProperty() libelle!: string;
  @ApiProperty({ enum: Visibilite }) visibilite!: Visibilite;
  @ApiProperty({ enum: EtatEntite }) etat!: EtatEntite;
  @ApiProperty({ format: 'date-time' }) modifieLe!: string;
}

export class FicheEntiteDto extends EntiteResumeeDto {
  @ApiProperty() typeLibelle!: string;

  @ApiProperty({
    description:
      'Projection des faits **visibles par cet agent** — recomposée à la lecture, et non recopiée depuis la colonne, qui ignore la visibilité',
  })
  valeurs!: Record<string, unknown>;

  @ApiProperty({
    description:
      'Faux sur une entité restreinte non habilitée : l’objet est visible, son contenu non',
  })
  contenuLisible!: boolean;

  @ApiProperty({ nullable: true }) note!: string | null;
  @ApiProperty({ type: [ChampDeFicheDto] }) champs!: ChampDeFicheDto[];
  @ApiProperty({ type: [LienDeFicheDto] }) liens!: LienDeFicheDto[];
  @ApiProperty({ format: 'date-time' }) creeLe!: string;

  @ApiProperty({ nullable: true, format: 'uuid' })
  fusionneeVersId!: string | null;
}

export class SuggestionDoublonDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() libelle!: string;
  @ApiProperty() typeCode!: string;

  @ApiProperty({
    description: 'Similarité trigramme du libellé, entre 0 et 1',
  })
  proximite!: number;

  @ApiProperty({
    description:
      'Une valeur unique du type est identique — c’est un doublon sûr',
  })
  valeurUniqueIdentique!: boolean;
}
