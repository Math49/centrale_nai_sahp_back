# Centrale N&I — API

API du service Narcotics & Investigations de la SAHP. NestJS, Prisma, PostgreSQL.

Le front vit dans le dépôt `centrale_nai_sahp_front`.

---

## ⚠ La base n'est pas décrite entièrement par `schema.prisma`

**Les triggers, les vues et les index partiels ne figurent pas dans
`schema.prisma`.** Ils vivent dans `prisma/sql/`, qui en est la source
canonique, et sont recopiés dans les migrations Prisma pour être appliqués.

Conséquences pratiques :

- Un `prisma db pull` **ne les verra pas** et écrasera le schéma sans eux.
- Un `prisma migrate dev` ne les régénère pas : ils ne sont pas dans le diff.
- Une base créée par `prisma db push` est **incomplète** — ne jamais l'utiliser
  sur ce projet. Toujours passer par les migrations.

Ce n'est pas un défaut de configuration mais un choix : la cohérence de la
donnée est garantie par la base, et PostgreSQL sait faire des choses que Prisma
ne sait pas exprimer. Voir `prisma/sql/README.md`.

---

## Démarrer

Prérequis : Docker et Node 22.

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up
```

L'API écoute sur `http://localhost:3000`, la base sur `localhost:5432`.
Les migrations sont appliquées au démarrage du conteneur `api`.

Vérification :

```bash
curl http://localhost:3000/sante
```

```json
{ "etat": "operationnel", "version": "0.1.0", "base": true, "demarre_depuis": 3, "horodatage": "..." }
```

La documentation OpenAPI est servie sur `http://localhost:3000/documentation`.

### Premier compte

Il n'existe pas d'inscription libre, et le premier compte ne peut donc pas être
créé par l'API. Une commande d'amorçage crée les trois grades manquants et un
compte super-admin :

```bash
npm run agent:super-admin -- 2291 Mathis Mercier
```

Elle affiche **une seule fois** un mot de passe provisoire ; le compte est en
changement imposé à la première connexion. Le mot de passe n'est jamais passé en
argument : il serait visible dans l'historique du shell et dans la liste des
processus.

Les arguments sont positionnels et non nommés — npm intercepte les options
longues qu'il ne connaît pas, même après `--`.

### Données de développement

```bash
npm run semences:madrina
```

Installe le référentiel s'il est absent et rejoue le parcours de référence de
l'annexe B de l'étude du besoin : le groupe Madrina, ses membres, ses véhicules
et deux braquages. Onze entités, quarante faits.

C'est le test de non-régression du modèle : **Isadora Morales et Tyron Banks ne
sont reliés par aucun fait**, et le rapprochement doit tomber seul par le graphe
(lot 9). La commande refuse de s'exécuter sur une base qui contient déjà des
entités.

```bash
npm run semences:simulation
```

Le jeu d'**usage**, par opposition au jeu de **test** ci-dessus : quatre
organisations, une septantaine d'entités, près de trois cents faits, sept
dossiers dont un privé, des sources allant du fichier central à la rumeur, une
fiche archivée et un fait infirmé. C'est celui qui sert à juger un écran, une
recherche, un graphe — le parcours Madrina est trop court pour cela.

> **Après tout peuplement, redémarrer l'API.** La commande écrit en base depuis
> un autre processus : le graphe en mémoire de l'API ne l'apprend pas, et
> resterait vide.
>
> ```bash
> docker compose -f docker-compose.dev.yml restart api
> ```

### Variante — base en conteneur, API sur l'hôte

Plus confortable pour déboguer :

```bash
docker compose -f docker-compose.dev.yml up -d postgres
npx prisma migrate deploy
npm run start:dev
```

### Après l'ajout d'une dépendance

Le `node_modules` du conteneur est un volume nommé, qui masque celui de l'image.
Reconstruire l'image ne suffit pas : il faut aussi jeter le volume, sans quoi le
conteneur compile contre les anciennes dépendances.

```bash
docker compose -f docker-compose.dev.yml down
docker volume rm centrale-ni-dev_modules_api
docker compose -f docker-compose.dev.yml up -d --build
```

---

## Migrations

Deux natures de migrations, deux voies :

**Migrations déclaratives** — tables, colonnes, contraintes, index simples.
Générées par Prisma depuis `schema.prisma` :

