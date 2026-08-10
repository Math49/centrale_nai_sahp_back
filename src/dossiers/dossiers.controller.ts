import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { PERMISSIONS } from '../agents/permissions';
import { Agent, type AgentCourant } from '../auth/agent-courant';
import { Permissions, SansPermission } from '../auth/decorateurs';
import {
  CreationDossierDto,
  DesignationAgentDto,
  DesignationEntiteDto,
  DossierResumeDto,
  ModificationDossierDto,
  PanneauDossierDto,
} from './dossiers.dto';
import { DossiersService } from './dossiers.service';
import { Consultation } from '../journal/decorateurs';

/**
 * Dossiers.
 *
 * Un dossier ne contient rien : il contextualise. `suivi` le relie aux entités
 * surveillées, et chaque fait retient son dossier de saisie pour en hériter la
 * visibilité. Aucune donnée n'appartient à un dossier.
 */
@ApiTags('dossiers')
@ApiBearerAuth('jeton')
@Controller('dossiers')
export class DossiersController {
  constructor(private readonly dossiers: DossiersService) {}

  @Get()
  @SansPermission()
  @ApiOperation({
    summary: 'Liste des dossiers',
    description:
      'Les dossiers privés en sont absents, sans mention. Le décompte des entités suivies ne compte que le visible.',
  })
  @ApiResponse({ status: 200, type: [DossierResumeDto] })
  lister(@Agent() agent: AgentCourant): Promise<DossierResumeDto[]> {
    return this.dossiers.lister(agent);
  }

  @Get(':id')
  @SansPermission()
  @Consultation('dossier')
  @ApiOperation({
    summary: 'Panneau de dossier',
    description:
      'Ouvrir un dossier revient à ouvrir la fiche de son entité pivot ; ce panneau est ce que la fiche affiche en plus lorsqu’on y arrive par le dossier.',
  })
  @ApiResponse({ status: 200, type: PanneauDossierDto })
  @ApiResponse({
    status: 404,
    description: 'Inconnu, ou privé sans habilitation',
  })
  panneau(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PanneauDossierDto> {
    return this.dossiers.panneau(agent, id);
  }

  @Post()
  @Permissions(PERMISSIONS.DOSSIER_CREER)
  @ApiOperation({
    summary: 'Création d’un dossier',
    description:
      'Nom, entité pivot, visibilité et note. Le pivot est suivi dès la création.',
  })
  @ApiResponse({ status: 201, type: PanneauDossierDto })
  @ApiResponse({ status: 409, description: 'Un dossier porte déjà ce nom' })
  async creer(
    @Agent() agent: AgentCourant,
    @Body() corps: CreationDossierDto,
  ): Promise<PanneauDossierDto> {
    this.dossiers.verifierDroitDeClasser(agent, corps.visibilite ?? 'public');

    const dossier = await this.dossiers.creer(agent.id, corps);
    return this.dossiers.panneau(agent, dossier.id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.DOSSIER_MODIFIER)
  @ApiResponse({ status: 200, type: PanneauDossierDto })
  modifier(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corps: ModificationDossierDto,
  ): Promise<PanneauDossierDto> {
    return this.dossiers.modifier(agent, id, corps);
  }

  // ─────────────────────────── Suivi ───────────────────────────

  @Post(':id/suivi')
  @Permissions(PERMISSIONS.DOSSIER_MODIFIER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Ajout d’une entité au suivi',
    description:
      'Aucune duplication : l’entité reste unique, une même fiche peut être suivie par plusieurs dossiers.',
  })
  async suivre(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corps: DesignationEntiteDto,
  ): Promise<void> {
    await this.dossiers.suivre(agent.id, id, corps.entiteId);
  }

  @Delete(':id/suivi/:entiteId')
  @Permissions(PERMISSIONS.DOSSIER_MODIFIER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({
    status: 409,
    description: 'L’entité pivot ne se retire pas du suivi',
  })
  nePlusSuivre(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('entiteId', ParseUUIDPipe) entiteId: string,
  ): Promise<void> {
    return this.dossiers.nePlusSuivre(agent, id, entiteId);
  }

  // ─────────────────────── Habilitations ───────────────────────

  @Post(':id/habilitations')
  @Permissions(PERMISSIONS.DOSSIER_HABILITER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Whitelist du dossier',
    description:
      'L’habilitation est nominative, jamais déduite d’un grade. Elle s’ajoute aux gardiens qu’un agent doit franchir.',
  })
  habiliter(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corps: DesignationAgentDto,
  ): Promise<void> {
    return this.dossiers.habiliter(agent.id, id, corps.agentId);
  }

  @Delete(':id/habilitations/:agentId')
  @Permissions(PERMISSIONS.DOSSIER_HABILITER)
  @HttpCode(HttpStatus.NO_CONTENT)
  retirerHabilitation(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('agentId', ParseUUIDPipe) agentId: string,
  ): Promise<void> {
    return this.dossiers.retirerHabilitation(agent.id, id, agentId);
  }
}
