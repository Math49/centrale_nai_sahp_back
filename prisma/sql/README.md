# prisma/sql — l'autre moitié de la base

Prisma ne connaît ni les triggers, ni les vues, ni les index partiels. Ce dossier
en est la **source canonique**. Le schéma déclaratif (`schema.prisma`) et ce dossier
décrivent ensemble l'état réel de la base ; ni l'un ni l'autre ne suffit seul.

## Règle d'or du dépôt

> La base garantit que la donnée ne peut pas devenir incohérente,
> l'application décide qui a le droit de la voir.

Tout ce qui relève de la première moitié de cette phrase s'écrit ici.

## Organisation

| Dossier | Contenu |
| --- | --- |
| `fonctions/` | Fonctions PL/pgSQL appelées par les triggers |
| `triggers/` | `CREATE TRIGGER`, un fichier par trigger |
| `index/` | Index partiels et index GIN, inexprimables en `@@index` Prisma |
| `vues/` | Vues éventuelles |

## Convention d'écriture

Chaque script est **idempotent** : `CREATE OR REPLACE FUNCTION`,
`DROP TRIGGER IF EXISTS` avant `CREATE TRIGGER`, `CREATE INDEX IF NOT EXISTS`.
Rejouer un script ne doit jamais échouer ni détruire de donnée.

## Convention d'application

Un script de ce dossier n'est **jamais appliqué directement à la base**. Il est
recopié dans une migration Prisma, qui reste la seule voie d'application :

```bash
npm run sql:migration -- <nom_de_migration> prisma/sql/triggers/mon_trigger.sql
```

La commande crée `prisma/migrations/<horodatage>_<nom>/migration.sql` contenant
le contenu des fichiers cités. On applique ensuite normalement :

```bash
npx prisma migrate dev
```

## Piège connu

`visibilite_effective` doit être calculée par un trigger **`BEFORE`**. En `AFTER`,
la ligne renvoyée par le `RETURNING` d'un `create` Prisma serait périmée : l'API
retournerait une visibilité fausse à l'appelant qui vient d'écrire.
