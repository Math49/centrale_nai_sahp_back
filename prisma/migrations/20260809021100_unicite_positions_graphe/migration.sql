


CREATE UNIQUE INDEX IF NOT EXISTS idx_position_par_dossier
  ON position_graphe (entite_id, dossier_id)
  WHERE dossier_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_position_globale
  ON position_graphe (entite_id)
  WHERE dossier_id IS NULL;
