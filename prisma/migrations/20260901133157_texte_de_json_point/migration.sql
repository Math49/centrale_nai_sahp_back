-- Migration générée depuis prisma/sql/ par scripts/creer-migration-sql.mjs.
-- Ne pas modifier ici : corriger le fichier source puis créer une nouvelle migration.

-- source : prisma/sql/fonctions/texte_de_json.sql
CREATE OR REPLACE FUNCTION texte_de_json(p_valeur jsonb)
RETURNS text AS $$
BEGIN
  IF p_valeur IS NULL OR jsonb_typeof(p_valeur) = 'null' THEN
    RETURN NULL;
  END IF;

  IF jsonb_typeof(p_valeur) = 'array' THEN
    RETURN (
      SELECT string_agg(texte_de_json(element), ', ')
        FROM jsonb_array_elements(p_valeur) AS element
    );
  END IF;

  -- Un point de carte, `{"x": 0.51, "y": 0.32}`.
  --
  -- Sans cette branche, le repli plus bas rendrait la sérialisation JSON brute,
  -- et un gabarit de libellé citant un champ carte produirait « Planque
  -- {"x": 0.51, "y": 0.32} ». Ce n'est pas une erreur, c'est pire : c'est
  -- plausible, et rien ne le signale.
  --
  -- L'application refuse déjà qu'un gabarit cite un champ carte ; ceci est le
  -- filet, pour tous les autres chemins qui passent par cette fonction.
  IF jsonb_typeof(p_valeur) = 'object'
     AND jsonb_typeof(p_valeur -> 'x') = 'number'
     AND jsonb_typeof(p_valeur -> 'y') = 'number'
  THEN
    RETURN round((p_valeur ->> 'x')::numeric, 4)::text
           || ' · '
           || round((p_valeur ->> 'y')::numeric, 4)::text;
  END IF;

  RETURN p_valeur #>> '{}';
END;
$$ LANGUAGE plpgsql IMMUTABLE;
