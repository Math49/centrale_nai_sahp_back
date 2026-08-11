


CREATE OR REPLACE FUNCTION normaliser_valeur(p_valeur text)
RETURNS text AS $$
  SELECT lower(unaccent('unaccent'::regdictionary, btrim(p_valeur)));
$$ LANGUAGE sql IMMUTABLE;
