import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EtatEntite, Visibilite } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreationDossierDto {
  @ApiProperty({ example: 'Madrina' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  nom!: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'Obligatoire : un dossier sans entité pivot n’existe pas. Ouvrir le dossier revient à ouvrir sa fiche.',
  })
  @IsUUID()
  entitePivotId!: string;

  @ApiPropertyOptional({ enum: Visibilite })
  @IsOptional()
  @IsEnum(Visibilite)
  visibilite?: Visibilite;

  @ApiPropertyOptional({
    description: 'Champ libre, sans source ni fiabilité — ce n’est pas un fait',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  note?: string;
}

export class ModificationDossierDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  nom?: string;

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

export class DesignationAgentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  agentId!: string;
}

export class DesignationEntiteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  entiteId!: string;
}

export class DossierResumeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nom!: string;
  @ApiProperty({ enum: Visibilite }) visibilite!: Visibilite;
  @ApiProperty({ enum: EtatEntite }) etat!: EtatEntite;

  @ApiProperty({ format: 'uuid' }) entitePivotId!: string;
  @ApiProperty() entitePivotLibelle!: string;

  @ApiProperty({
    description: 'Entités suivies **visibles par cet agent**',
  })
  nombreSuivis!: number;

  @ApiProperty({ format: 'date-time' }) creeLe!: string;
}

export class EntiteSuivieDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() libelle!: string;
  @ApiProperty() typeCode!: string;
  @ApiProperty() estPivot!: boolean;
  @ApiProperty({ format: 'date-time' }) ajouteLe!: string;
}

export class AgentHabiliteDto {
  @ApiProperty({ format: 'uuid' }) agentId!: string;
  @ApiProperty({ description: '« agent supprimé » si le compte est anonymisé' })
  libelle!: string;
  @ApiProperty() matricule!: string;
  @ApiProperty({ format: 'date-time' }) accordeLe!: string;
}

export class PanneauDossierDto extends DossierResumeDto {
  @ApiProperty({
    description:
      'Faux sur un dossier restreint sans habilitation : le nom s’affiche, le reste non',
  })
  contenuLisible!: boolean;

  @ApiProperty({ nullable: true }) note!: string | null;

  @ApiProperty({ type: [EntiteSuivieDto] }) suivis!: EntiteSuivieDto[];

  @ApiProperty({
    type: [AgentHabiliteDto],
    description: 'Whitelist. Vide tant que le contenu n’est pas lisible.',
  })
  habilitations!: AgentHabiliteDto[];
}

export class RattachementDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nom!: string;
  @ApiProperty({ enum: Visibilite }) visibilite!: Visibilite;
  @ApiProperty() estPivot!: boolean;
}
