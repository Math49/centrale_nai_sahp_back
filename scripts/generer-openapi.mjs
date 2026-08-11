#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const { construireDocumentOpenApi } = await import('../dist/openapi.js').catch(
  () => {
    console.error(
      'dist/openapi.js introuvable — lancer « npm run build » avant « npm run openapi »',
    );
    process.exit(1);
  },
);

const document = await construireDocumentOpenApi();
const cible = join(process.cwd(), 'openapi.json');

writeFileSync(cible, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
console.log(
  `contrat écrit : openapi.json (${Object.keys(document.paths ?? {}).length} routes)`,
);
