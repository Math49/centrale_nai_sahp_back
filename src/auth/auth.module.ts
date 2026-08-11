import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GardeAuthentification } from './garde-authentification';
import { GardePermission } from './garde-permission';
import { MotDePasseService } from './mot-de-passe.service';

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
