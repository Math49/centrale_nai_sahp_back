-- Index du cœur.
--
-- Les deux premiers sont les plus importants de l'application : ils servent
-- chaque fiche et chaque chargement du graphe. Partiels sur `etat = 'actif'`,
-- ce que `@@index` ne sait pas exprimer.

CREATE INDEX IF NOT EXISTS idx_fait_sujet_actif ON fait (sujet_id) WHERE etat = 'actif';
CREATE INDEX IF NOT EXISTS idx_fait_cible_actif ON fait (cible_id) WHERE etat = 'actif';

CREATE INDEX IF NOT EXISTS idx_fait_type_lien ON fait (type_lien_id);
CREATE INDEX IF NOT EXISTS idx_fait_definition_champ ON fait (definition_champ_id);

CREATE INDEX IF NOT EXISTS idx_entite_type ON entite (type_entite_id);
CREATE INDEX IF NOT EXISTS idx_entite_etat ON entite (etat);

-- Similarité trigramme : détection de doublons à la frappe.
CREATE INDEX IF NOT EXISTS idx_entite_libelle_trgm ON entite USING gin (libelle gin_trgm_ops);

-- Recherche dans la projection des valeurs.
CREATE INDEX IF NOT EXISTS idx_entite_valeurs ON entite USING gin (valeurs);
