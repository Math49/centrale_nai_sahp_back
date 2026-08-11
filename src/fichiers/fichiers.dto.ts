import { ApiProperty } from '@nestjs/swagger';

export class FichierDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) entiteId!: string;

  @ApiProperty({ description: 'Nom du fichier tel que l’agent l’a déposé' })
  nomOrigine!: string;

  @ApiProperty({ enum: ['image/jpeg', 'image/png', 'image/webp'] })
  mime!: string;

  @ApiProperty({
    description: 'Taille après retrait des métadonnées, en octets',
  })
  taille!: number;

  @ApiProperty({ format: 'date-time' }) deposeLe!: string;
}
