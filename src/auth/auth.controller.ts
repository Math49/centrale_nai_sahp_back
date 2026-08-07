import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Agent, type AgentCourant } from './agent-courant';
import {
  AgentConnecteDto,
  ChangementMotDePasseDto,
  ConnexionDto,
  JetonDto,
} from './auth.dto';
import { AuthService } from './auth.service';
import {
  AutoriseeEnChangementImpose,
  Publique,
  SansPermission,
} from './decorateurs';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @Publique()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion par matricule et mot de passe' })
  @ApiResponse({ status: 200, type: JetonDto })
  @ApiResponse({ status: 401, description: 'Identifiants invalides' })
  connecter(@Body() corps: ConnexionDto): Promise<JetonDto> {
    return this.auth.connecter(corps.matricule, corps.motDePasse);
  }

  @Get('moi')
  @SansPermission()
  @AutoriseeEnChangementImpose()
  @ApiBearerAuth('jeton')
  @ApiOperation({ summary: "Identité et permissions de l'agent connecté" })
  @ApiResponse({ status: 200, type: AgentConnecteDto })
  moi(@Agent() agent: AgentCourant): AgentConnecteDto {
    return this.auth.decrire(agent);
  }

  @Post('mot-de-passe')
  @SansPermission()
  @AutoriseeEnChangementImpose()
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('jeton')
  @ApiOperation({
    summary: 'Changement de mot de passe',
    description:
      "Invalide tous les jetons de l'agent, y compris celui de l'appel : le jeton neuf renvoyé remplace le précédent.",
  })
  @ApiResponse({ status: 200, type: JetonDto })
  changerMotDePasse(
    @Agent() agent: AgentCourant,
    @Body() corps: ChangementMotDePasseDto,
  ): Promise<JetonDto> {
    return this.auth.changerMotDePasse(agent, corps.ancien, corps.nouveau);
  }
}
