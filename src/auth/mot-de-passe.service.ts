import { Injectable } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';

/**
 * Hachage des mots de passe, Argon2id.
 *
 * Paramètres au-dessus des minima recommandés par l'OWASP : le trafic attendu
 * est de quelques agents, le coût d'un hachage lent est nul ici alors que le
 * gain contre une base exfiltrée est réel.
 */
const PARAMETRES = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456, // 19 Mio
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class MotDePasseService {
  hacher(motDePasse: string): Promise<string> {
    return hash(motDePasse, PARAMETRES);
  }

  /**
   * Compare un mot de passe à son empreinte.
   *
   * Renvoie `false` — jamais une exception — sur une empreinte absente ou
   * illisible : un compte anonymisé n'a plus d'empreinte, et l'appelant ne doit
   * pas pouvoir distinguer ce cas d'un mot de passe faux.
   */
  async verifier(
    empreinte: string | null,
    motDePasse: string,
  ): Promise<boolean> {
    if (!empreinte) {
      return false;
    }

    try {
      return await verify(empreinte, motDePasse, PARAMETRES);
    } catch {
      return false;
    }
  }

  /** Mot de passe provisoire, à usage unique : le compte créé est en
   *  changement imposé dès sa première connexion. */
  engendrerProvisoire(): string {
    return randomBytes(12).toString('base64url');
  }
}
