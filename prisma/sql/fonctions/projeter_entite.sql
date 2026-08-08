-- Projection des faits sur l'entité : `entite.valeurs` et `entite.libelle`.
--
-- La vérité est dans `fait`. Cette fonction en maintient une vue matérialisée,
-- pour que la fiche s'affiche en une requête et que la cohérence soit garantie
-- par la base plutôt que par la discipline de l'application.
--
-- Choix de projection :
--   · champ multiple  → tableau de toutes les valeurs actives
--   · champ simple    → la valeur du fait le plus fiable, puis le plus récent
--
-- Deux faits peuvent porter la même affirmation depuis deux sources : c'est
-- normal, et c'est le meilleur des deux qui l'emporte à l'affichage.

CREATE OR REPLACE FUNCTION projeter_entite(p_entite_id uuid)
RETURNS void AS $$
DECLARE
  v_valeurs jsonb;
  v_modele  text;
  v_libelle text;
  v_cle     text;
BEGIN
  SELECT COALESCE(jsonb_object_agg(agrege.cle, agrege.valeur), '{}'::jsonb)
    INTO v_valeurs
    FROM (
      SELECT dc.cle,
             CASE
               WHEN dc.multiple THEN
                 jsonb_agg(f.valeur ORDER BY f.fiabilite DESC, f.date_constatation DESC, f.cree_le DESC)
               ELSE
                 (array_agg(f.valeur ORDER BY f.fiabilite DESC, f.date_constatation DESC, f.cree_le DESC))[1]
             END AS valeur
        FROM fait f
        JOIN definition_champ dc ON dc.id = f.definition_champ_id
       WHERE f.sujet_id = p_entite_id
         AND f.nature = 'champ'
         AND f.etat = 'actif'
         AND f.valeur IS NOT NULL
       GROUP BY dc.cle, dc.multiple
    ) AS agrege;

  SELECT te.modele_libelle
    INTO v_modele
    FROM entite e
    JOIN type_entite te ON te.id = e.type_entite_id
   WHERE e.id = p_entite_id;

  IF v_modele IS NULL THEN
    RETURN;
  END IF;

  v_libelle := v_modele;

  FOR v_cle IN
    SELECT DISTINCT trouve[1]
      FROM regexp_matches(v_modele, '\{([a-z][a-z0-9_]*)\}', 'g') AS trouve
  LOOP
    v_libelle := replace(
      v_libelle,
      '{' || v_cle || '}',
      COALESCE(texte_de_json(v_valeurs -> v_cle), '')
    );
  END LOOP;

  -- Un champ non renseigné laisse un trou ; on resserre les espaces plutôt que
  -- d'afficher « Tyron   » ou «  Banks ».
  v_libelle := btrim(regexp_replace(v_libelle, '\s+', ' ', 'g'));

  IF v_libelle = '' THEN
    v_libelle := '(sans libellé)';
  END IF;

  UPDATE entite
     SET valeurs = v_valeurs,
         libelle = v_libelle
   WHERE id = p_entite_id;
END;
$$ LANGUAGE plpgsql;
