#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const FICHIER = '.env.test';

if (!existsSync(FICHIER)) {
  console.error(`${FICHIER} introuvable`);
  process.exit(1);
}

const variables = Object.fromEntries(
  readFileSync(FICHIER, 'utf8')
    .split('\n')
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne.length > 0 && !ligne.startsWith('#'))
    .map((ligne) => {
      const separateur = ligne.indexOf('=');
      return [ligne.slice(0, separateur), ligne.slice(separateur + 1)];
    }),
);

const url = new URL(variables.DATABASE_URL);
const nomBase = url.pathname.slice(1);

const urlMaintenance = new URL(url);
urlMaintenance.pathname = '/postgres';

const client = new PrismaClient({
  datasources: { db: { url: urlMaintenance.toString() } },
});

try {
  const existe = await client.$queryRaw`
    SELECT 1 FROM pg_database WHERE datname = ${nomBase}
  `;

  if (existe.length === 0) {
    await client.$executeRawUnsafe(`CREATE DATABASE "${nomBase}"`);
    console.log(`base de test créée : ${nomBase}`);
  }
} catch (erreur) {
  console.error(
    `PostgreSQL injoignable — démarrer la base :\n  docker compose -f docker-compose.dev.yml up -d postgres\n\n${erreur.message}`,
  );
  process.exit(1);
} finally {
  await client.$disconnect();
}

execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DATABASE_URL: variables.DATABASE_URL },
});
