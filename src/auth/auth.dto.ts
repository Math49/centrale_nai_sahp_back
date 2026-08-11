import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export const LONGUEUR_MINIMALE_MOT_DE_PASSE = 12;

export class ConnexionDto {
  @ApiProperty({ example: '2291' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  matricule!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  motDePasse!: string;
}

export class ChangementMotDePasseDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  ancien!: string;

  @ApiProperty({ minLength: LONGUEUR_MINIMALE_MOT_DE_PASSE })
  @IsString()
  @MinLength(LONGUEUR_MINIMALE_MOT_DE_PASSE)
  @MaxLength(256)
  nouveau!: string;
}

export class AgentConnecteDto {
  @ApiProperty() id!: string;
  @ApiProperty() matricule!: string;
  @ApiProperty() prenom!: string;
  @ApiProperty() nom!: string;
  @ApiProperty() roleCode!: string;
  @ApiProperty() superAdmin!: boolean;

  @ApiProperty({
    description:
      "Tant qu'il vaut true, seules /auth/moi et /auth/mot-de-passe répondent",
  })
  doitChangerMdp!: boolean;

  @ApiProperty({
    type: [String],
    description:
      'Codes de permissions du grade. Un super-admin contourne ce jeu.',
  })
  permissions!: string[];
}

export class JetonDto {
  @ApiProperty({ description: 'À placer en en-tête Authorization: Bearer …' })
  jeton!: string;

  @ApiProperty({ type: AgentConnecteDto })
  agent!: AgentConnecteDto;
}
