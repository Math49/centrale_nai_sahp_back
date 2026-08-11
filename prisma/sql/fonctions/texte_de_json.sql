


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


  RETURN p_valeur #>> '{}';
END;
$$ LANGUAGE plpgsql IMMUTABLE;
