import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import type { SanteReponseDto } from '../src/sante/sante.dto';

describe('GET /sante (e2e)', () => {
  let application: INestApplication;
  let serveur: Server;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    application = module.createNestApplication();
    await application.init();
    serveur = application.getHttpServer() as Server;
  });

  afterAll(async () => {
    await application?.close();
  });

  it('répond 200 et signale la base joignable', async () => {
    const reponse = await request(serveur).get('/sante').expect(200);
    const corps = reponse.body as SanteReponseDto;

    expect(corps.etat).toBe('operationnel');
    expect(corps.base).toBe(true);
    expect(typeof corps.demarre_depuis).toBe('number');
  });

  it('refuse une route inexistante', async () => {
    await request(serveur).get('/route-qui-nexiste-pas').expect(404);
  });
});
