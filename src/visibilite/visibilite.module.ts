import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { GardeDeSortie } from './garde-de-sortie';
import { VisibiliteService } from './visibilite.service';

@Global()
@Module({
  providers: [
    VisibiliteService,
    GardeDeSortie,

    { provide: APP_INTERCEPTOR, useExisting: GardeDeSortie },
  ],
  exports: [VisibiliteService, GardeDeSortie],
})
export class VisibiliteModule {}
