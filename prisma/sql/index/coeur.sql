


CREATE INDEX IF NOT EXISTS idx_fait_sujet_actif ON fait (sujet_id) WHERE etat = 'actif';
CREATE INDEX IF NOT EXISTS idx_fait_cible_actif ON fait (cible_id) WHERE etat = 'actif';

CREATE INDEX IF NOT EXISTS idx_fait_type_lien ON fait (type_lien_id);
CREATE INDEX IF NOT EXISTS idx_fait_definition_champ ON fait (definition_champ_id);

CREATE INDEX IF NOT EXISTS idx_entite_type ON entite (type_entite_id);
CREATE INDEX IF NOT EXISTS idx_entite_etat ON entite (etat);


CREATE INDEX IF NOT EXISTS idx_entite_libelle_trgm ON entite USING gin (libelle gin_trgm_ops);


CREATE INDEX IF NOT EXISTS idx_entite_valeurs ON entite USING gin (valeurs);
