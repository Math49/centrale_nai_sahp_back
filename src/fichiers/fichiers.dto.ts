import { ApiProperty } from '@nestjs/swagger';

/**
 * Une image déposée, telle que l'API la décrit.
 *
 * Le **chemin sur le volume n'en fait pas partie** : il est opaque, et le
 * publier reviendrait à donner une porte d'entrée à ce que le contrôleur
 * protège. On télécharge par l'identifiant, jamais par le chemin.
 */
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
