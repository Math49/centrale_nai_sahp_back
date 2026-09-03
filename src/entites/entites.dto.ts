import {
  ApiProperty,
  ApiPropertyOptional,
  type ApiPropertyOptions,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { EtatEntite, TypeDonnee, Visibilite } from '@prisma/client';

import { AgentHabiliteDto, RattachementDto } from '../dossiers/dossiers.dto';
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

export const FIABILITE_MIN = 1;
export const FIABILITE_MAX = 4;

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

/**
 * Schéma d'un point de carte, pour le contrat OpenAPI.
 *
 * Déclaré une fois et réutilisé : sans lui, le contrat annoncerait seulement
 * « texte, nombre ou booléen » et le client typé du front n'aurait aucune idée
 * qu'un objet peut arriver là. La contrainte réelle est tenue par
 * `ValidationDynamiqueService`, qui refuse tout ce qui n'est pas un point sur
 * un champ de type carte — ceci n'est que la description.
 */
/** Un point du plan, en coordonnées normalisées. */
export interface PointCarte {
  x: number;
  y: number;
}

export const SCHEMA_POINT: SchemaObject = {
  type: 'object',
  description: 'Point de carte, coordonnées normalisées entre 0 et 1',
  properties: {
    x: { type: 'number', minimum: 0, maximum: 1 },
    y: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['x', 'y'],
} as const;

export class ChampSaisiDto extends ProvenanceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  definitionChampId!: string;

  @Allow()
  @ApiProperty({
    oneOf: [
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      SCHEMA_POINT,
    ],
    description:
      'Texte, nombre, booléen, valeur de liste ou point de carte, selon le type du champ',
  })
  valeur!: string | number | boolean | PointCarte;
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

export class FusionDto {
  @ApiProperty({ format: 'uuid', description: 'La fiche qui subsiste' })
  @IsUUID()
  versId!: string;
}

const VALEUR_LUE: ApiPropertyOptions = {
  nullable: true,
  oneOf: [
    { type: 'string' },
    { type: 'number' },
    { type: 'boolean' },
    SCHEMA_POINT,
    { type: 'array', items: {} },
  ],
};

export class FaitDeChampDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty(VALEUR_LUE) valeur!: unknown;
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
    ...VALEUR_LUE,
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

export class OngletPeupleDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Membres' }) libelle!: string;
  @ApiProperty() ordre!: number;

  @ApiProperty({
    description:
      'Ne compte que les liens visibles par cet agent — un compteur exhaustif révélerait ce qui est masqué',
  })
  compteur!: number;

  @ApiProperty({ type: [LienDeFicheDto] }) liens!: LienDeFicheDto[];
}

export class EvenementHistoriqueDto {
  @ApiProperty() id!: string;

  @ApiProperty({
    enum: ['fait', 'modification'],
    description:
      'Un fait sorti du graphe actif, ou une trace d’écriture du journal d’audit',
  })
  nature!: 'fait' | 'modification';

  @ApiProperty() libelle!: string;

  @ApiProperty({ nullable: true }) source!: string | null;
  @ApiProperty({ nullable: true }) fiabilite!: number | null;

  @ApiProperty({
    nullable: true,
    description: '« agent supprimé » lorsque le compte a été anonymisé',
  })
  auteur!: string | null;

  @ApiProperty({ format: 'date-time' }) survenuLe!: string;
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

  @ApiProperty({
    type: [RattachementDto],
    description:
      'Dossiers qui suivent cette entité, filtrés. Une entité peut appartenir à plusieurs dossiers, et la fiche l’indique.',
  })
  dossiers!: RattachementDto[];

  @ApiProperty({ type: [ChampDeFicheDto] }) champs!: ChampDeFicheDto[];

  @ApiProperty({
    type: [OngletPeupleDto],
    description:
      'Onglets configurés pour ce type d’entité, déjà peuplés de leurs liens',
  })
  onglets!: OngletPeupleDto[];

  @ApiProperty({
    type: [LienDeFicheDto],
    description:
      'Liens qu’aucun onglet ne regroupe — ils resteraient invisibles sinon, ce qui ferait passer une erreur de configuration pour une absence de donnée',
  })
  liensHorsOnglet!: LienDeFicheDto[];

  @ApiProperty({
    type: [LienDeFicheDto],
    description: 'Tous les liens visibles, à plat',
  })
  liens!: LienDeFicheDto[];
  @ApiProperty({ format: 'date-time' }) creeLe!: string;

  @ApiProperty({ nullable: true, format: 'uuid' })
  fusionneeVersId!: string | null;

  @ApiProperty({
    type: [AgentHabiliteDto],
    description:
      'Whitelist de la donnée. Nécessaire dès qu’elle est classée : chaque gardien se franchit pour lui-même, et l’habilitation sur un dossier n’en ouvre pas les données.',
  })
  habilitations!: AgentHabiliteDto[];
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
