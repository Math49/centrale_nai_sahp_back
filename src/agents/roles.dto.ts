import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RoleDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'senior_investigator' }) code!: string;
  @ApiProperty({ example: 'Senior Investigator' }) libelle!: string;
  @ApiProperty({ type: [String] }) permissions!: string[];
  @ApiProperty() ordre!: number;
}

export class ModificationRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  libelle?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Jeu complet, il remplace le précédent',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  permissions?: string[];
}

export class PermissionCatalogueeDto {
  @ApiProperty({ example: 'entite.archiver' }) code!: string;
  @ApiProperty({ example: 'Archiver une entité' }) libelle!: string;
}
