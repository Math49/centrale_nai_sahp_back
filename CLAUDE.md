# Centrale N&I — API

Dépôt back. Le front vit dans `centrale_nai_sahp_front`.

Documents de référence, dans cet ordre d'autorité : **étude du besoin v1.3**,
**conception technique v1.1**, **plan de lots v1.1**. En cas de contradiction
apparente, l'étude du besoin tranche.

---

## La règle d'or

> **La base garantit que la donnée ne peut pas devenir incohérente.
> L'application décide qui a le droit de la voir.**

Elle départage tous les arbitrages d'implémentation.

| Dans PostgreSQL | Dans NestJS |
| --- | --- |
| Projection de `entite.valeurs` | Filtrage par habilitation et permissions |
| Maintien de `valeur_unique` | Graphe en mémoire, chemins, récurrences |
| Calcul de `visibilite_effective` | Signaux de l'accueil |
| Recalcul du `libelle` | Journal d'audit et de consultation |
| Horodatage de modification | Validation dynamique des champs |

---

## Les huit invariants

1. **Aucun fait sans source.** `source` est non nul, toujours.
2. **Un lien est une arête unique**, stockée une fois, éditable depuis ses deux
   extrémités. Jamais de lien inverse dupliqué en base.
3. **La fiabilité d'un chemin est celle de son maillon le plus faible.**
4. **Seul un super-admin crée des types** d'entités, de liens ou de champs.
5. **La visibilité effective est toujours la plus restrictive applicable.**
6. **Rien n'est jamais supprimé** : tout est archivé, infirmé ou anonymisé, et
   reste consultable. Pas de `DELETE` métier — les clés étrangères sont en
   `ON DELETE RESTRICT`. Seule exception, bornée : `POST
   /entites/:id/annuler-creation` retire une saisie en cascade abandonnée. Elle
   ne porte pas sur de l'information établie mais sur une frappe qui n'est
   jamais allée au bout, et quatre verrous la retiennent — auteur, heure,
   aucune référence entrante, aucun dossier.
7. **Toute consultation de fiche est journalisée**, y compris celles du
   super-admin, qui sont en outre marquées comme telles.
8. **Toute création, modification ou archivage passe par une confirmation
   explicite** — côté front, mais l'API doit rendre la confirmation possible en
   annonçant les effets avant l'écriture.

---

## Référentiel

Le catalogue — types d'entités, champs, types de liens, onglets — se lit en une
requête, `GET /referentiel`, **ouverte à tout agent connecté** : le front en
dérive chacun de ses formulaires et chacune de ses fiches, et le catalogue
décrit la forme du modèle, jamais son contenu.

Trois règles y sont tenues côté API :

- **Le sens d'un lien dans un onglet doit être cohérent avec son domaine.** Un
  onglet appartient à un type d'entité et n'affiche un type de lien que du côté
  où ce type se trouve. L'onglet Membres du groupe montre le côté *inverse* de
  « membre de », qui va de la personne vers le groupe.
- **Le gabarit de libellé ne cite que des champs existants** — sauf à la
  création du type, où il n'en a encore aucun : seule sa forme est alors
  vérifiable. Supprimer un champ qu'un gabarit cite est refusé.
- **Les contraintes de domaine d'un type de lien sont définitives.** Des liens
  déjà posés les respectent ; les changer les invaliderait rétroactivement.

Les suppressions de référentiel sont refusées dès qu'une donnée en dépend : les
clés étrangères sont en `RESTRICT`, et la violation est traduite en 409.

## Le cœur — ce que les triggers garantissent

`entite.valeurs` et `entite.libelle` sont une **projection** des faits,
maintenue par `projeter_entite()`. **Ne jamais les écrire depuis
l'application** : la vérité est dans `fait`, ceci n'en est qu'une vue
matérialisée. Un champ multiple projette un tableau, un champ simple la valeur
du fait le plus fiable puis le plus récent.

`valeur_unique` est recalculée par entité, jamais par fait : deux faits peuvent
affirmer la même plaque depuis deux sources, ce qui ne doit pas produire un
conflit avec soi-même. La clé primaire refuse le vrai doublon — deux entités du
même type revendiquant la même valeur normalisée.

**Prisma ne relaie pas les messages levés par un trigger** : un refus d'unicité
arrive en `P2002` sans cible. `UniciteService` relit `valeur_unique` pour nommer
la valeur en cause. La garantie reste celle de la base ; l'application se
contente de dire pourquoi.

