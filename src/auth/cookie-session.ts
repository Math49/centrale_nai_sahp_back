import type { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';

import type { Environnement } from '../config/environnement';

/** Nom du cookie de session. Un seul endroit, lu à la pose comme au retrait. */
export const COOKIE_SESSION = 'centrale_ni_session';

/**
 * Options du cookie de session.
 *
 * **`httpOnly`** — c'est tout l'intérêt du cookie sur un stockage lisible :
 * aucun script de la page ne peut lire le jeton, donc une faille XSS ne
 * l'exfiltre pas. Le navigateur l'envoie tout seul, l'application ne le voit
 * jamais.
 *
 * **`sameSite: 'lax'`** — le cookie n'accompagne pas une requête déclenchée
 * depuis un autre site, ce qui est la protection CSRF de ce dispositif. En
 * production le front et l'API partagent l'origine derrière le proxy ; en
 * développement, `localhost:3001` et `localhost:3000` diffèrent par le port,
 * qui n'entre pas dans la définition d'un « site » : le cookie passe.
 *
 * **`path: '/'`** — le retrait doit présenter exactement les mêmes attributs
 * que la pose, sinon le navigateur garde l'ancien cookie à côté du nouveau.
 */
export function optionsCookie(
  configuration: ConfigService<Environnement, true>,
  dureeMs: number,
): CookieOptions {
  return {
    httpOnly: true,
    secure: configuration.get('COOKIE_SECURE', { infer: true }),
    sameSite: 'lax',
    path: '/',
    domain: configuration.get('COOKIE_DOMAINE', { infer: true }) || undefined,
    maxAge: dureeMs,
  };
}

export function poserCookie(
  reponse: Response,
  configuration: ConfigService<Environnement, true>,
  jeton: string,
  dureeMs: number,
): void {
  reponse.cookie(COOKIE_SESSION, jeton, optionsCookie(configuration, dureeMs));
}

export function retirerCookie(
  reponse: Response,
  configuration: ConfigService<Environnement, true>,
): void {
  reponse.clearCookie(COOKIE_SESSION, {
    ...optionsCookie(configuration, 0),
    maxAge: undefined,
  });
}

/**
 * Traduit la durée de `JWT_DUREE` en millisecondes.
 *
 * Le format est celui de `ms`, que `@nestjs/jwt` accepte : `7d`, `12h`, `30m`.
 * On le relit ici parce que le cookie a besoin d'un nombre, et qu'une durée de
 * cookie plus longue que celle du jeton produirait des requêtes rejetées sans
 * que l'agent comprenne pourquoi.
 */
export function dureeEnMillisecondes(duree: string): number {
  const analyse = /^(\d+)\s*([smhd])?$/.exec(duree.trim());

  if (!analyse) {
    // Format inattendu : une semaine, la valeur par défaut du projet.
    return 7 * 24 * 60 * 60 * 1000;
  }

  const quantite = Number(analyse[1]);

  const facteurs: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return quantite * (facteurs[analyse[2] ?? 's'] ?? 1000);
}
