import { ApiProperty } from '@nestjs/swagger';

export class SanteReponseDto {
  @ApiProperty({
    enum: ['operationnel', 'degrade'],
    description: '« degrade » dès que la base ne répond pas',
  })
  etat!: 'operationnel' | 'degrade';

  @ApiProperty({ description: 'Version du paquet applicatif' })
  version!: string;

  @ApiProperty({ description: 'La base PostgreSQL répond' })
  base!: boolean;

  @ApiProperty({ description: 'Secondes écoulées depuis le démarrage' })
  demarre_depuis!: number;

  @ApiProperty({ format: 'date-time' })
  horodatage!: string;
}
