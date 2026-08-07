import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { Publique } from '../auth/decorateurs';
import { PrismaService } from '../prisma/prisma.service';
import { SanteReponseDto } from './sante.dto';

/**
 * Route de santé.
 *
 * Avec la connexion, l'une des deux seules routes publiques du projet. Le
 * `@Publique()` ci-dessous est une exception explicite à la règle du refus par
 * défaut : une sonde d'infrastructure ne détient pas de jeton. Il ne divulgue
 * rien de plus que l'existence du service et l'état de sa base.
 */
@ApiTags('sante')
@Controller('sante')
@Publique()
export class SanteController {
  private readonly demarrage = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "État de l'API et de sa base" })
  @ApiResponse({ status: 200, type: SanteReponseDto })
  @ApiResponse({
    status: 503,
    type: SanteReponseDto,
    description: 'Base injoignable',
  })
  async lire(
    @Res({ passthrough: true }) reponse: Response,
  ): Promise<SanteReponseDto> {
    const base = await this.prisma.verifierConnexion();

    if (!base) {
      reponse.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return {
      etat: base ? 'operationnel' : 'degrade',
      version: process.env.npm_package_version ?? '0.1.0',
      base,
      demarre_depuis: Math.round((Date.now() - this.demarrage) / 1000),
      horodatage: new Date().toISOString(),
    };
  }
}
