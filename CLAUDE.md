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
   `ON DELETE RESTRICT`. Deux exceptions bornées :

   - `POST /entites/:id/annuler-creation` retire une saisie en cascade
     abandonnée. Elle ne porte pas sur de l'information établie mais sur une
     frappe qui n'est jamais allée au bout, et quatre verrous la retiennent —
     auteur, heure, aucune référence entrante, aucun dossier.
   - `DELETE /fichiers/:id` retire une image qu'**aucun fait n'utilise** — un
     dépôt raté, pas une pièce d'enquête. Refusée en 409 dès qu'un fait s'y
     rattache, et tracée comme tout le reste.

   **Arbitré, ne pas revenir dessus sans raison neuve.** L'étude du besoin le
   décide explicitement (§6.6 et journal des modifications v1.3 : « annulation
   explicite, qui supprime ce qui vient d'être créé »). Un archivage silencieux
   aurait deux effets concrets : il **verrouillerait la valeur unique pour
   toujours** — `valeur_unique` ne se recalcule que depuis `fait`, et aucun
   trigger sur `entite` ne la touche, donc une plaque abandonnée resterait prise
   — et il remplirait la liste des orphelines, qui existe pour les coupures
   brutales et non pour les annulations voulues. La suppression écrit sa propre
   trace d'audit : le geste reste lisible même si la ligne part.

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

## Le type de champ « carte »

Un point posé sur le plan de la centrale, **normalisé entre 0 et 1** — une
position relative, jamais un pixel. C'est ce qui permet de changer de fond de
carte sans déplacer un point déjà posé.

`Fait.valeur` et `Entite.valeurs` étant déjà en `jsonb`, **aucune migration de
colonne** n'a été nécessaire ; `projeter_entite` et les triggers sont agnostiques
au type de donnée.

Trois endroits, et deux où l'oubli est silencieux :

1. **`ValidationDynamiqueService`** — `case TypeDonnee.carte`. Le `switch` n'a
   pas de `default` et la méthode déclare un retour non optionnel : ajouter une
   valeur à l'énumération **casse la compilation** tant que le cas manque. C'est
   le filet, et le seul des trois qui en soit un.
   Il ne retient que `x`, `y`, `typeRepereId` et `couleur` : une clé de plus,
   venue d'un client bavard, s'installerait dans la projection sans que rien ne
   la valide.
   C'est aussi **le seul validateur asynchrone**, et pour une seule raison : un
   point cite un type de repère, et vérifier qu'il existe demande la base. Le
   faire chez les deux services appelants écrirait la règle deux fois.
2. **`verifierCoherenceChamp`** — l'unicité est refusée sur un point.
   `valeur_unique` indexe la forme *textuelle* d'une valeur : deux points cliqués
   à un pixel près donneraient deux clés distinctes, et deux points confondus
   verrouilleraient une position pour toute la centrale. Deux planques peuvent
   partager une adresse. **Silencieux si oublié.**
3. **`verifierTypesDuGabarit`** — un gabarit de libellé ne peut pas citer un
   champ carte. Le libellé est le nom sous lequel la donnée apparaît partout ;
   « Planque 0.5098 · 0.4968 » n'est pas un nom. Refusé à la configuration, où
   l'administrateur peut corriger. **Silencieux si oublié.**

### Le point porte son type et sa couleur

Un point de fiche est `{x, y, typeRepereId, couleur}`. Les deux dernières clés
sont **facultatives à l'écriture** — un point posé avant qu'elles existent reste
un point, et un service qui n'a défini aucun type doit pouvoir en poser un —
mais toujours **présentes à la relecture** : `typeRepereId` à `null`, `couleur`
ramenée à l'accent. Un `undefined` qui traverse une projection finit toujours
par surprendre quelqu'un.

**`typeRepereId` n'est tenu par aucune clé étrangère** : il vit dans du `jsonb`.
La cohérence s'établit donc à deux endroits, et il faut les deux —
`validerTypeRepere` à l'écriture, `CarteService.verifierTypeNonCite` à la
suppression du type. Ce second comptage porte sur **tous** les faits, y compris
infirmés et archivés : un point qu'on a cessé de croire reste à relire.

`texte_de_json` reconnaît un objet `{x, y}` et le rend
« 0.5098 · 0.4968 ». C'est le filet du point 3, pour tous les autres chemins qui
passent par cette fonction — sans lui, le repli sérialisait le JSON brut, ce qui
n'est pas une erreur mais pire : c'est plausible.

Le type `fichier` a le même défaut que `carte` vis-à-vis des gabarits — sa
valeur est toujours nulle, donc il s'efface silencieusement du libellé. Il est
antérieur, et l'ajouter au contrôle empêcherait de modifier un type qui le cite
déjà : à traiter à part, en connaissance de cause.

## Ce qui se reprend sur un fait

`PATCH /faits/:id` distingue la **valeur** du fait de ce qu'on en sait.

La valeur ne se modifie que sur un **champ** : « un lien mal posé s'infirme »,
et l'API le refuse en 400. La source, la fiabilité, la date de constatation et
la visibilité, elles, se reprennent sur **les deux natures** — ce sont des
métadonnées du fait, pas son contenu. Un lien bien posé mais mal noté n'a jamais
eu besoin d'être infirmé ; c'est l'écran qui n'en offrait pas le geste.

## Archivage d'un dossier

`POST /dossiers/:id/archiver` et `/desarchiver`, sous `dossier.archiver` — un
geste distinct de `dossier.modifier`, comme `entite.archiver` l'est de
`entite.modifier` : on peut renommer une enquête sans avoir le droit de la clore.
Un seul code pour les deux sens, comme `carte.archiver`.

Le dossier archivé **quitte `GET /dossiers` mais rien d'autre** : son suivi, ses
habilitations et les faits qui le citent comme dossier de saisie restent
intacts, et il en reste le gardien. `?archives=true` le rend à la liste.

**Un dossier archivé se lit et s'écrit encore**, comme une entité archivée :
l'archivage n'a jamais fermé la saisie de ce côté-ci, et deux comportements
différents pour le même mot seraient impossibles à retenir.

## Graphe

Le cache vit en mémoire, chargé au démarrage et **invalidé par événement** :
tout service qui écrit sur `entite`, `fait`, `dossier` ou `suivi` appelle
`bus.signaler()`. Un nouveau chemin d'écriture qui l'oublierait laisserait le
graphe périmé sans que rien ne le signale — c'est le point de vigilance du
module.

**Il contient tout, et n'est jamais servi brut.** L'élagage se fait **avant
traversée, jamais après** : filtrer le résultat d'un parcours mené sur le
graphe complet reviendrait à dire « un chemin existe, mais vous n'y avez pas
droit », ce qui serait déjà l'avoir dit.

**Une écriture hors du processus laisse le cache périmé.** Le bus d'invalidation
vit dans le processus Nest : une commande de peuplement, une migration de
données ou un `psql` à la main écrivent en base sans que l'API l'apprenne, et
`/graphe/complet` renverra zéro nœud jusqu'au redémarrage. Après tout `npm run
semences:*` lancé depuis l'hôte :

```bash
docker compose -f docker-compose.dev.yml restart api
```

`GET /graphe/complet` sert **la vue entière** — tous les nœuds visibles, toutes
les arêtes franchissables, sans point de départ. C'est ce que charge l'écran de
graphe, qui navigue dans une carte plutôt que de déplier saut par saut.

La décision reste celle de `contenuAccessible` : la règle des gardiens ne
s'écrit qu'à un endroit. Seule la façon de rassembler les gardiens change —
en mémoire plutôt qu'en base.

Le **plus solide** maximise le minimum de fiabilité. Les quatre niveaux étant
peu nombreux, on cherche par seuil décroissant plutôt qu'avec un Dijkstra :
le premier seuil qui relie encore donne le meilleur maillon faible possible.

## Signaux

Trois familles, **toutes calculées après filtrage**, jamais avant :

| Famille | Ce qu'elle remarque | Réserve |
| --- | --- | --- |
| Recoupement | Une entité suivie par plusieurs dossiers | Se tait si les pivots sont déjà reliés |
| Récurrence | Une entité reliant des entités de dossiers différents | Calculée par le graphe, sur la vue élaguée |
| Vieillissement | Un fait « à confirmer » non revu | Seuil `VIEILLISSEMENT_JOURS`, 30 par défaut |

Le recoupement part des dossiers dont le **contenu** est lisible, pas de ceux
dont l'existence l'est : un dossier restreint montre son nom et garde son suivi
fermé, et recouper dessus dirait qui il surveille.

« Revu » se lit sur `fait.modifie_le`, que le trigger `trg_fait_horodatage`
réécrit à chaque `UPDATE`. Un test qui veut vieillir un fait doit désarmer ce
trigger : c'est la base qui garantit qu'un fait ne peut pas se déclarer revu
sans l'avoir été.

## Traçabilité

Deux journaux, deux tables : `journal_consultation` (lectures de fiche) et
`journal_audit` (écritures). Tous deux **applicatifs et non triggers** — un
trigger ne connaît pas l'agent courant.

`IntercepteurJournal` est monté globalement, et **en sortie seulement** : une
requête refusée ou en erreur n'a rien produit, et la journaliser laisserait
croire à un geste qui n'a pas eu lieu.

L'audit générique ne s'écrit **que si le service n'a pas tracé lui-même**.
`ContexteJournal` tient ce décompte dans un `AsyncLocalStorage`, parce que la
trace part souvent de l'intérieur d'une transaction, loin de la requête HTTP.
Conséquence voulue : **le mode de défaillance de l'oubli est une trace pauvre,
jamais un silence** — il n'y a rien à se rappeler de faire.

Piège à connaître : la portée doit envelopper l'**abonnement** à l'observable,
pas sa construction. `suite.handle()` ne fait que décrire le traitement ; Nest
ne s'y abonne qu'après, et une portée ouverte autour du seul appel laisserait le
contrôleur s'exécuter dehors.

Marquer une route de lecture de fiche avec `@Consultation('entite' | 'dossier')`
— pas toute lecture : noter chaque annuaire noierait un journal qui existe pour
être relu. `@HorsAudit()` dispense une écriture qui ne touche pas
l'information d'enquête, et se justifie en revue.

`derogation` distingue la lecture permise par habilitation nominative de celle
qui n'a été possible que par une permission dérogatoire. C'est ce que le journal
existe pour rendre visible.

## Cycle de vie

**Infirmation** — `POST /faits/:id/infirmer`, motif obligatoire. Le motif vit
dans le journal, pas sur le fait : c'est une circonstance du geste, pas une
propriété de l'information. Les triggers font le reste — la projection ignore
les faits non actifs, donc la valeur quitte la fiche, et `valeur_unique` se
recalcule, donc la plaque redevient attribuable.

**Fusion** — `POST /entites/:id/fusion`, où `:id` est **absorbée** et `versId`
subsiste, dans le sens de la colonne `fusionnee_vers_id`. Deux précautions :
les liens entre les deux doublons s'infirment d'abord, sans quoi ils
violeraient `fait_pas_de_boucle` ; suivis et habilitations se reportent par
upsert, leurs clés primaires étant composites. L'absorbée reste en base,
archivée, et redirige.

**Classement en restreint ou privé** — `visibilite.verifierDroitDeClasser`, le
seul endroit. Le contrôle n'existait que côté dossier jusqu'au lot 11 : entité
et fait acceptaient un niveau sans vérifier `visibilite.definir`.

## Fichiers

Quatre règles, et la quatrième est celle qu'on oublie :

- **jamais servi en statique** — aucun dossier n'est exposé par le proxy, un
  contrôleur vérifie l'accès à la fiche avant de renvoyer l'octet ;
- **nom opaque** sur le volume, le nom d'origine ne vivant qu'en base ;
- **type reconnu sur le contenu**, jamais sur l'extension ;
- **métadonnées retirées sans réencodage** — on écarte des segments, on ne
  recompresse pas : une pièce d'enquête ne doit pas ressortir dégradée du dépôt.
  C'est aussi ce qui évite une dépendance native au traitement d'image.

Le stockage multer est **en mémoire**, à dessein : le fichier doit être reconnu
et nettoyé avant d'atteindre le volume. Un stockage sur disque écrirait d'abord
et vérifierait ensuite, ce qui laisserait passer l'original.

Le résultat du nettoyage est **relu** (`porteDesMetadonnees`) avant l'écriture :
un nettoyage qui aurait échoué fait refuser le dépôt plutôt que de verser une
image encore géolocalisée.

Le chemin opaque ne se relit nulle part — ni dans un DTO, ni dans le journal
d'audit. C'est la seule chose qui protège le volume.

## Migrations — ce qui marche ici

`prisma migrate dev` **se bloque sur cette machine** : il prend un verrou
d'avis PostgreSQL et ne le rend pas toujours. Symptôme : `P1002 — Timed out
trying to acquire a postgres advisory lock`. On s'en sort en terminant la
session fautive :

```sql
SELECT l.pid, a.state, a.backend_start FROM pg_locks l
  JOIN pg_stat_activity a ON a.pid = l.pid WHERE l.locktype = 'advisory';
SELECT pg_terminate_backend(<pid>);
```

La voie fiable pour une migration déclarative :

```bash
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script
```

puis recopier le résultat dans `prisma/migrations/<horodatage>_<nom>/migration.sql`
et appliquer avec `npx prisma migrate deploy`.

**Retirer les `DROP INDEX` du diff.** L'outil propose de supprimer les index
qu'il ne connaît pas — ceux de `prisma/sql/`. Les laisser passer déferait le
travail des lots précédents.

**L'ordre des migrations est celui des horodatages.** Une migration SQL générée
par `npm run sql:migration` porte l'heure courante : si elle dépend d'une table
créée par une migration écrite à la main, vérifier que celle-ci la précède.

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

### L'habilitation par entité — la porte qui manquait

`habilitation_entite` existait en base, `predicatFait` l'exigeait,
`AgentCourant` la portait, `habiliterSurEntite` était écrit — mais **aucune
route ne l'appelait**. Du code mort. Constaté en exploitation : une donnée
passée en restreint se fermait à tout le monde, et rien ne pouvait la rouvrir.
Habiliter sur le dossier qui la suit n'y changeait rien, ce qui donnait
exactement l'impression d'une panne du système d'habilitation.

Ce n'était pas le prédicat qui avait tort : **chaque gardien se franchit pour
lui-même**, et une donnée classée est un gardien à part entière. C'est la porte
qui manquait — `POST /entites/:id/habilitations` et son retrait, sous
`dossier.habiliter`.

Le 404 avant l'écriture n'est pas une politesse : accorder un accès sur une
fiche qu'on ne voit pas soi-même en confirmerait l'existence.

**Un fait classé, lui, ne se rouvre pas par habilitation** — aucune whitelist ne
porte sur un fait. C'est voulu, et `test/habilitation-dossier.e2e-spec.ts` le
fige pour que le choix reste explicite.

### La carte — une différence assumée avec les dossiers

Un repère suit le modèle des données : `visibilite` à trois niveaux **et**
habilitation nominative, `predicatRepere` dans `src/visibilite/predicats.ts`.

**Mais un repère classé est absent, pas muet.** Un dossier restreint montre son
nom et tait son contenu ; un repère, non — sur une carte, **la position est le
renseignement**. Un marqueur sans libellé à l'emplacement d'un labo dirait déjà
l'essentiel. D'où un prédicat calqué sur celui des entités, sans étage « contenu
lisible » : soit le repère est là, soit il n'existe pas pour cet agent.

Conséquence à ne pas défaire : le front ne doit rien ajouter qui compte,
mentionne ou signale un repère manquant.

`AgentCourant` porte désormais **quatre** listes d'habilitations — dossiers,
entités, repères — chargées à chaque requête par `garde-authentification`. Coût
mesuré, index sur `agent_id` comme les autres.

Le classement reste sous `visibilite.definir` et l'habilitation sous
`dossier.habiliter` : on ne double pas des gestes qui existent. `carte.consulter`,
`carte.annoter` et `carte.archiver` ne décrivent que ce que la carte ajoute.

**Le retrait d'un repère est un archivage**, jamais une suppression : ce qu'on a
cru savoir d'un terrain fait partie de l'enquête, même quand on cesse d'y croire.
Aucune route `DELETE` sur un repère — seuls les *types* s'en vont, et seulement
tant qu'aucun repère ne les utilise.

### La géométrie d'un repère

Trois formes, et pas une de plus : `{type:'point', x, y}`,
`{type:'rectangle', a, b}`, `{type:'cercle', centre, rayon}`, en coordonnées
normalisées entre 0 et 1. La forme doit correspondre à la **nature du type** —
un type « QG » n'accepte pas une zone. `CarteService.validerGeometrie` est le
seul gardien, comme `ValidationDynamiqueService` l'est pour un fait : la règle
dépend d'une donnée connue à l'exécution, aucun décorateur ne peut la tenir.

Le **polygone libre a existé et a disparu** : on le traçait sommet par sommet,
ce que personne ne faisait, et il rendait une zone impossible à corriger. Les
deux formes qui restent se tracent en deux clics. La migration convertit tout
polygone survivant en son rectangle englobant — rien ne se supprime dans cette
base, même une forme qu'on ne sait plus dessiner.

**Le rectangle est rangé à l'écriture** : `a` est toujours le coin haut gauche.
Sans ce tri, chaque lecteur devrait redécouvrir quel coin il tient.

### La couleur appartient au repère, pas au type

`TypeRepere` porte un code, un libellé, une nature et une icône — **pas de
couleur**. C'est le repère qui se signale : deux planques de même sorte
n'appellent pas la même teinte selon l'affaire, et une couleur portée par le
type obligeait à créer un type pour changer de teinte.

`Repere.couleur` est donc **obligatoire** à la pose. La migration a d'abord
recopié la couleur du type sur les repères qui n'en imposaient pas, avant de
faire tomber la colonne : personne ne change d'apparence.

### Enquêtes — assigner n'est pas habiliter

Une carte du tableau porte **deux tables d'agents**, et les confondre serait la
faute à ne pas commettre :

| | Répond à | Effet sur l'accès |
| --- | --- | --- |
| `AssignationCarte` | Qui s'en occupe ? | **Aucun** |
| `HabilitationCarteEnquete` | Qui a le droit de lire ? | Franchit le gardien |

Assigner un agent à une carte classée **ne la lui ouvre pas**. On confie parfois
un travail dont le détail n'est pas encore partagé, et une assignation qui
ouvrirait l'accès serait une porte dérobée dans le moteur de visibilité —
d'autant plus dangereuse qu'elle passerait pour une commodité.

`predicatCarteEnquete` ne connaît donc que les habilitations. Le DTO expose
`peutLire` par assigné, pour que l'écran puisse **prévenir** — et proposer
d'habiliter dans le même geste, jamais le faire d'office.

`kanban.ecrire` couvre l'assignation : désigner qui travaille est une
modification de la carte. L'habilitation reste sous `dossier.habiliter`.

Comme les repères, une carte classée hors de portée **n'apparaît pas** — pas même
anonyme : son titre nomme souvent ce qu'un dossier restreint protège. Et son
retrait est un **archivage** : une carte raconte une décision de travail, et cela
se relit.

**Le déplacement réécrit les rangs des deux colonnes touchées**, en entier.
C'est le seul moyen d'éviter les trous et les doublons quand deux agents
déplacent en même temps ; le tableau, lui, n'envoie que la carte et sa
destination — lui réclamer le jeu complet comme au référentiel serait pénible à
produire au moment d'un dépôt.

`AgentCourant` porte maintenant **quatre** listes d'habilitations : dossiers,
entités, repères, cartes d'enquête.

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
- **`journal_audit.id` et `journal_consultation.id` sont des `bigserial`**, que
  `JSON.stringify` ne sait pas sérialiser. Les DTO les convertissent en texte.
- **npm intercepte les options longues qu'il ne connaît pas**, même après `--`.
  Les commandes lancées par `npm run` prennent des arguments positionnels.
- **`npm run openapi` lit `dist/openapi.js`.** Régénérer le contrat sans avoir
  laissé le conteneur recompiler produit silencieusement un contrat périmé.

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

**Ne pas gouverner un écran par la permission de la zone qui l'héberge.** La
liste des entités orphelines vit en administration mais dépend
d'`entite.archiver`, pas de `journal.consulter` : lier une liste de ménage à la
permission des journaux signifierait qu'on ne peut confier l'une sans confier
l'autre, alors que le relevé de qui a consulté quoi est un pouvoir d'une tout
autre nature. Côté front, la zone Administration s'ouvre donc aussi sur
`entite.archiver`, chaque rubrique restant filtrée par la sienne.

### Consultation — la lecture est devenue un geste

Toute lecture était `@SansPermission()` : la seule question posée était « cet
objet vous est-il visible ? ». Cela suffisait tant que tout compte appartenait à
l'unité. Un grade destiné à l'extérieur demande d'ouvrir une zone sans les
autres, d'où trois codes : `entite.consulter`, `dossier.consulter`,
`graphe.consulter`.

Ils ne remplacent pas la visibilité, ils s'y ajoutent : **la permission dit si
l'écran s'ouvre, la visibilité dit ce qu'on y trouve.**

Restent délibérément ouverts : `/referentiel`, qui décrit la *forme* du modèle et
sans lequel le front ne rend rien ; `/roles`, savoir ce qu'un grade autorise ne
révélant aucune donnée ; et les routes `/auth/*`.

`/accueil` agrège trois blocs qui ne relèvent pas du même geste : sans
`dossier.consulter`, le bloc « mes dossiers » n'est pas masqué à l'affichage,
**il n'est pas calculé**.

### Ajouter un geste au catalogue — le piège

`initialiserLesGradesManquants` ne touche **jamais** un grade existant, et c'est
voulu : ses permissions sont configurables, les réécrire effacerait le travail
de l'administrateur. Mais un geste *nouveau* au catalogue est un autre cas — un
grade qui l'ignore perd un accès qu'il avait, sans que personne ne l'ait décidé.

D'où `alignerLesGradesLivres()`, appelée par `initialiser-production` au
démarrage du conteneur. Elle compare **chaque grade de `GRADES` à sa ligne en
base** et ajoute ce qui manque : ajouter une permission à `grades.ts` suffit
donc, sans commande à ne pas oublier. Elle n'enlève jamais rien, et ne connaît
que les grades que l'application livre — un grade créé à la main, un
« visiteur », reste celui de l'administrateur.

`accorderAuxGradesExistants()` demeure pour les cas ciblés, et sert la commande
manuelle.

`test/montee-grades.e2e-spec.ts` fige les quatre propriétés : elle rend, elle ne
décide pas pour les grades créés à la main, elle est idempotente, elle n'enlève
rien.

Pour l'appliquer à tous les grades, y compris ceux créés à la main :

```bash
npm run grades:consultation                                        # développement
npm run grades:consultation -- visiteur                            # sauf celui-ci
docker compose exec api node dist/commandes/accorder-consultation  # production
```

## Commandes

```bash
docker compose -f docker-compose.dev.yml up      # base + API
npm run start:dev                                # API seule, base en conteneur
npm run agent:super-admin -- <matricule> <prénom> <nom>
npm run grades:consultation [-- <grades à laisser>]
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

## Déploiement

`.github/workflows/build.yml` construit l'image, la pousse sur GHCR et déclenche
un webhook Portainer. **Le pipeline ne touche jamais aux données** : il ne
connaît ni la base ni les volumes.

Le conteneur démarre sur
`prisma migrate deploy && node dist/commandes/initialiser-production && node dist/main`.
Les trois étapes sont sûres et idempotentes :

- `migrate deploy` **applique** les migrations en attente. Il ne réinitialise
  jamais — c'est `migrate reset` qui détruit, et il n'apparaît nulle part.
- `initialiser-production` crée les grades manquants, monte les grades livrés
  vers les gestes nouvellement catalogués, et ne crée le premier super-admin que
  s'il n'en existe aucun.

Les volumes sont **nommés** (`donnees_postgres`, `fichiers`, `sauvegardes`) : ils
survivent à `up -d`, à `--force-recreate` et même à `down`. Ce qui les détruit,
et qui n'est jamais dans le pipeline :

- `docker compose down -v` (ou `--volumes`) ;
- supprimer la stack dans Portainer plutôt que la redéployer ;
- **renommer la stack ou la clé `name:` du compose** — le préfixe du volume
  change, un volume vide apparaît, et les données semblent avoir disparu alors
  qu'elles dorment sous l'ancien nom ;
- `docker volume rm`, `docker volume prune`, `docker system prune --volumes`.

Les commandes `semences:*` ne suppriment rien, mais elles **ajoutent** un jeu de
démonstration : elles n'ont rien à faire en production.

`docker-compose.yml` — quatre services et une tâche de sauvegarde. Les secrets
vivent dans `.env.production`, jamais versionné ; `.env.production.example` en
donne la forme.

`deploiement/Caddyfile` ne sert **aucun dossier en statique**, et c'est
volontaire au point de mériter d'être vérifié à chaque relecture : un
`file_server` sur le volume de fichiers annulerait tout le moteur de visibilité.

Les sauvegardes portent sur **la base et le volume**, dans une paire d'archives
au même horodatage. Une base restaurée sans ses images est à moitié perdue :
aucune source ne permet de réimporter les photos versées. `restaurer.sh` vérifie
en fin de course que le décompte des images correspond à la table `fichier`, et
échoue sur un écart.

## Avancement

| Lot | État |
| --- | --- |
| 0 — Socle technique | fait |
| 1 — Authentification et agents | fait |
| 3 — Référentiel | fait |
| 4 — Entités et faits | fait |
| 5 — Visibilité et permissions | fait |
| 7 — Fiche entité (back) | fait |
| 8 — Dossiers | fait |
| 9 — Graphe | fait |
| 10 — Signaux | fait |
| 11 — Traçabilité | fait |
| 12 — Exploitation | fait |
| 14 — Champ « carte » | fait |
| 15 — Carte et repères | fait |
| 16 — Enquêtes (kanban) | fait |

Les lots 2 et 6 sont côté front.

## Critère de réussite du projet

Rejouer intégralement le **parcours Madrina** (étude du besoin, annexe B) et
faire ressortir Isadora Morales **sans qu'aucun agent n'ait tracé de lien entre
elle et Tyron Banks**. Le rapprochement doit tomber seul, par le graphe.

`test/recette-madrina.e2e-spec.ts` le rejoue **par l'API**, sur base vierge et
par un compte Junior. C'est le test à faire tourner avant toute mise en
production, et le seul qui dise si le projet tient sa promesse.
