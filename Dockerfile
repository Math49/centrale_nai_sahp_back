


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


FROM node:22-alpine AS execution

WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund


COPY prisma ./prisma
RUN npx prisma generate

COPY --from=construction /app/dist ./dist


RUN mkdir -p /app/donnees/fichiers && chown -R node:node /app/donnees

USER node

EXPOSE 3000


CMD ["sh", "-c", "npx prisma migrate deploy && node dist/commandes/initialiser-production && node dist/main"]
