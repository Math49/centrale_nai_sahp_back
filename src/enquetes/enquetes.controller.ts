import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
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
import { Permissions, SuperAdminSeul } from '../auth/decorateurs';
import { DesignationAgentDto } from '../dossiers/dossiers.dto';
import { OrdreDto } from '../referentiel/referentiel.dto';
import {
  CarteEnqueteDto,
  ColonneKanbanDto,
  CreationCarteDto,
  CreationColonneDto,
  DeplacementCarteDto,
  ModificationCarteDto,
  ModificationColonneDto,
} from './enquetes.dto';
import { EnquetesService } from './enquetes.service';

@ApiTags('enquetes')
@ApiBearerAuth('jeton')
@Controller('enquetes')
export class EnquetesController {
  constructor(private readonly enquetes: EnquetesService) {}

  // ────────────────────────── Colonnes ──────────────────────────

  @Get('colonnes')
  @Permissions(PERMISSIONS.KANBAN_CONSULTER)
  @ApiOperation({
    summary: 'Colonnes du tableau',
    description:
      'Lisibles par qui consulte le tableau : sans elles, il n’y a rien à afficher.',
  })
  @ApiResponse({ status: 200, type: [ColonneKanbanDto] })
  listerColonnes(): Promise<ColonneKanbanDto[]> {
    return this.enquetes.listerColonnes();
  }

  @Post('colonnes')
  @SuperAdminSeul()
  @ApiOperation({
    summary: 'Création d’une colonne',
    description:
      'L’état d’avancement d’une enquête est une convention de service : sa configuration relève du super-admin, comme le reste du modèle.',
  })
  @ApiResponse({ status: 201, type: ColonneKanbanDto })
  @ApiResponse({ status: 409, description: 'Code déjà utilisé' })
  creerColonne(
    @Agent() agent: AgentCourant,
    @Body() corps: CreationColonneDto,
  ): Promise<ColonneKanbanDto> {
    return this.enquetes.creerColonne(agent.id, corps);
  }

  @Patch('colonnes/:id')
  @SuperAdminSeul()
  @ApiResponse({ status: 200, type: ColonneKanbanDto })
  modifierColonne(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corps: ModificationColonneDto,
  ): Promise<ColonneKanbanDto> {
    return this.enquetes.modifierColonne(agent.id, id, corps);
  }

  @Delete('colonnes/:id')
  @SuperAdminSeul()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 409, description: 'Colonne encore utilisée' })
  supprimerColonne(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.enquetes.supprimerColonne(agent.id, id);
  }

  @Post('colonnes/ordre')
  @SuperAdminSeul()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204 })
  ordonnerColonnes(
    @Agent() agent: AgentCourant,
    @Body() corps: OrdreDto,
  ): Promise<void> {
    return this.enquetes.ordonnerColonnes(agent.id, corps.ids);
  }

  // ─────────────────────────── Cartes ───────────────────────────

  @Get('cartes')
  @Permissions(PERMISSIONS.KANBAN_CONSULTER)
  @ApiOperation({
    summary: 'Cartes visibles',
    description:
      'Une carte classée hors de portée n’apparaît pas — pas même anonyme : son titre nomme souvent ce qu’un dossier restreint protège.',
  })
  @ApiQuery({ name: 'archives', required: false })
  @ApiResponse({ status: 200, type: [CarteEnqueteDto] })
  listerCartes(
    @Agent() agent: AgentCourant,
    @Query('archives', new DefaultValuePipe(false), ParseBoolPipe)
    archives: boolean,
  ): Promise<CarteEnqueteDto[]> {
    return this.enquetes.listerCartes(agent, { archives });
  }

  @Post('cartes')
  @Permissions(PERMISSIONS.KANBAN_ECRIRE)
  @ApiOperation({
    summary: 'Création d’une carte',
    description:
      'Les comptes assignés disent qui s’en occupe. **Ils n’ouvrent aucun accès** : une carte classée demande en plus une habilitation nominative.',
  })
  @ApiResponse({ status: 201, type: CarteEnqueteDto })
  creerCarte(
    @Agent() agent: AgentCourant,
    @Body() corps: CreationCarteDto,
  ): Promise<CarteEnqueteDto> {
    return this.enquetes.creerCarte(agent, corps);
  }

  @Patch('cartes/:id')
  @Permissions(PERMISSIONS.KANBAN_ECRIRE)
  @ApiResponse({ status: 200, type: CarteEnqueteDto })
  modifierCarte(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corps: ModificationCarteDto,
  ): Promise<CarteEnqueteDto> {
    return this.enquetes.modifierCarte(agent, id, corps);
  }

  @Post('cartes/:id/deplacer')
  @Permissions(PERMISSIONS.KANBAN_ECRIRE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Déplacer une carte',
    description:
      'Vers une autre colonne ou dans la sienne. Les rangs des colonnes touchées sont réécrits en entier.',
  })
  @ApiResponse({ status: 200, type: CarteEnqueteDto })
  deplacerCarte(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corps: DeplacementCarteDto,
  ): Promise<CarteEnqueteDto> {
    return this.enquetes.deplacerCarte(agent, id, corps);
  }

  @Post('cartes/:id/archiver')
  @Permissions(PERMISSIONS.KANBAN_ARCHIVER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Archiver une carte',
    description:
      'Archivage, jamais suppression : une carte raconte une décision de travail, et cela se relit.',
  })
  @ApiResponse({ status: 200, type: CarteEnqueteDto })
  archiver(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CarteEnqueteDto> {
    return this.enquetes.changerEtat(agent, id, EtatEntite.archive);
  }

  @Post('cartes/:id/desarchiver')
  @Permissions(PERMISSIONS.KANBAN_ARCHIVER)
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, type: CarteEnqueteDto })
  desarchiver(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CarteEnqueteDto> {
    return this.enquetes.changerEtat(agent, id, EtatEntite.actif);
  }

  @Post('cartes/:id/habilitations')
  @Permissions(PERMISSIONS.DOSSIER_HABILITER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Habiliter un agent sur une carte',
    description:
      'Le seul geste qui ouvre l’accès. Assigner ne suffit pas, et c’est délibéré.',
  })
  @ApiResponse({ status: 204 })
  habiliter(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corps: DesignationAgentDto,
  ): Promise<void> {
    return this.enquetes.habiliter(agent, id, corps.agentId);
  }

  @Delete('cartes/:id/habilitations/:agentId')
  @Permissions(PERMISSIONS.DOSSIER_HABILITER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204 })
  retirerHabilitation(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('agentId', ParseUUIDPipe) agentId: string,
  ): Promise<void> {
    return this.enquetes.retirerHabilitation(agent, id, agentId);
  }
}
