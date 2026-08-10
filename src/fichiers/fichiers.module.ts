import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import type { Environnement } from '../config/environnement';
import { FichiersController } from './fichiers.controller';
import { FichiersService } from './fichiers.service';

@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configuration: ConfigService<Environnement, true>) => ({
        // En mémoire : le fichier doit être reconnu et nettoyé **avant**
        // d'atteindre le volume. Un stockage sur disque écrirait d'abord et
        // vérifierait ensuite, ce qui laisserait passer l'original.
        storage: memoryStorage(),
        limits: {
          fileSize:
            configuration.get('FICHIER_TAILLE_MAX_MO', { infer: true }) *
            1024 *
            1024,
          files: 1,
        },
      }),
    }),
  ],
  controllers: [FichiersController],
  providers: [FichiersService],
  exports: [FichiersService],
})
export class FichiersModule {}
