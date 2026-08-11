import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import type { Environnement } from '../config/environnement';
import { Agent, type AgentCourant } from './agent-courant';
import {
  AgentConnecteDto,
  ChangementMotDePasseDto,
  ConnexionDto,
  JetonDto,
} from './auth.dto';
import { AuthService } from './auth.service';
import {
  dureeEnMillisecondes,
  poserCookie,
  retirerCookie,
} from './cookie-session';
import {
  AutoriseeEnChangementImpose,
  Publique,
  SansPermission,
} from './decorateurs';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly configuration: ConfigService<Environnement, true>,
  ) {}

  private get dureeCookie(): number {
    return dureeEnMillisecondes(
      this.configuration.get('JWT_DUREE', { infer: true }),
    );
  }

  @Post('login')
  @Publique()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Connexion par matricule et mot de passe',
    description:
      'Pose un cookie de session `httpOnly`, valable le temps du jeton.',
  })
  @ApiResponse({ status: 200, type: JetonDto })
  @ApiResponse({ status: 401, description: 'Identifiants invalides' })
  async connecter(
    @Body() corps: ConnexionDto,
    @Res({ passthrough: true }) reponse: Response,
  ): Promise<JetonDto> {
    const session = await this.auth.connecter(
      corps.matricule,
      corps.motDePasse,
    );

    poserCookie(reponse, this.configuration, session.jeton, this.dureeCookie);

    return session;
  }

  @Get('moi')
  @SansPermission()
  @AutoriseeEnChangementImpose()
  @ApiBearerAuth('jeton')
  @ApiOperation({
    summary: "Identité et permissions de l'agent connecté",
    description:
      'Le front s’en sert au démarrage pour savoir s’il a une session : le cookie étant `httpOnly`, il ne peut pas le lire lui-même.',
  })
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
      "Invalide tous les jetons de l'agent, y compris celui de l'appel : le jeton neuf renvoyé remplace le précédent, et le cookie est reposé.",
  })
  @ApiResponse({ status: 200, type: JetonDto })
  async changerMotDePasse(
    @Agent() agent: AgentCourant,
    @Body() corps: ChangementMotDePasseDto,
    @Res({ passthrough: true }) reponse: Response,
  ): Promise<JetonDto> {
    const session = await this.auth.changerMotDePasse(
      agent,
      corps.ancien,
      corps.nouveau,
    );

    poserCookie(reponse, this.configuration, session.jeton, this.dureeCookie);

    return session;
  }

  @Post('deconnexion')
  @SansPermission()
  @AutoriseeEnChangementImpose()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('jeton')
  @ApiOperation({
    summary: 'Déconnexion',
    description:
      'Retire le cookie de session. Le jeton reste valide jusqu’à sa péremption — pour le révoquer immédiatement, c’est `token_version` qu’il faut incrémenter, ce que fait un changement de mot de passe.',
  })
  @ApiResponse({ status: 204 })
  deconnecter(@Res({ passthrough: true }) reponse: Response): void {
    retirerCookie(reponse, this.configuration);
  }
}
