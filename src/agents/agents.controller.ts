import {
  Body,
  Controller,
  DefaultValuePipe,
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

import { Agent, type AgentCourant } from '../auth/agent-courant';
import { Permissions } from '../auth/decorateurs';
import {
  AgentAvecMotDePasseDto,
  AgentDto,
  CreationAgentDto,
  ModificationAgentDto,
} from './agents.dto';
import { AgentsService } from './agents.service';
import { PERMISSIONS } from './permissions';

@ApiTags('agents')
@ApiBearerAuth('jeton')
@Controller('agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get()
  @Permissions(PERMISSIONS.AGENT_GERER)
  @ApiOperation({ summary: 'Liste des comptes' })
  @ApiQuery({
    name: 'anonymises',
    required: false,
    description: 'Inclure les comptes anonymisés',
  })
  @ApiResponse({ status: 200, type: [AgentDto] })
  lister(
    @Query('anonymises', new DefaultValuePipe(false), ParseBoolPipe)
    anonymises: boolean,
  ): Promise<AgentDto[]> {
    return this.agents.lister(anonymises);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.AGENT_GERER)
  @ApiOperation({ summary: "Fiche d'un compte" })
  @ApiResponse({ status: 200, type: AgentDto })
  lire(@Param('id', ParseUUIDPipe) id: string): Promise<AgentDto> {
    return this.agents.lire(id);
  }

  @Post()
  @Permissions(PERMISSIONS.AGENT_GERER)
  @ApiOperation({
    summary: "Création d'un compte",
    description:
      "Il n'existe pas d'inscription libre. Le compte créé est en changement de mot de passe imposé.",
  })
  @ApiResponse({ status: 201, type: AgentAvecMotDePasseDto })
  @ApiResponse({ status: 409, description: 'Matricule déjà attribué' })
  creer(
    @Agent() auteur: AgentCourant,
    @Body() corps: CreationAgentDto,
  ): Promise<AgentAvecMotDePasseDto> {
    return this.agents.creer(auteur.id, corps);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.AGENT_GERER)
  @ApiOperation({ summary: "Modification d'un compte" })
  @ApiResponse({ status: 200, type: AgentDto })
  modifier(
    @Agent() auteur: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corps: ModificationAgentDto,
  ): Promise<AgentDto> {
    return this.agents.modifier(auteur.id, id, corps);
  }

  @Post(':id/mot-de-passe')
  @Permissions(PERMISSIONS.AGENT_GERER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Réinitialisation du mot de passe',
    description:
      'Renvoie un mot de passe provisoire affiché une seule fois, révoque les jetons et repasse le compte en changement imposé.',
  })
  @ApiResponse({ status: 200, type: AgentAvecMotDePasseDto })
  reinitialiserMotDePasse(
    @Agent() auteur: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AgentAvecMotDePasseDto> {
    return this.agents.reinitialiserMotDePasse(auteur.id, id);
  }

  @Post(':id/anonymiser')
  @Permissions(PERMISSIONS.AGENT_ANONYMISER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Anonymisation — seule forme de retrait d'un compte",
    description:
      "Efface les données personnelles, conserve l'enregistrement et ses références, révoque les jetons. Irréversible.",
  })
  @ApiResponse({ status: 200, type: AgentDto })
  @ApiResponse({
    status: 409,
    description: 'Déjà anonymisé, ou dernier super-admin',
  })
  anonymiser(
    @Agent() auteur: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AgentDto> {
    return this.agents.anonymiser(auteur.id, id);
  }
}
