


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


CREATE OR REPLACE FUNCTION normaliser_valeur(p_valeur text)
RETURNS text AS $$
  SELECT lower(unaccent('unaccent'::regdictionary, btrim(p_valeur)));
$$ LANGUAGE sql IMMUTABLE;


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


CREATE OR REPLACE FUNCTION fait_projection()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM projeter_entite(OLD.sujet_id);
    RETURN OLD;
  END IF;

  PERFORM projeter_entite(NEW.sujet_id);


  IF TG_OP = 'UPDATE' AND OLD.sujet_id IS DISTINCT FROM NEW.sujet_id THEN
    PERFORM projeter_entite(OLD.sujet_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fait_projection ON fait;
CREATE TRIGGER trg_fait_projection
AFTER INSERT OR UPDATE OR DELETE ON fait
FOR EACH ROW EXECUTE FUNCTION fait_projection();


CREATE OR REPLACE FUNCTION fait_unicite()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalculer_valeurs_uniques(OLD.sujet_id);
    RETURN OLD;
  END IF;

  PERFORM recalculer_valeurs_uniques(NEW.sujet_id);

  IF TG_OP = 'UPDATE' AND OLD.sujet_id IS DISTINCT FROM NEW.sujet_id THEN
    PERFORM recalculer_valeurs_uniques(OLD.sujet_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fait_unicite ON fait;
CREATE TRIGGER trg_fait_unicite
AFTER INSERT OR UPDATE OR DELETE ON fait
FOR EACH ROW EXECUTE FUNCTION fait_unicite();


CREATE OR REPLACE FUNCTION type_entite_reprojection()
RETURNS trigger AS $$
DECLARE
  v_id uuid;
BEGIN
  IF OLD.modele_libelle IS NOT DISTINCT FROM NEW.modele_libelle THEN
    RETURN NEW;
  END IF;

  FOR v_id IN SELECT id FROM entite WHERE type_entite_id = NEW.id LOOP
    PERFORM projeter_entite(v_id);
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_type_entite_reprojection ON type_entite;
CREATE TRIGGER trg_type_entite_reprojection
AFTER UPDATE OF modele_libelle ON type_entite
FOR EACH ROW EXECUTE FUNCTION type_entite_reprojection();


CREATE OR REPLACE FUNCTION horodater()
RETURNS trigger AS $$
BEGIN
  NEW.modifie_le := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_entite_horodatage ON entite;
CREATE TRIGGER trg_entite_horodatage
BEFORE UPDATE ON entite
FOR EACH ROW EXECUTE FUNCTION horodater();

DROP TRIGGER IF EXISTS trg_fait_horodatage ON fait;
CREATE TRIGGER trg_fait_horodatage
BEFORE UPDATE ON fait
FOR EACH ROW EXECUTE FUNCTION horodater();


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


CREATE INDEX IF NOT EXISTS idx_fait_sujet_actif ON fait (sujet_id) WHERE etat = 'actif';
CREATE INDEX IF NOT EXISTS idx_fait_cible_actif ON fait (cible_id) WHERE etat = 'actif';

CREATE INDEX IF NOT EXISTS idx_fait_type_lien ON fait (type_lien_id);
CREATE INDEX IF NOT EXISTS idx_fait_definition_champ ON fait (definition_champ_id);

CREATE INDEX IF NOT EXISTS idx_entite_type ON entite (type_entite_id);
CREATE INDEX IF NOT EXISTS idx_entite_etat ON entite (etat);


CREATE INDEX IF NOT EXISTS idx_entite_libelle_trgm ON entite USING gin (libelle gin_trgm_ops);


CREATE INDEX IF NOT EXISTS idx_entite_valeurs ON entite USING gin (valeurs);
