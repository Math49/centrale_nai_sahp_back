import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { LONGUEUR_MINIMALE_MOT_DE_PASSE } from '../auth/auth.dto';

export class CreationAgentDto {
  @ApiProperty({ example: '2291' })
  @IsString()
  @Matches(/^[A-Za-z0-9-]+$/, {
    message: 'lettres, chiffres et tirets uniquement',
  })
  @MinLength(1)
  @MaxLength(64)
  matricule!: string;

  @ApiProperty({ example: 'Isadora' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  prenom!: string;

  @ApiProperty({ example: 'Morales' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  nom!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  roleId!: string;

  @ApiPropertyOptional({
    description: 'Attribut du compte, indépendant du grade RP',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  superAdmin?: boolean;

  @ApiPropertyOptional({
    description:
      "Laisser vide pour qu'un mot de passe provisoire soit engendré et renvoyé une seule fois",
    minLength: LONGUEUR_MINIMALE_MOT_DE_PASSE,
  })
  @IsOptional()
  @IsString()
  @MinLength(LONGUEUR_MINIMALE_MOT_DE_PASSE)
  @MaxLength(256)
  motDePasse?: string;
}

export class ModificationAgentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  prenom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  nom?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  actif?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  superAdmin?: boolean;
}

export class AgentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;

  @ApiProperty({
    description: "Valeur technique dérivée de l'id chez un compte anonymisé",
  })
  matricule!: string;

  @ApiProperty({ description: 'Vide chez un compte anonymisé' })
  prenom!: string;
  @ApiProperty({ description: 'Vide chez un compte anonymisé' }) nom!: string;

  @ApiProperty({
    description: "Prêt à l'affichage — « agent supprimé » si anonymisé",
  })
  libelle!: string;

  @ApiProperty({ format: 'uuid' }) roleId!: string;
  @ApiProperty() roleCode!: string;
  @ApiProperty() roleLibelle!: string;
  @ApiProperty() superAdmin!: boolean;
  @ApiProperty() actif!: boolean;
  @ApiProperty() doitChangerMdp!: boolean;
  @ApiProperty() anonymise!: boolean;

  @ApiProperty({ nullable: true, format: 'date-time' })
  anonymiseLe!: string | null;

  @ApiProperty({ format: 'date-time' }) creeLe!: string;
}

export class AgentAvecMotDePasseDto {
  @ApiProperty({ type: AgentDto })
  agent!: AgentDto;

  @ApiProperty({
    description:
      'Mot de passe provisoire, affiché une seule fois. Le compte est en changement imposé.',
    nullable: true,
  })
  motDePasseProvisoire!: string | null;
}