```bash
npx prisma migrate dev --name ma_migration
```

**Migrations SQL** — triggers, fonctions, vues, index partiels et GIN. Écrites à
la main dans `prisma/sql/`, puis recopiées dans une migration :

```bash
npm run sql:migration -- projection_des_faits prisma/sql/fonctions/fait_projection.sql prisma/sql/triggers/fait_projection.sql
npx prisma migrate dev
```

Les scripts de `prisma/sql/` sont idempotents et restent la version de
référence : on corrige le fichier source, puis on crée une nouvelle migration.
On ne modifie jamais une migration déjà appliquée.

---

## Contrat OpenAPI

Le contrat est généré depuis les DTO et versionné dans le dépôt front, qui en
dérive son client typé.

```bash
npm run build
npm run openapi     # écrit openapi.json
```

**Règle de déploiement** : lorsque le contrat évolue, le back se déploie avant
le front.

---

## Tests

```bash
npm test           # unitaires
npm run test:e2e   # intégration — nécessite PostgreSQL démarré
npm run lint
```

Les tests d'intégration tournent sur `centrale_ni_test`, base **distincte** de
celle de développement : ils vident des tables. `npm run test:e2e` la crée si
elle n'existe pas et y applique les migrations avant de lancer jest. La
configuration correspondante est dans `.env.test`, versionné parce qu'il ne
contient que des valeurs de test.

---

## Configuration

Toutes les variables sont validées au démarrage par `src/config/environnement.ts`.
Le processus refuse de démarrer si l'une manque ou est mal formée.

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `NODE_ENV` | `development` | |
| `PORT` | `3000` | |
| `DATABASE_URL` | — | obligatoire |
| `CORS_ORIGINES` | `http://localhost:3001` | liste séparée par des virgules |
| `SWAGGER_ACTIF` | `true` | expose `/documentation` |
| `JWT_SECRET` | — | obligatoire, 32 caractères minimum |
| `JWT_DUREE` | `7d` | validité du jeton **et** du cookie qui le porte |
| `COOKIE_SECURE` | `false` | `true` en production — cookie refusé hors HTTPS |
| `COOKIE_DOMAINE` | — | vide en développement : le navigateur retient l'hôte exact |
| `VIEILLISSEMENT_JOURS` | `30` | seuil du signal de vieillissement, en jours |
| `FICHIERS_RACINE` | `./donnees/fichiers` | volume des images, jamais servi en statique |
| `FICHIER_TAILLE_MAX_MO` | `8` | plafond d'une image déposée |

Toute variable ajoutée ici doit l'être aussi dans `docker-compose.dev.yml` : le
conteneur voit le `.env` de l'hôte par le montage, mais ses propres variables le
supplantent, et une variable oubliée y prendrait silencieusement une valeur
prévue pour l'hôte.

---

## Mise en production

Quatre services et une tâche de sauvegarde : `postgres`, `api`, `front`,
`proxy`. Le front est construit depuis le dépôt voisin, désigné par
`CHEMIN_FRONT`.

```bash
cp .env.production.example .env.production
# renseigner DOMAINE, les mots de passe et le secret JWT, puis :
docker compose --env-file .env.production up -d --build
```

Le DNS doit pointer sur la machine **avant** le premier démarrage : Caddy
obtient son certificat Let's Encrypt tout seul, et échouera sinon.

Puis, une seule fois :

```bash
docker compose --env-file .env.production exec api \
  npx ts-node -r tsconfig-paths/register src/commandes/creer-super-admin.ts 2291 Prénom Nom
docker compose --env-file .env.production exec api npm run referentiel:initial
```

**Instance unique, et c'est structurel.** Le graphe vit en mémoire dans le
processus Nest. Toute mise à l'échelle horizontale exigerait de sortir le cache
dans un Redis partagé — hors périmètre de la V1.

### Ce que le proxy ne fait pas

Il ne sert **aucun dossier en statique**. Le volume de fichiers n'apparaît nulle
part dans le `Caddyfile` : les images passent par `/api/fichiers/:id`, qui
vérifie l'accès à la fiche avant de renvoyer l'octet. Un `file_server` sur ce
volume annulerait le moteur de visibilité d'un seul trait.

### Fichiers

