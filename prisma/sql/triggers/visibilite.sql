


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