**Une propriété de DTO sans décorateur class-validator est retirée** par le pipe
global (`whitelist: true`). Les valeurs de faits, dont la forme ne se connaît
qu'à l'exécution, portent `@Allow()`.

## Modèle, en trois phrases

- Le **fait** est l'unité élémentaire : un champ ou un lien, toujours porteur
  d'une source, d'une fiabilité (1 à 4) et d'une date de constatation.
- L'**entité** ne stocke pas ses valeurs : `entite.valeurs` est une *projection*
  des faits, maintenue par trigger. Ne jamais l'écrire depuis l'application.
- Le **dossier** ne contient rien. Il contextualise : `suivi` relie un dossier à
  des entités, et chaque fait retient son dossier de saisie pour en hériter la
  visibilité. Aucune donnée n'appartient à un dossier.

---

## Visibilité — trois axes à ne pas confondre

| Axe | Porté par | Répond à |
| --- | --- | --- |
| **Visibilité** | L'objet | Cet objet est-il sensible ? |
| **Habilitation** | La whitelist d'un dossier ou d'une entité | Cet agent est-il nommément autorisé ? |
| **Permission** | Le rôle de l'agent | Cet agent a-t-il le droit de faire ce geste ? |

**Propagation** — une entité ne porte que sa visibilité propre ; un fait prend
la plus restrictive parmi la sienne, celle de son dossier de saisie, de son
sujet et de sa cible.

**Règle des gardiens** — les gardiens d'un fait sont les objets, parmi
{le fait, son dossier, son sujet, sa cible}, dont le niveau est restreint ou
privé. L'accès au contenu exige d'être habilité auprès de **tous** les gardiens,
ou de disposer de la dérogation correspondante. Exiger un seul gardien serait
une fuite.

**Une seule implémentation** — `src/visibilite/predicats.ts`, servi par le
service `visibilite`, qui n'expose aucune route. Ne jamais réécrire la règle
ailleurs.

### Comment lire, en pratique

```ts
const client = this.visibilite.clientPour(agent);   // filtré
this.prisma.sansFiltre.entite.findUnique(...)       // à justifier en revue
```

`pourAgent()` construit un client Prisma étendu dont **chaque lecture**
d'entité, de fait et de dossier porte le prédicat. Un service qui oublierait de
filtrer lit quand même filtré : c'est tout l'intérêt de le poser là.

Trois pièges à connaître :

- **`entite.valeurs` ignore la visibilité.** La colonne agrège tous les faits.
  La servir telle quelle est la fuite la plus facile à commettre : la fiche
  recompose sa projection depuis les seuls faits visibles.
- **`PrismaClient` renvoie un Proxy depuis son constructeur.** Dans une méthode
  appelée à travers lui, `this` désigne l'objet enveloppé, dépourvu des
  accesseurs de modèles. `PrismaService` capture le Proxy dans son constructeur.
- **Aucune whitelist ne porte sur un fait.** L'habilitation existe par dossier
  et par entité seulement : marquer un fait restreint revient donc à le réserver
  à qui détient la dérogation correspondante.

Les deux dérogations ne sont pas indépendantes : `acces.derogatoire.prive` ouvre
aussi le restreint. L'inverse produirait un agent autorisé sur le privé mais
bloqué sur le moins sensible.

### Les six vecteurs de fuite par déduction

| Vecteur | Contre-mesure |
| --- | --- |
| Compteurs d'onglets | Ne comptent que les faits visibles par l'agent |
| Erreur d'accès à un objet privé | Toujours **404, jamais 403** |
| Recherche globale | Objets privés absents, sans mention |
| Détection de doublons | Ne propose jamais une entité privée |
| Signaux de l'accueil | Calculés **après** filtrage |
| Recherche de chemin | Élagage **avant** traversée |

Conséquence assumée : un agent peut créer un doublon d'une entité qu'il ne voit
pas. Ne pas tenter de l'empêcher — toute contre-mesure révélerait l'entité.

---

## Les pièges techniques

- **`visibilite_effective` en trigger `BEFORE`.** En `AFTER`, la ligne renvoyée
  par le `RETURNING` d'un `create` Prisma serait périmée.
- **Triggers, vues et index partiels vivent dans `prisma/sql/`**, recopiés dans
  les migrations. Ils ne sont pas dans `schema.prisma` et un `prisma db pull`
  ne les verra pas. Voir `prisma/sql/README.md`.