- **Nom opaque** sur le volume, réparti en sous-dossiers. Le nom d'origine ne
  vit qu'en base, pour l'affichage.
- **Type vérifié sur le contenu**, jamais sur l'extension. JPEG, PNG et WebP.
- **Métadonnées retirées** — EXIF, GPS, commentaires — **sans réencodage** : on
  écarte des segments, on ne recompresse pas. Une pièce d'enquête ne doit pas
  ressortir dégradée du dépôt.
- Le résultat est **relu** avant d'atteindre le volume : un nettoyage qui aurait
  échoué fait refuser le dépôt.

---

## Sauvegardes et restauration

Le service `sauvegarde` écrit chaque nuit une paire d'archives portant le même
horodatage : le dump de la base **et** le volume de fichiers. Les deux vont
ensemble — une base restaurée sans ses images est une base à moitié perdue, et
aucune source ne permet de réimporter les photos versées.

```bash
# à la demande
docker compose --env-file .env.production exec sauvegarde \
  /bin/sh /usr/local/bin/sauvegarder.sh maintenant

# lister ce qui existe
docker compose --env-file .env.production exec sauvegarde ls -1 /sauvegardes
```

Rotation à `RETENTION_JOURS` (14 par défaut). Les archives ne prennent leur nom
définitif qu'une fois écrites : une sauvegarde interrompue ne peut pas se faire
passer pour complète ni être retenue au détriment d'une bonne.

### Restauration — à répéter avant la mise en service

**Une sauvegarde jamais restaurée n'est pas une sauvegarde.** La procédure se
répète au moins une fois, sur une instance de test, avant l'ouverture du
service.

```bash
docker compose --env-file .env.production stop api front

docker compose --env-file .env.production run --rm \
  -v centrale-ni_fichiers:/cible/fichiers \
  sauvegarde /bin/sh /usr/local/bin/restaurer.sh 20260809T030000Z

docker compose --env-file .env.production start api front
```

Le script **refuse d'écraser une base non vide** sans `FORCER=1`, et vérifie en
fin de course que le nombre d'images sur le volume correspond au nombre de
lignes de la table `fichier`. Un écart fait échouer la restauration plutôt que
de laisser une instance à moitié cohérente.

---

## Structure

```
prisma/
  schema.prisma          modèles déclaratifs
  sql/                   triggers, fonctions, vues, index partiels
  migrations/            seule voie d'application
scripts/
  creer-migration-sql.mjs
  generer-openapi.mjs
  preparer-base-de-test.mjs
deploiement/
  Caddyfile              proxy TLS — ne sert aucun dossier en statique
  sauvegarder.sh         base et volume, rotation
  restaurer.sh           procédure de restauration, vérifiée
src/
  agents/                comptes, grades, catalogue des permissions
  auth/                  connexion, jetons, gardes globaux
  commandes/             amorçage d'une instance
  config/                validation de l'environnement
  dossiers/              périmètres d'enquête, suivi, habilitations
  entites/               annuaire, fiche, doublons, fusion
  faits/                 création, correction, infirmation
  fichiers/              dépôt, nettoyage des métadonnées, service authentifié
  graphe/                cache mémoire, voisinage, chemins, récurrences
  journal/               consultation, audit, intercepteur
  prisma/                client partagé
  referentiel/           types d'entités, champs, types de liens, onglets
  sante/                 route de santé
  semences/              parcours Madrina
  signaux/               signaux de l'accueil, recherche globale
  visibilite/            règle des gardiens — un seul exemplaire
test/                    tests d'intégration
```

---

## Recette d'ensemble

`test/recette-madrina.e2e-spec.ts` rejoue **par l'API**, sur une base vierge et
par un compte Junior, tout le parcours de l'annexe B. Il vérifie ensuite le
critère de réussite du projet :

> Aucun fait ne relie Isadora Morales à Tyron Banks — et pourtant le graphe les
> relie, et le signal de récurrence la fait ressortir seule.

C'est le test à faire tourner avant toute mise en production.

**Refus par défaut.** Une route qui ne déclare ni `@Publique()`, ni
`@SansPermission()`, ni `@Permissions(...)` est refusée. Un test d'intégration
monte un contrôleur volontairement non décoré pour le vérifier.

Les conventions de développement et les règles métier à respecter sont dans
`CLAUDE.md`.
