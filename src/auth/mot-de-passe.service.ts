import { Injectable } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';

const PARAMETRES = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class MotDePasseService {
  hacher(motDePasse: string): Promise<string> {
    return hash(motDePasse, PARAMETRES);
  }

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

  engendrerProvisoire(): string {
    return randomBytes(12).toString('base64url');
  }
}
