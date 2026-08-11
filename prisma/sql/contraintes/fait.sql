


ALTER TABLE fait DROP CONSTRAINT IF EXISTS fait_coherence;
ALTER TABLE fait ADD CONSTRAINT fait_coherence CHECK (
  (nature = 'champ'
     AND definition_champ_id IS NOT NULL
     AND type_lien_id IS NULL
     AND cible_id IS NULL)
  OR
  (nature = 'lien'
     AND type_lien_id IS NOT NULL
     AND cible_id IS NOT NULL
     AND definition_champ_id IS NULL
     AND valeur IS NULL)
);


ALTER TABLE fait DROP CONSTRAINT IF EXISTS fait_fiabilite;
ALTER TABLE fait ADD CONSTRAINT fait_fiabilite CHECK (fiabilite BETWEEN 1 AND 4);


ALTER TABLE fait DROP CONSTRAINT IF EXISTS fait_source_non_vide;
ALTER TABLE fait ADD CONSTRAINT fait_source_non_vide CHECK (btrim(source) <> '');


ALTER TABLE fait DROP CONSTRAINT IF EXISTS fait_pas_de_boucle;
ALTER TABLE fait ADD CONSTRAINT fait_pas_de_boucle CHECK (cible_id IS NULL OR cible_id <> sujet_id);