- **Une route sans décorateur `@Permission(...)` est refusée par défaut.** Un
  oubli doit produire un refus, jamais une ouverture. Seule exception câblée et
  testée : `GET /sante`.
- **L'entité créée en cascade est persistée avant le lien qui la désigne**, donc
  avant l'entité parente.
- **L'anonymisation d'un agent ne doit jamais casser une clé étrangère.** Elle
  efface les données personnelles, conserve l'enregistrement, réécrit
  `matricule` en valeur technique dérivée de l'`id` — jamais `NULL`, la colonne
  est unique — et incrémente `token_version`.
- **Le journal désigne un agent par son `id`, jamais par son matricule ni son
  nom.** Une trace qui recopierait ces valeurs les rendrait relisibles après une
  anonymisation, qui perdrait alors son sens. Un test le vérifie.
- **`journal_audit.id` est un `bigserial`**, que `JSON.stringify` ne sait pas
  sérialiser. Les DTO du lot 11 devront le convertir explicitement.
- **npm intercepte les options longues qu'il ne connaît pas**, même après `--`.
  Les commandes lancées par `npm run` prennent des arguments positionnels.

---

## Conventions du dépôt

- **Français partout** : noms de tables, de colonnes, de modules, de routes, de
  variables, commentaires et messages. `snake_case` en base, `camelCase` en
  TypeScript.
- Un module par domaine, suivant le découpage de la conception technique §7.1.
- Les DTO portent les décorateurs `@nestjs/swagger` : le contrat OpenAPI en
  découle, et le front en dérive son client typé.
- **Règle de déploiement** : quand le contrat change, le back se déploie avant
  le front.

## Permissions et gardes

Deux gardes globaux, dans cet ordre : `GardeAuthentification` résout l'agent en
le **relisant en base à chaque requête** — c'est ce qui rend `token_version`,
`actif` et `anonymise` immédiatement opposables — puis `GardePermission` décide.

Quatre décorateurs, et un seul défaut :

| Décorateur | Effet |
| --- | --- |
| `@Publique()` | Sans jeton. Réservé à `/sante` et `/auth/login` |
| `@Permissions(...)` | Toutes les permissions listées sont exigées |
| `@SuperAdminSeul()` | Câblé en dur. Aucune permission ne l'ouvre |
| `@SansPermission()` | Authentifié, sans permission particulière — déclaration explicite |
| `@AutoriseeEnChangementImpose()` | Joignable par un compte en changement de mot de passe imposé |
| *rien* | **Refusé** |

`@SuperAdminSeul()` couvre la configuration du modèle métier. Elle ne se délègue
pas par un jeu de permissions reconfigurable, sous peine qu'un grade puisse
s'accorder le droit de la modifier.

Le catalogue vit dans `src/agents/permissions.ts`. Il reprend la conception
§6.7, plus `agent.gerer` et `role.gerer` : le catalogue accordait
`agent.anonymiser` à l'État-Major, lui refuser la création d'un compte tout en
lui permettant d'en retirer un aurait été incohérent.

## Commandes

```bash
docker compose -f docker-compose.dev.yml up      # base + API
npm run start:dev                                # API seule, base en conteneur
npm run agent:super-admin -- <matricule> <prénom> <nom>
npm run semences:madrina                         # parcours de référence
npm test                                         # tests unitaires
npm run test:e2e                                 # intégration, base de test dédiée
npm run lint
npx prisma migrate dev                           # migrations déclaratives
npm run sql:migration -- <nom> prisma/sql/...    # migrations de triggers et index
```

Les tests d'intégration tournent sur `centrale_ni_test`, base distincte de celle
de développement : ils vident des tables. `npm run test:e2e` la crée et y
applique les migrations avant de lancer jest.

## Avancement

| Lot | État |
| --- | --- |
| 0 — Socle technique | fait |
| 1 — Authentification et agents | fait |
| 3 — Référentiel | fait |
| 4 — Entités et faits | fait |
| 5 — Visibilité et permissions | fait |
| 7 — Fiche entité (back) | fait |
| 8 — Dossiers | à faire |
| 9 — Graphe | à faire |
| 10 — Signaux | à faire |
| 11 — Traçabilité | à faire |
| 12 — Exploitation | à faire |

Les lots 2 et 6 sont côté front.

## Critère de réussite du projet

Rejouer intégralement le **parcours Madrina** (étude du besoin, annexe B) et
faire ressortir Isadora Morales **sans qu'aucun agent n'ait tracé de lien entre
elle et Tyron Banks**. Le rapprochement doit tomber seul, par le graphe.
