import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { EtatEntite } from '@prisma/client';

import { PERMISSIONS } from '../agents/permissions';
import { Agent, type AgentCourant } from '../auth/agent-courant';
import { Permissions, SansPermission } from '../auth/decorateurs';
import {
  CreationEntiteDto,
  EntiteResumeeDto,
  FicheEntiteDto,
  ModificationEntiteDto,
  SuggestionDoublonDto,
} from './entites.dto';
import { EntitesService } from './entites.service';

@ApiTags('entites')
@ApiBearerAuth('jeton')
@Controller('entites')
export class EntitesController {
  constructor(private readonly entites: EntitesService) {}

  @Get()
  @SansPermission()
  @ApiOperation({
    summary: 'Annuaire filtrable',
    description:
      'Les entités privées en sont absentes, sans mention — un décompte manquant révélerait leur existence.',
  })
  @ApiQuery({ name: 'type', required: false, format: 'uuid' })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'etat', required: false, enum: EtatEntite })
  @ApiResponse({ status: 200, type: [EntiteResumeeDto] })
  lister(
    @Agent() agent: AgentCourant,
    @Query('type') typeEntiteId?: string,
    @Query('q') q?: string,
    @Query('etat', new ParseEnumPipe(EtatEntite, { optional: true }))
    etat?: EtatEntite,
    @Query('limite', new DefaultValuePipe(50), ParseIntPipe) limite = 50,
    @Query('decalage', new DefaultValuePipe(0), ParseIntPipe) decalage = 0,
  ): Promise<EntiteResumeeDto[]> {
    return this.entites.lister(agent, {
      typeEntiteId,
      q,
      etat,
      limite: Math.min(limite, 200),
      decalage,
    });
  }

  @Get('similaires')
  @SansPermission()
  @ApiOperation({
    summary: 'Détection de doublons à la frappe',
    description:
      'Similarité trigramme du libellé, et identité exacte d’une valeur unique du type. Ne propose jamais une entité privée.',
  })
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'type', required: false, format: 'uuid' })
  @ApiResponse({ status: 200, type: [SuggestionDoublonDto] })
  similaires(
    @Agent() agent: AgentCourant,
    @Query('q') q: string,
    @Query('type') typeEntiteId?: string,
  ): Promise<SuggestionDoublonDto[]> {
    return this.entites.similaires(agent, q ?? '', typeEntiteId);
  }

  @Get(':id')
  @SansPermission()
  @ApiOperation({
    summary: 'Fiche assemblée',
    description:
      'Champs projetés depuis les seuls faits visibles par l’agent, et liens lus depuis cette fiche — un lien est une arête unique, vue des deux côtés.',
  })
  @ApiResponse({ status: 200, type: FicheEntiteDto })
  @ApiResponse({
    status: 404,
    description:
      'Inconnue, ou privée sans habilitation — jamais 403, qui confirmerait son existence',
  })
  lire(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FicheEntiteDto> {
    return this.entites.lire(agent, id);
  }

  @Post()
  @Permissions(PERMISSIONS.ENTITE_CREER)
  @ApiOperation({
    summary: 'Création d’une entité et de ses premiers faits',
    description:
      'Source, fiabilité et date de constatation données au niveau de la requête servent de valeurs par défaut à chaque fait — c’est le bandeau de source active.',
  })
  @ApiResponse({ status: 201, type: FicheEntiteDto })
  @ApiResponse({ status: 409, description: 'Valeur unique déjà attribuée' })
  creer(
    @Agent() agent: AgentCourant,
    @Body() corps: CreationEntiteDto,
  ): Promise<FicheEntiteDto> {
    return this.entites.creer(agent, corps);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.ENTITE_MODIFIER)
  @ApiResponse({ status: 200, type: FicheEntiteDto })
  modifier(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corps: ModificationEntiteDto,
  ): Promise<FicheEntiteDto> {
    return this.entites.modifier(agent, id, corps);
  }

  @Post(':id/annuler-creation')
  @Permissions(PERMISSIONS.ENTITE_CREER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Annulation d’une saisie en cascade',
    description:
      'Retire une entité que le sous-formulaire venait de persister et que l’agent abandonne. Réservée à son auteur, dans l’heure, sur une entité que rien d’autre ne désigne — au-delà, seul l’archivage sort.',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({
    status: 409,
    description: 'Trop ancienne, déjà référencée, ou saisie par un autre agent',
  })
  annulerCreation(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.entites.annulerCreation(agent, id);
  }

  @Post(':id/archiver')
  @Permissions(PERMISSIONS.ENTITE_ARCHIVER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Archivage',
    description:
      'Rien n’est jamais supprimé : l’entité sort des écrans courants et reste consultable, ses faits intacts.',
  })
  @ApiResponse({ status: 200, type: FicheEntiteDto })
  archiver(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FicheEntiteDto> {
    return this.entites.changerEtat(agent, id, EtatEntite.archive);
  }

  @Post(':id/desarchiver')
  @Permissions(PERMISSIONS.ENTITE_DESARCHIVER)
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, type: FicheEntiteDto })
  desarchiver(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FicheEntiteDto> {
    return this.entites.changerEtat(agent, id, EtatEntite.actif);
  }
}
