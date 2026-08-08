-- Contraintes de cohérence du fait, inexprimables dans schema.prisma.

-- Un fait est un champ ou un lien, jamais les deux, jamais ni l'un ni l'autre.
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

-- Quatre niveaux ordonnés : 1 douteux, 2 à confirmer, 3 probable, 4 certain.
ALTER TABLE fait DROP CONSTRAINT IF EXISTS fait_fiabilite;
ALTER TABLE fait ADD CONSTRAINT fait_fiabilite CHECK (fiabilite BETWEEN 1 AND 4);

-- Invariant : aucun fait sans source. `NOT NULL` ne suffit pas, une chaîne
-- vide en tiendrait lieu.
ALTER TABLE fait DROP CONSTRAINT IF EXISTS fait_source_non_vide;
ALTER TABLE fait ADD CONSTRAINT fait_source_non_vide CHECK (btrim(source) <> '');

-- Un lien vers soi-même n'apporte rien et fausserait le graphe.
ALTER TABLE fait DROP CONSTRAINT IF EXISTS fait_pas_de_boucle;
ALTER TABLE fait ADD CONSTRAINT fait_pas_de_boucle CHECK (cible_id IS NULL OR cible_id <> sujet_id);
