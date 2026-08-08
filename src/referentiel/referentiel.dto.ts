import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SensLien, TypeDonnee } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const CODE = /^[a-z][a-z0-9_]*$/;
const MESSAGE_CODE =
  'minuscules, chiffres et tirets bas, commençant par une lettre';

// ───────────────────────────── Lecture ─────────────────────────────

export class DefinitionChampDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) typeEntiteId!: string;
  @ApiProperty({ example: 'plaque' }) cle!: string;
  @ApiProperty({ example: 'Plaque' }) libelle!: string;
  @ApiProperty({ enum: TypeDonnee }) typeDonnee!: TypeDonnee;
  @ApiProperty() obligatoire!: boolean;
  @ApiProperty() estUnique!: boolean;
  @ApiProperty() multiple!: boolean;

  @ApiProperty({
    type: [String],
    nullable: true,
    description: 'Valeurs autorisées, pour une liste fermée uniquement',
  })
  options!: string[] | null;

  @ApiProperty() ordre!: number;
}

export class OngletTypeLienDto {
  @ApiProperty({ format: 'uuid' }) typeLienId!: string;

  @ApiProperty({
    enum: SensLien,
    description:
      "« inverse » affiche le lien vu de l'autre extrémité : l'onglet Membres du groupe montre le côté inverse de « membre de »",
  })
  sens!: SensLien;

  @ApiProperty() ordre!: number;
}

export class OngletDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) typeEntiteId!: string;
  @ApiProperty({ example: 'Membres' }) libelle!: string;
  @ApiProperty() ordre!: number;
  @ApiProperty({ type: [OngletTypeLienDto] }) typesLiens!: OngletTypeLienDto[];
}

export class TypeEntiteDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'vehicule' }) code!: string;
  @ApiProperty({ example: 'Véhicule' }) libelle!: string;
  @ApiProperty({ example: 'Véhicules' }) libellePluriel!: string;
  @ApiProperty({ example: 'car' }) icone!: string;
  @ApiProperty({ example: '{plaque}' }) modeleLibelle!: string;
  @ApiProperty() ordre!: number;
  @ApiProperty({ type: [DefinitionChampDto] }) champs!: DefinitionChampDto[];
  @ApiProperty({ type: [OngletDto] }) onglets!: OngletDto[];
}

export class TypeLienDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'proprietaire_de' }) code!: string;
  @ApiProperty({ example: 'propriétaire de' }) libelle!: string;
  @ApiProperty({ example: 'appartient à' }) libelleInverse!: string;
  @ApiProperty({ format: 'uuid' }) typeEntiteSourceId!: string;
  @ApiProperty({ format: 'uuid' }) typeEntiteCibleId!: string;
  @ApiProperty() multiple!: boolean;
  @ApiProperty() ordre!: number;
}

export class ReferentielDto {
  @ApiProperty({ type: [TypeEntiteDto] }) typesEntites!: TypeEntiteDto[];
  @ApiProperty({ type: [TypeLienDto] }) typesLiens!: TypeLienDto[];
}

// ───────────────────────────── Écriture ─────────────────────────────

export class CreationTypeEntiteDto {
  @ApiProperty({ example: 'vehicule' })
  @IsString()
  @Matches(CODE, { message: MESSAGE_CODE })
  @MaxLength(64)
  code!: string;

  @ApiProperty({ example: 'Véhicule' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  libelle!: string;

  @ApiProperty({ example: 'Véhicules' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  libellePluriel!: string;

  @ApiProperty({ example: 'car', description: "Nom d'icône du design system" })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  icone!: string;

  @ApiProperty({
    example: '{plaque}',
    description:
      'Gabarit de libellé, citant des clés de champs entre accolades',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  modeleLibelle!: string;
}

export class ModificationTypeEntiteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  libelle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  libellePluriel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  icone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  modeleLibelle?: string;
}

export class CreationChampDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  typeEntiteId!: string;

  @ApiProperty({ example: 'plaque' })
  @IsString()
  @Matches(CODE, { message: MESSAGE_CODE })
  @MaxLength(64)
  cle!: string;

  @ApiProperty({ example: 'Plaque' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  libelle!: string;

  @ApiProperty({ enum: TypeDonnee })
  @IsEnum(TypeDonnee)
  typeDonnee!: TypeDonnee;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  obligatoire?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  estUnique?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  multiple?: boolean;

  @ApiPropertyOptional({
    type: [String],
    description: 'Obligatoire et réservé au type « liste »',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayNotEmpty()
  @ArrayUnique()
  options?: string[];
}

export class ModificationChampDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  libelle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  obligatoire?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  estUnique?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  multiple?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayNotEmpty()
  @ArrayUnique()
  options?: string[];
}

export class CreationTypeLienDto {
  @ApiProperty({ example: 'proprietaire_de' })
  @IsString()
  @Matches(CODE, { message: MESSAGE_CODE })
  @MaxLength(64)
  code!: string;

  @ApiProperty({ example: 'propriétaire de' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  libelle!: string;

  @ApiProperty({
    example: 'appartient à',
    description: 'Le même lien, lu depuis la cible',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  libelleInverse!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  typeEntiteSourceId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  typeEntiteCibleId!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  multiple?: boolean;
}

export class ModificationTypeLienDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  libelle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  libelleInverse?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  multiple?: boolean;
}

export class CreationOngletDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  typeEntiteId!: string;

  @ApiProperty({ example: 'Membres' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  libelle!: string;
}

export class ModificationOngletDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  libelle?: string;
}

export class LienDOngletDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  typeLienId!: string;

  @ApiProperty({ enum: SensLien })
  @IsEnum(SensLien)
  sens!: SensLien;
}

export class CompositionOngletDto {
  @ApiProperty({
    type: [LienDOngletDto],
    description: "Jeu complet, dans l'ordre voulu. Il remplace le précédent.",
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LienDOngletDto)
  typesLiens!: LienDOngletDto[];
}

export class OrdreDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: "Identifiants dans l'ordre voulu. Le jeu doit être complet.",
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  ids!: string[];
}

export class ApercuGabaritDto {
  @ApiProperty({ example: '{prenom} {nom}' })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  modeleLibelle!: string;
}

export class ResultatApercuDto {
  @ApiProperty({ example: 'Tyron Banks' }) apercu!: string;
  @ApiProperty({ type: [String] }) clesCitees!: string[];
}

/** Utilisé par les écrans d'administration pour proposer un ordre. */
export class PositionDto {
  @ApiProperty()
  @IsInt()
  @Min(0)
  @Max(10_000)
  ordre!: number;
}
