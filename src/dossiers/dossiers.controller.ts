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
import { EtatEntite } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { PERMISSIONS } from '../agents/permissions';
import { Agent, type AgentCourant } from '../auth/agent-courant';
import { Permissions } from '../auth/decorateurs';
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

@ApiTags('dossiers')
@ApiBearerAuth('jeton')
@Controller('dossiers')
export class DossiersController {
  constructor(private readonly dossiers: DossiersService) {}

  @Get()
  @Permissions(PERMISSIONS.DOSSIER_CONSULTER)
  @ApiOperation({
    summary: 'Liste des dossiers',
    description:
      'Les dossiers privés en sont absents, sans mention. Le décompte des entités suivies ne compte que le visible.',
  })
  @ApiQuery({
    name: 'archives',
    required: false,
    type: Boolean,
    description: 'Inclure les dossiers archivés. Faux par défaut.',
  })
  @ApiResponse({ status: 200, type: [DossierResumeDto] })
  lister(
    @Agent() agent: AgentCourant,
    @Query('archives', new DefaultValuePipe(false), ParseBoolPipe)
    archives: boolean,
  ): Promise<DossierResumeDto[]> {
    return this.dossiers.lister(agent, { archives });
  }

  @Get(':id')
  @Permissions(PERMISSIONS.DOSSIER_CONSULTER)
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

  @Post(':id/archiver')
  @Permissions(PERMISSIONS.DOSSIER_ARCHIVER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Archivage',
    description:
      'Rien n’est jamais supprimé : le dossier sort des écrans courants et reste entier — son suivi, ses habilitations, et les faits qui le citent comme dossier de saisie.',
  })
  @ApiResponse({ status: 200, type: PanneauDossierDto })
  archiver(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PanneauDossierDto> {
    return this.dossiers.changerEtat(agent, id, EtatEntite.archive);
  }

  @Post(':id/desarchiver')
  @Permissions(PERMISSIONS.DOSSIER_ARCHIVER)
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, type: PanneauDossierDto })
  desarchiver(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PanneauDossierDto> {
    return this.dossiers.changerEtat(agent, id, EtatEntite.actif);
  }

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
