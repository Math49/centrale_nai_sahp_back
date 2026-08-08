import {
  Body,
  Controller,
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
import { Permissions } from '../auth/decorateurs';
import { CreationFaitDto, FaitDto, ModificationFaitDto } from './faits.dto';
import { FaitsService } from './faits.service';

@ApiTags('faits')
@ApiBearerAuth('jeton')
@Controller('faits')
export class FaitsController {
  constructor(private readonly faits: FaitsService) {}

  @Post()
  @Permissions(PERMISSIONS.FAIT_CREER)
  @ApiOperation({
    summary: 'Ajout d’un fait à une entité existante',
    description:
      'Un lien créé ici est lisible depuis ses deux extrémités : une seule arête est stockée.',
  })
  @ApiResponse({ status: 201, type: FaitDto })
  creer(
    @Agent() agent: AgentCourant,
    @Body() corps: CreationFaitDto,
  ): Promise<FaitDto> {
    return this.faits.creer(agent, corps);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.FAIT_MODIFIER)
  @ApiOperation({
    summary: 'Correction d’un fait',
    description:
      'La cible d’un lien ne se corrige pas : un lien mal posé s’infirme et se refait.',
  })
  @ApiResponse({ status: 200, type: FaitDto })
  modifier(
    @Agent() agent: AgentCourant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corps: ModificationFaitDto,
  ): Promise<FaitDto> {
    return this.faits.modifier(agent, id, corps);
  }
}
