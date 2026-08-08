-- Rend lisible une valeur de fait, quel que soit son type de donnée.
--
-- Les valeurs de champs sont stockées en jsonb : une chaîne, un nombre, un
-- booléen, ou un tableau pour les champs multiples. Le gabarit de libellé et la
-- clé d'unicité ont besoin d'un texte.
--
-- En PL/pgSQL et non en SQL : la fonction s'appelle elle-même pour les
-- tableaux, et une fonction SQL ne peut pas se référencer avant d'exister.

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

  -- #>> '{}' déballe une chaîne sans ses guillemets, et rend les autres
  -- scalaires sous leur forme textuelle.
  RETURN p_valeur #>> '{}';
END;
$$ LANGUAGE plpgsql IMMUTABLE;
