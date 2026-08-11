#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const [nom, ...fichiers] = process.argv.slice(2);

if (!nom || fichiers.length === 0) {
  console.error(
    'usage : npm run sql:migration -- <nom> <fichier.sql> [autre.sql ...]',
  );
  process.exit(1);
}

if (!/^[a-z0-9_]+$/.test(nom)) {
  console.error(
    `nom de migration invalide : « ${nom} » — minuscules, chiffres et tirets bas uniquement`,
  );
  process.exit(1);
}

const racine = process.cwd();
const manquants = fichiers.filter((f) => !existsSync(resolve(racine, f)));
if (manquants.length > 0) {
  console.error(`fichier introuvable :\n  ${manquants.join('\n  ')}`);
  process.exit(1);
}

const horodatage = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

const dossier = join(racine, 'prisma', 'migrations', `${horodatage}_${nom}`);

if (existsSync(dossier)) {
  console.error(`la migration ${horodatage}_${nom} existe déjà`);
  process.exit(1);
}

const blocs = fichiers.map((f) => {
  const chemin = resolve(racine, f);

  const contenu = readFileSync(chemin, 'utf8')
    .replace(/^\uFEFF/, '')
    .trimEnd();
  return `-- source : ${relative(racine, chemin).replace(/\\/g, '/')}\n${contenu}`;
});

const entete = [
  `-- Migration générée depuis prisma/sql/ par scripts/creer-migration-sql.mjs.`,
  `-- Ne pas modifier ici : corriger le fichier source puis créer une nouvelle migration.`,
  '',
  '',
].join('\n');

mkdirSync(dossier, { recursive: true });
writeFileSync(
  join(dossier, 'migration.sql'),
  `${entete}${blocs.join('\n\n')}\n`,
  'utf8',
);

console.log(
  `migration créée : prisma/migrations/${horodatage}_${nom}/migration.sql`,
);
console.log('appliquer avec : npx prisma migrate dev');
