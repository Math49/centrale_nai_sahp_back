-- Migration générée depuis prisma/sql/ par scripts/creer-migration-sql.mjs.
-- Ne pas modifier ici : corriger le fichier source puis créer une nouvelle migration.

-- source : prisma/sql/index/graphe.sql
-- Unicité de la disposition mémorisée.
--
-- Une position par entité et par dossier, plus une position globale. En SQL,
-- deux `NULL` sont distincts : une contrainte unique ordinaire sur
-- (entite_id, dossier_id) laisserait donc s'accumuler les positions globales
-- d'une même entité. D'où deux index partiels plutôt qu'un seul.

CREATE UNIQUE INDEX IF NOT EXISTS idx_position_par_dossier
  ON position_graphe (entite_id, dossier_id)
  WHERE dossier_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_position_globale
  ON position_graphe (entite_id)
  WHERE dossier_id IS NULL;
