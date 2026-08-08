-- Index du moteur de visibilité.

CREATE INDEX IF NOT EXISTS idx_fait_dossier ON fait (dossier_id);

-- Le prédicat de visibilité commence par écarter tout ce qui n'est pas public :
-- cet index sert ce premier tri.
CREATE INDEX IF NOT EXISTS idx_fait_visibilite_effective ON fait (visibilite_effective);

-- Les entités privées sont rares ; l'index partiel ne porte que sur elles.
CREATE INDEX IF NOT EXISTS idx_entite_non_publique ON entite (id) WHERE visibilite <> 'public';

CREATE INDEX IF NOT EXISTS idx_dossier_entite_pivot ON dossier (entite_pivot_id);
