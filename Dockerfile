# Image de production de l'API.
#
# Construction en deux temps : la première étape compile avec toutes les
# dépendances, la seconde n'embarque que ce qui tourne. Le client Prisma est
# régénéré dans l'étape finale, parce qu'il porte un binaire natif lié à la
# plateforme et qu'il vit dans node_modules, qu'on réinstalle en production.

FROM node:22-alpine AS construction

WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src

RUN npm run build

# ─────────────────────────────── Exécution ───────────────────────────────

FROM node:22-alpine AS execution

WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Les migrations et le SQL de prisma/sql/ doivent être présents : le conteneur
# applique `migrate deploy` au démarrage, et les triggers vivent là.
COPY prisma ./prisma
RUN npx prisma generate

COPY --from=construction /app/dist ./dist

# Le volume de fichiers est monté ici. Le dossier appartient à `node` pour que
# le processus, qui ne tourne pas en root, puisse y écrire.
RUN mkdir -p /app/donnees/fichiers && chown -R node:node /app/donnees

USER node

EXPOSE 3000

# `migrate deploy` et non `migrate dev` : en production, on applique des
# migrations existantes, on n'en engendre jamais.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
