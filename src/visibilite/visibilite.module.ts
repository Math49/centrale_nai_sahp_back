import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { GardeDeSortie } from './garde-de-sortie';
import { VisibiliteService } from './visibilite.service';

/**
 * Le service de visibilité n'expose aucune route : c'est une pièce
 * transversale, et la règle des gardiens ne doit exister qu'en un exemplaire.
 *
 * Le garde de sortie est enregistré globalement — un intercepteur posé route
 * par route serait oublié sur la prochaine.
 */
@Global()
@Module({
  providers: [
    VisibiliteService,
    GardeDeSortie,
    // `useExisting` et non `useClass` : le garde reste joignable par son propre
    // jeton, ce qui permet de le vérifier directement en test.
    { provide: APP_INTERCEPTOR, useExisting: GardeDeSortie },
  ],
  exports: [VisibiliteService, GardeDeSortie],
})
export class VisibiliteModule {}
