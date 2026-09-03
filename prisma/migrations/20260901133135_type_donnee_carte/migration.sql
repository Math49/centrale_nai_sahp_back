-- Nouveau type de champ : un point posé sur le plan de la centrale.
--
-- Écrite à la main plutôt qu'engendrée : `prisma migrate dev` se bloque sur un
-- verrou d'avis de cette machine (voir CLAUDE.md), et un diff proposerait au
-- passage de supprimer les index de `prisma/sql/`.
--
-- `ALTER TYPE ... ADD VALUE` est permis dans une transaction depuis
-- PostgreSQL 12, tant que la valeur ajoutée n'est pas utilisée dans la même :
-- cette migration se contente de l'ajouter.
ALTER TYPE "type_donnee" ADD VALUE IF NOT EXISTS 'carte';
