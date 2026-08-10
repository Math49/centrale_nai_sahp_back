import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Agent, type AgentCourant } from '../auth/agent-courant';
import { SansPermission } from '../auth/decorateurs';
import { AccueilDto, ResultatRechercheDto, SignalDto } from './signaux.dto';
import { SignauxService } from './signaux.service';

@ApiTags('accueil')
@ApiBearerAuth('jeton')
@Controller()
export class SignauxController {
  constructor(private readonly signaux: SignauxService) {}

  @Get('accueil')
  @SansPermission()
  @ApiOperation({
    summary: 'Écran d’accueil, assemblé',
    description:
      'Signaux, dossiers de l’agent et dernière activité en une requête. Tout y est calculé **après** filtrage de visibilité : un signal portant sur un objet inaccessible ne remonte pas, sa seule mention en révélerait l’existence.',
  })
  @ApiResponse({ status: 200, type: AccueilDto })
  async accueil(@Agent() agent: AgentCourant): Promise<AccueilDto> {
    const [signaux, mesDossiers, derniereActivite] = await Promise.all([
      this.signaux.signaux(agent),
      this.signaux.mesDossiers(agent),
      this.signaux.derniereActivite(agent),
    ]);

    return { signaux, mesDossiers, derniereActivite };
  }

  @Get('signaux')
  @SansPermission()
  @ApiOperation({
    summary: 'Signaux seuls',
    description:
      'Recoupement, récurrence et vieillissement. Les trois familles se calculent sur ce que cet agent voit, et sur rien d’autre.',
  })
  @ApiResponse({ status: 200, type: [SignalDto] })
  liste(@Agent() agent: AgentCourant): Promise<SignalDto[]> {
    return this.signaux.signaux(agent);
  }

  @Get('recherche')
  @SansPermission()
  @ApiOperation({
    summary: 'Recherche globale',
    description:
      'Entités et dossiers. Les objets inaccessibles en sont absents, sans mention ni décompte : un total qui ne tombe pas juste est déjà une information.',
  })
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Deux caractères au moins',
  })
  @ApiResponse({ status: 200, type: [ResultatRechercheDto] })
  rechercher(
    @Agent() agent: AgentCourant,
    @Query('q') q = '',
  ): Promise<ResultatRechercheDto[]> {
    return this.signaux.rechercher(agent, q);
  }
}
