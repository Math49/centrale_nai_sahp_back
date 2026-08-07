import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GardeAuthentification } from './garde-authentification';
import { GardePermission } from './garde-permission';
import { MotDePasseService } from './mot-de-passe.service';

/**
 * Les deux gardes sont globaux et déclarés dans cet ordre : l'authentification
 * résout l'agent, la permission décide. Les enregistrer route par route
 * laisserait la porte ouverte à l'oubli — or l'oubli doit refuser.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    MotDePasseService,
    { provide: APP_GUARD, useClass: GardeAuthentification },
    { provide: APP_GUARD, useClass: GardePermission },
  ],
  exports: [MotDePasseService],
})
export class AuthModule {}
