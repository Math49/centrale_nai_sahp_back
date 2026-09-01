import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
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
import { Permissions } from '../auth/decorateurs';
import {
  CreationEntiteDto,
  EntiteResumeeDto,
  EvenementHistoriqueDto,
  FicheEntiteDto,
  FusionDto,
  ModificationEntiteDto,
  SuggestionDoublonDto,
} from './entites.dto';
import { DesignationAgentDto } from '../dossiers/dossiers.dto';
import { EntitesService } from './entites.service';
import { Consultation } from '../journal/decorateurs';

@ApiTags('entites')
@ApiBearerAuth('jeton')
@Controller('entites')
export class EntitesController {
  constructor(private readonly entites: EntitesService) {}

  @Get()
  @Permissions(PERMISSIONS.ENTITE_CONSULTER)
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
  @Permissions(PERMISSIONS.ENTITE_CONSULTER)
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
  @Permissions(PERMISSIONS.ENTITE_CONSULTER)
  @Consultation('entite')
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

  @Get(':id/historique')
  @Permissions(PERMISSIONS.HISTORIQUE_CONSULTER)
  @ApiOperation({
    summary: 'Onglet Historique',
    description:
      'Faits infirmés ou archivés — jamais supprimés, toujours consultables — et traces d’écriture du journal d’audit.',
  })
  @ApiResponse({ status: 200, type: [EvenementHistoriqueDto] })
  historique(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EvenementHistoriqueDto[]> {
    return this.entites.historique(agent, id);
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

  @Post(':id/fusion')
  @Permissions(PERMISSIONS.ENTITE_FUSIONNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Fusion de doublons',
    description:
      'L’entité de l’URL est absorbée par celle du corps, qui reçoit ses faits, ses fichiers, ses suivis et ses habilitations. L’absorbée reste en base, archivée, et **redirige** : un ancien lien vers elle continue de mener quelque part. La fiche renvoyée est celle qui subsiste.',
  })
  @ApiResponse({ status: 200, type: FicheEntiteDto })
  @ApiResponse({
    status: 409,
    description: 'Types différents, ou entité déjà fusionnée',
  })
  fusionner(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corps: FusionDto,
  ): Promise<FicheEntiteDto> {
    return this.entites.fusionner(agent, id, corps.versId);
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
  /**
   * Whitelist d'une donnée.
   *
   * L'habilitation existe par dossier **et par entité** — c'est la conception
   * qui le veut, parce qu'une donnée classée est un gardien à part entière.
   * Elle n'avait jamais été exposée : le modèle, le prédicat et le contexte de
   * l'agent la portaient tous, mais aucune route ne l'écrivait. Conséquence,
   * une donnée passée en restreint se fermait à tout le monde et rien ne
   * pouvait la rouvrir, pas même une habilitation sur son dossier.
   */
  @Post(':id/habilitations')
  @Permissions(PERMISSIONS.DOSSIER_HABILITER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Habiliter un agent sur une donnée',
    description:
      'Nominative, jamais déduite d’un grade. Nécessaire dès que la donnée est classée : être habilité sur le dossier qui la suit ne suffit pas, chaque gardien se franchit pour lui-même.',
  })
  @ApiResponse({ status: 204 })
  habiliter(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corps: DesignationAgentDto,
  ): Promise<void> {
    return this.entites.habiliter(agent, id, corps.agentId);
  }

  @Delete(':id/habilitations/:agentId')
  @Permissions(PERMISSIONS.DOSSIER_HABILITER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Retirer une habilitation sur une donnée' })
  @ApiResponse({ status: 204 })
  retirerHabilitation(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('agentId', ParseUUIDPipe) agentId: string,
  ): Promise<void> {
    return this.entites.retirerHabilitation(agent, id, agentId);
  }
}
