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
  CreationRepereDto,
  CreationTypeRepereDto,
  ModificationRepereDto,
  ModificationTypeRepereDto,
  PointDeDonneeDto,
  RepereDto,
  TypeRepereDto,
} from './carte.dto';
import { CarteService } from './carte.service';

@ApiTags('carte')
@ApiBearerAuth('jeton')
@Controller('carte')
export class CarteController {
  constructor(private readonly carte: CarteService) {}

  // ───────────────────────── Types de repères ─────────────────────────

  @Get('types-reperes')
  @Permissions(PERMISSIONS.CARTE_CONSULTER)
  @ApiOperation({
    summary: 'Catalogue des types de repères',
    description:
      'Lisible par qui consulte la carte : il faut pouvoir nommer et dessiner ce qu’on voit.',
  })
  @ApiResponse({ status: 200, type: [TypeRepereDto] })
  listerTypes(): Promise<TypeRepereDto[]> {
    return this.carte.listerTypes();
  }

  @Post('types-reperes')
  @SuperAdminSeul()
  @ApiOperation({
    summary: 'Création d’un type de repère',
    description:
      'Configuration du modèle métier — réservée au super-admin, comme les types de données et de liens.',
  })
  @ApiResponse({ status: 201, type: TypeRepereDto })
  @ApiResponse({ status: 409, description: 'Code déjà utilisé' })
  creerType(
    @Agent() agent: AgentCourant,
    @Body() corps: CreationTypeRepereDto,
  ): Promise<TypeRepereDto> {
    return this.carte.creerType(agent.id, corps);
  }

  @Patch('types-reperes/:id')
  @SuperAdminSeul()
  @ApiResponse({ status: 200, type: TypeRepereDto })
  modifierType(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corps: ModificationTypeRepereDto,
  ): Promise<TypeRepereDto> {
    return this.carte.modifierType(agent.id, id, corps);
  }

  @Delete('types-reperes/:id')
  @SuperAdminSeul()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 409, description: 'Type encore utilisé' })
  supprimerType(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.carte.supprimerType(agent.id, id);
  }

  @Post('types-reperes/ordre')
  @SuperAdminSeul()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204 })
  ordonnerTypes(
    @Agent() agent: AgentCourant,
    @Body() corps: OrdreDto,
  ): Promise<void> {
    return this.carte.ordonnerTypes(agent.id, corps.ids);
  }

  // ───────────────────────────── Repères ─────────────────────────────

  @Get('reperes')
  @Permissions(PERMISSIONS.CARTE_CONSULTER)
  @ApiOperation({
    summary: 'Repères visibles',
    description:
      'Un repère classé hors de portée n’est **pas** montré muet : il est absent. Sur une carte, la position est le renseignement.',
  })
  @ApiQuery({ name: 'archives', required: false })
  @ApiResponse({ status: 200, type: [RepereDto] })
  listerReperes(
    @Agent() agent: AgentCourant,
    @Query('archives', new DefaultValuePipe(false), ParseBoolPipe)
    archives: boolean,
  ): Promise<RepereDto[]> {
    return this.carte.listerReperes(agent, { archives });
  }

  @Get('donnees')
  @Permissions(PERMISSIONS.CARTE_CONSULTER, PERMISSIONS.ENTITE_CONSULTER)
  @ApiOperation({
    summary: 'Points portés par les fiches',
    description:
      'Chaque champ de type carte, filtré par la règle des gardiens comme n’importe quel fait. Exige aussi de pouvoir consulter les données : ce sont elles qu’on lit ici.',
  })
  @ApiResponse({ status: 200, type: [PointDeDonneeDto] })
  pointsDesDonnees(@Agent() agent: AgentCourant): Promise<PointDeDonneeDto[]> {
    return this.carte.pointsDesDonnees(agent);
  }

  @Post('reperes')
  @Permissions(PERMISSIONS.CARTE_ANNOTER)
  @ApiOperation({ summary: 'Poser un repère' })
  @ApiResponse({ status: 201, type: RepereDto })
  creerRepere(
    @Agent() agent: AgentCourant,
    @Body() corps: CreationRepereDto,
  ): Promise<RepereDto> {
    return this.carte.creerRepere(agent, corps);
  }

  @Patch('reperes/:id')
  @Permissions(PERMISSIONS.CARTE_ANNOTER)
  @ApiResponse({ status: 200, type: RepereDto })
  modifierRepere(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corps: ModificationRepereDto,
  ): Promise<RepereDto> {
    return this.carte.modifierRepere(agent, id, corps);
  }

  @Post('reperes/:id/archiver')
  @Permissions(PERMISSIONS.CARTE_ARCHIVER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Retirer un repère de la carte',
    description:
      'Archivage, jamais suppression : ce qu’on a cru savoir d’un terrain fait partie de l’enquête, même quand on cesse d’y croire.',
  })
  @ApiResponse({ status: 200, type: RepereDto })
  archiver(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RepereDto> {
    return this.carte.changerEtat(agent, id, EtatEntite.archive);
  }

  @Post('reperes/:id/desarchiver')
  @Permissions(PERMISSIONS.CARTE_ARCHIVER)
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, type: RepereDto })
  desarchiver(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RepereDto> {
    return this.carte.changerEtat(agent, id, EtatEntite.actif);
  }

  @Post('reperes/:id/habilitations')
  @Permissions(PERMISSIONS.DOSSIER_HABILITER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Habiliter un agent sur un repère',
    description:
      'Nominative, jamais déduite d’un grade. Le seul moyen de rouvrir un repère classé à qui n’a pas de dérogation.',
  })
  @ApiResponse({ status: 204 })
  habiliter(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corps: DesignationAgentDto,
  ): Promise<void> {
    return this.carte.habiliter(agent, id, corps.agentId);
  }

  @Delete('reperes/:id/habilitations/:agentId')
  @Permissions(PERMISSIONS.DOSSIER_HABILITER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204 })
  retirerHabilitation(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('agentId', ParseUUIDPipe) agentId: string,
  ): Promise<void> {
    return this.carte.retirerHabilitation(agent, id, agentId);
  }
}
