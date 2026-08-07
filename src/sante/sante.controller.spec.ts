import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';

import { PrismaService } from '../prisma/prisma.service';
import { SanteController } from './sante.controller';

describe('SanteController', () => {
  const verifierConnexion = jest.fn();

  const construire = async (): Promise<SanteController> => {
    const module = await Test.createTestingModule({
      controllers: [SanteController],
      providers: [{ provide: PrismaService, useValue: { verifierConnexion } }],
    }).compile();

    return module.get(SanteController);
  };

  /** Renvoie la réponse Express factice et le mock de `status`, séparément :
   *  lire `reponse.status` dans un `expect` déclencherait `unbound-method`. */
  const reponseFactice = (): [Response, jest.Mock] => {
    const status = jest.fn();
    return [{ status } as unknown as Response, status];
  };

  beforeEach(() => verifierConnexion.mockReset());

  it('répond « operationnel » quand la base répond', async () => {
    verifierConnexion.mockResolvedValue(true);
    const [reponse, status] = reponseFactice();

    const resultat = await (await construire()).lire(reponse);

    expect(resultat.etat).toBe('operationnel');
    expect(resultat.base).toBe(true);
    expect(status).not.toHaveBeenCalled();
  });

  it('répond « degrade » en 503 quand la base est injoignable', async () => {
    verifierConnexion.mockResolvedValue(false);
    const [reponse, status] = reponseFactice();

    const resultat = await (await construire()).lire(reponse);

    expect(resultat.etat).toBe('degrade');
    expect(resultat.base).toBe(false);
    expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
