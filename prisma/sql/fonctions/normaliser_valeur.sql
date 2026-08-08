-- Clé de comparaison des valeurs uniques.
--
-- Sans normalisation, « 20DCC874 », « 20dcc874 » et « Moralès » contre
-- « Morales » passeraient pour des valeurs distinctes, et la plaque en double
-- que l'unicité doit refuser passerait au travers.
--
-- La forme `unaccent(regdictionary, text)` est IMMUTABLE, contrairement à
-- `unaccent(text)` : c'est elle qui permet d'utiliser la fonction dans un index.

CREATE OR REPLACE FUNCTION normaliser_valeur(p_valeur text)
RETURNS text AS $$
  SELECT lower(unaccent('unaccent'::regdictionary, btrim(p_valeur)));
$$ LANGUAGE sql IMMUTABLE;
