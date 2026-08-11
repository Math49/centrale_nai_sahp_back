


CREATE OR REPLACE FUNCTION recalculer_valeurs_uniques(p_entite_id uuid)
RETURNS void AS $$
DECLARE
  v_conflit record;
BEGIN
  DELETE FROM valeur_unique WHERE entite_id = p_entite_id;


  FOR v_conflit IN
    SELECT DISTINCT dc.libelle AS champ,
                    texte_de_json(f.valeur) AS valeur
      FROM fait f
      JOIN definition_champ dc ON dc.id = f.definition_champ_id
      JOIN entite e ON e.id = f.sujet_id
      JOIN valeur_unique vu
        ON vu.type_entite_id = e.type_entite_id
       AND vu.definition_champ_id = dc.id
       AND vu.valeur_normalisee = normaliser_valeur(texte_de_json(f.valeur))
     WHERE f.sujet_id = p_entite_id
       AND f.nature = 'champ'
       AND f.etat = 'actif'
       AND dc.est_unique
       AND vu.entite_id <> p_entite_id
  LOOP
    RAISE EXCEPTION 'valeur déjà attribuée : % « % »', v_conflit.champ, v_conflit.valeur
      USING ERRCODE = 'unique_violation';
  END LOOP;

  INSERT INTO valeur_unique (type_entite_id, definition_champ_id, valeur_normalisee, entite_id)
  SELECT DISTINCT e.type_entite_id,
                  dc.id,
                  normaliser_valeur(texte_de_json(f.valeur)),
                  e.id
    FROM fait f
    JOIN definition_champ dc ON dc.id = f.definition_champ_id
    JOIN entite e ON e.id = f.sujet_id
   WHERE f.sujet_id = p_entite_id
     AND f.nature = 'champ'
     AND f.etat = 'actif'
     AND dc.est_unique
     AND COALESCE(normaliser_valeur(texte_de_json(f.valeur)), '') <> '';
END;
$$ LANGUAGE plpgsql;
