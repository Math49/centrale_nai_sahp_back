

CREATE INDEX IF NOT EXISTS idx_fait_dossier ON fait (dossier_id);


CREATE INDEX IF NOT EXISTS idx_fait_visibilite_effective ON fait (visibilite_effective);


CREATE INDEX IF NOT EXISTS idx_entite_non_publique ON entite (id) WHERE visibilite <> 'public';

CREATE INDEX IF NOT EXISTS idx_dossier_entite_pivot ON dossier (entite_pivot_id);
