import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { PERMISSIONS } from '../agents/permissions';
import { Agent, type AgentCourant } from '../auth/agent-courant';
import { Permissions, SansPermission } from '../auth/decorateurs';
import { FichierDto } from './fichiers.dto';
import { FichiersService } from './fichiers.service';

@ApiTags('fichiers')
@ApiBearerAuth('jeton')
@Controller()
export class FichiersController {
  constructor(private readonly fichiers: FichiersService) {}

  @Get('entites/:id/fichiers')
  @SansPermission()
  @ApiOperation({
    summary: 'Images d’une entité',
    description:
      'Les images d’une fiche inaccessible sont introuvables — 404, jamais 403.',
  })
  @ApiResponse({ status: 200, type: [FichierDto] })
  lister(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FichierDto[]> {
    return this.fichiers.lister(agent, id);
  }

  @Post('entites/:id/fichiers')
  @Permissions(PERMISSIONS.FAIT_CREER)
  @UseInterceptors(FileInterceptor('fichier'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fichier: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({
    summary: 'Dépôt d’une image',
    description:
      'Le type est vérifié **sur le contenu** et non sur l’extension, la taille est plafonnée, et les métadonnées — EXIF, GPS, commentaires — sont retirées sans réencoder l’image.',
  })
  @ApiResponse({ status: 201, type: FichierDto })
  @ApiResponse({ status: 400, description: 'Format refusé ou fichier vide' })
  @ApiResponse({ status: 413, description: 'Au-delà du plafond de taille' })
  deposer(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() depot: Express.Multer.File | undefined,
  ): Promise<FichierDto> {
    return this.fichiers.deposer(agent, id, {
      nomOrigine: depot?.originalname ?? 'sans nom',
      octets: depot?.buffer ?? Buffer.alloc(0),
    });
  }

  @Delete('fichiers/:id')
  @Permissions(PERMISSIONS.FAIT_CREER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Suppression d’une image',
    description:
      'L’image disparaît du volume et de la base, sauf si un fait l’utilise encore.',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({
    status: 404,
    description: 'Fichier inconnu ou fiche inaccessible',
  })
  @ApiResponse({
    status: 409,
    description: 'Image encore utilisée par un fait',
  })
  supprimer(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.fichiers.supprimer(agent, id);
  }

  @Get('fichiers/:id')
  @SansPermission()
  @ApiOperation({
    summary: 'Téléchargement authentifié',
    description:
      'Aucun dossier n’est servi en statique : les droits sont vérifiés avant que l’octet ne parte.',
  })
  @ApiResponse({ status: 200, description: 'L’image' })
  @ApiResponse({ status: 404, description: 'Inconnu, ou fiche inaccessible' })
  async telecharger(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() reponse: Response,
  ): Promise<void> {
    const fichier = await this.fichiers.telecharger(agent, id);

    reponse.setHeader('Content-Type', fichier.mime);
    reponse.setHeader('Content-Length', fichier.octets.length);

    reponse.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fichier.nomOrigine)}"`,
    );
    reponse.setHeader('X-Content-Type-Options', 'nosniff');
    reponse.setHeader('Cache-Control', 'private, max-age=0, no-store');

    reponse.end(fichier.octets);
  }
}
