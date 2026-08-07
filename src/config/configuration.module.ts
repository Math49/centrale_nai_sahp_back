import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validerEnvironnement } from './environnement';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env'],
      validate: validerEnvironnement,
    }),
  ],
})
export class ConfigurationModule {}
