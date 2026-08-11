import type { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';

import type { Environnement } from '../config/environnement';

export const COOKIE_SESSION = 'centrale_ni_session';

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

export function dureeEnMillisecondes(duree: string): number {
  const analyse = /^(\d+)\s*([smhd])?$/.exec(duree.trim());

  if (!analyse) {
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
