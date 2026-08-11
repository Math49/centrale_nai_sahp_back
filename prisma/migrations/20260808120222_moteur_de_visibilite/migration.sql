


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
AFTER INSERT OR DELETE ON fait
FOR EACH ROW EXECUTE FUNCTION fait_projection();

DROP TRIGGER IF EXISTS trg_fait_projection_maj ON fait;
CREATE TRIGGER trg_fait_projection_maj
AFTER UPDATE ON fait
FOR EACH ROW
WHEN (
     OLD.valeur              IS DISTINCT FROM NEW.valeur
  OR OLD.etat                IS DISTINCT FROM NEW.etat
  OR OLD.sujet_id            IS DISTINCT FROM NEW.sujet_id
  OR OLD.definition_champ_id IS DISTINCT FROM NEW.definition_champ_id
  OR OLD.fiabilite           IS DISTINCT FROM NEW.fiabilite
  OR OLD.date_constatation   IS DISTINCT FROM NEW.date_constatation
)
EXECUTE FUNCTION fait_projection();


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
AFTER INSERT OR DELETE ON fait
FOR EACH ROW EXECUTE FUNCTION fait_unicite();

DROP TRIGGER IF EXISTS trg_fait_unicite_maj ON fait;
CREATE TRIGGER trg_fait_unicite_maj
AFTER UPDATE ON fait
FOR EACH ROW
WHEN (
     OLD.valeur              IS DISTINCT FROM NEW.valeur
  OR OLD.etat                IS DISTINCT FROM NEW.etat
  OR OLD.sujet_id            IS DISTINCT FROM NEW.sujet_id
  OR OLD.definition_champ_id IS DISTINCT FROM NEW.definition_champ_id
)
EXECUTE FUNCTION fait_unicite();


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


CREATE OR REPLACE FUNCTION calculer_visibilite_effective(
  p_visibilite_propre visibilite,
  p_dossier_id uuid,
  p_sujet_id uuid,
  p_cible_id uuid
) RETURNS visibilite AS $$
DECLARE
  v_pire visibilite := p_visibilite_propre;
  v_autre visibilite;
BEGIN
  IF p_dossier_id IS NOT NULL THEN
    SELECT visibilite INTO v_autre FROM dossier WHERE id = p_dossier_id;
    v_pire := GREATEST(v_pire, COALESCE(v_autre, 'public'::visibilite));
  END IF;

  SELECT visibilite INTO v_autre FROM entite WHERE id = p_sujet_id;
  v_pire := GREATEST(v_pire, COALESCE(v_autre, 'public'::visibilite));

  IF p_cible_id IS NOT NULL THEN
    SELECT visibilite INTO v_autre FROM entite WHERE id = p_cible_id;
    v_pire := GREATEST(v_pire, COALESCE(v_autre, 'public'::visibilite));
  END IF;

  RETURN v_pire;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fait_visibilite()
RETURNS trigger AS $$
BEGIN
  NEW.visibilite_effective := calculer_visibilite_effective(
    NEW.visibilite, NEW.dossier_id, NEW.sujet_id, NEW.cible_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fait_visibilite ON fait;
CREATE TRIGGER trg_fait_visibilite
BEFORE INSERT OR UPDATE ON fait
FOR EACH ROW EXECUTE FUNCTION fait_visibilite();


CREATE OR REPLACE FUNCTION entite_visibilite_cascade()
RETURNS trigger AS $$
BEGIN
  UPDATE fait
     SET visibilite_effective = calculer_visibilite_effective(
           visibilite, dossier_id, sujet_id, cible_id
         )
   WHERE sujet_id = NEW.id OR cible_id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_entite_visibilite_cascade ON entite;
CREATE TRIGGER trg_entite_visibilite_cascade
AFTER UPDATE OF visibilite ON entite
FOR EACH ROW
WHEN (OLD.visibilite IS DISTINCT FROM NEW.visibilite)
EXECUTE FUNCTION entite_visibilite_cascade();


CREATE OR REPLACE FUNCTION dossier_visibilite_cascade()
RETURNS trigger AS $$
BEGIN
  UPDATE fait
     SET visibilite_effective = calculer_visibilite_effective(
           visibilite, dossier_id, sujet_id, cible_id
         )
   WHERE dossier_id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dossier_visibilite_cascade ON dossier;
CREATE TRIGGER trg_dossier_visibilite_cascade
AFTER UPDATE OF visibilite ON dossier
FOR EACH ROW
WHEN (OLD.visibilite IS DISTINCT FROM NEW.visibilite)
EXECUTE FUNCTION dossier_visibilite_cascade();


CREATE INDEX IF NOT EXISTS idx_fait_dossier ON fait (dossier_id);


CREATE INDEX IF NOT EXISTS idx_fait_visibilite_effective ON fait (visibilite_effective);


CREATE INDEX IF NOT EXISTS idx_entite_non_publique ON entite (id) WHERE visibilite <> 'public';

CREATE INDEX IF NOT EXISTS idx_dossier_entite_pivot ON dossier (entite_pivot_id);
