-- Visibilité effective d'un fait, et ses deux cascades.
--
-- Un fait prend la plus restrictive parmi : la sienne, celle de son dossier de
-- saisie, celle de son sujet et celle de sa cible. Une entité, elle, ne porte
-- que sa visibilité propre — l'appartenance à un dossier ne la restreint pas.
--
-- L'énuméré `visibilite` est déclaré dans l'ordre public < restreint < prive :
-- GREATEST y rend donc la valeur la plus restrictive.
--
-- ATTENTION — trigger **BEFORE**. En AFTER, la ligne renvoyée par le RETURNING
-- d'un `create` Prisma serait périmée : l'API annoncerait à l'agent qui vient
-- d'écrire une visibilité qui n'est pas celle enregistrée.

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

-- ─── Cascade depuis l'entité ───
--
-- Reclasser une entité en privé doit masquer d'un coup tous les faits dont elle
-- est le sujet **ou la cible**. Oublier la cible laisserait lisible « Tyron →
-- membre de → groupe devenu privé ».

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

-- ─── Cascade depuis le dossier ───
--
-- C'est ce qui rend possible le cas de référence : l'entité reste publique,
-- le dossier qui la vise passe en privé, et tout ce qui a été écrit depuis ce
-- dossier disparaît pour qui n'y est pas habilité.

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
