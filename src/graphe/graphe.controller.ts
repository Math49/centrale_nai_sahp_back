import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
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

import { PERMISSIONS } from '../agents/permissions';
import { Agent, type AgentCourant } from '../auth/agent-courant';
import { Permissions, SansPermission } from '../auth/decorateurs';
import { HorsAudit } from '../journal/decorateurs';
import { CheminsDto, DispositionDto, VoisinageDto } from './graphe.dto';
import { GrapheAssembleurService } from './graphe-assembleur.service';

@ApiTags('graphe')
@ApiBearerAuth('jeton')
@Controller('graphe')
export class GrapheController {
  constructor(private readonly assembleur: GrapheAssembleurService) {}

  @Get()
  @SansPermission()
  @ApiOperation({
    summary: 'Exploration par expansion',
    description:
      'Voisinage d’une entité, élagué pour cet agent **avant** traversée. Chaque nœud rapporte le nombre de voisins qu’il reste à déplier.',
  })
  @ApiQuery({ name: 'depuis', required: true, format: 'uuid' })
  @ApiQuery({
    name: 'profondeur',
    required: false,
    description: 'Nombre de sauts, 1 à 4',
  })
  @ApiQuery({
    name: 'fiabilite',
    required: false,
    description: 'Niveau minimal des arêtes retenues, 1 à 4',
  })
  @ApiResponse({ status: 200, type: VoisinageDto })
  voisinage(
    @Agent() agent: AgentCourant,
    @Query('depuis') depuis: string,
    @Query('profondeur', new DefaultValuePipe(1), ParseIntPipe)
    profondeur: number,
    @Query('fiabilite', new DefaultValuePipe(1), ParseIntPipe)
    fiabilite: number,
    @Query('dossier') dossierId?: string,
  ): Promise<VoisinageDto> {
    return this.assembleur.voisinage(agent, {
      depuis,
      profondeur: Math.min(Math.max(profondeur, 1), 4),
      fiabiliteMinimale: Math.min(Math.max(fiabilite, 1), 4),
      dossierId,
    });
  }

  @Get('complet')
  @SansPermission()
  @ApiOperation({
    summary: 'Vue entière',
    description:
      'Tout ce que l’agent peut voir, à toute profondeur, élagué **avant** constitution. Les fiches isolées y figurent : une entité sans lien fait partie de ce que le service sait.',
  })
  @ApiQuery({
    name: 'fiabilite',
    required: false,
    description: 'Niveau minimal des arêtes retenues, 1 à 4',
  })
  @ApiQuery({ name: 'dossier', required: false, format: 'uuid' })
  @ApiResponse({ status: 200, type: VoisinageDto })
  vueEntiere(
    @Agent() agent: AgentCourant,
    @Query('fiabilite', new DefaultValuePipe(1), ParseIntPipe)
    fiabilite: number,
    @Query('dossier') dossierId?: string,
  ): Promise<VoisinageDto> {
    return this.assembleur.vueEntiere(agent, {
      fiabiliteMinimale: Math.min(Math.max(fiabilite, 1), 4),
      dossierId,
    });
  }

  @Get('chemin')
  @SansPermission()
  @ApiOperation({
    summary: 'Recherche de chemin',
    description:
      'Deux résultats : le trajet le plus court et le plus solide. Un chemin passant par un lien masqué n’existe pas pour l’agent concerné — la plateforme ne dit jamais qu’un chemin existe mais reste inaccessible.',
  })
  @ApiQuery({ name: 'de', required: true, format: 'uuid' })
  @ApiQuery({ name: 'vers', required: true, format: 'uuid' })
  @ApiQuery({ name: 'fiabilite', required: false })
  @ApiResponse({ status: 200, type: CheminsDto })
  chemin(
    @Agent() agent: AgentCourant,
    @Query('de') de: string,
    @Query('vers') vers: string,
    @Query('fiabilite', new DefaultValuePipe(1), ParseIntPipe)
    fiabilite: number,
  ): Promise<CheminsDto> {
    return this.assembleur.chemins(
      agent,
      de,
      vers,
      Math.min(Math.max(fiabilite, 1), 4),
    );
  }

  @Post('positions')
  @Permissions(PERMISSIONS.GRAPHE_REPOSITIONNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @HorsAudit()
  @ApiOperation({
    summary: 'Disposition mémorisée',
    description:
      'Par dossier lorsqu’un dossier est indiqué, globalement sinon. Le repositionnement affecte tous les agents : c’est une disposition partagée, d’où la permission.',
  })
  enregistrerPositions(
    @Agent() agent: AgentCourant,
    @Body() corps: DispositionDto,
  ): Promise<void> {
    return this.assembleur.enregistrerPositions(agent, corps);
  }
}
