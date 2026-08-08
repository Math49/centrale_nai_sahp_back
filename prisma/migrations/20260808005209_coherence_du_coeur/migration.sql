-- Migration générée depuis prisma/sql/ par scripts/creer-migration-sql.mjs.
-- Ne pas modifier ici : corriger le fichier source puis créer une nouvelle migration.

-- source : prisma/sql/fonctions/texte_de_json.sql
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

-- source : prisma/sql/fonctions/normaliser_valeur.sql
-- Clé de comparaison des valeurs uniques.
--
-- Sans normalisation, « 20DCC874 », « 20dcc874 » et « Moralès » contre
-- « Morales » passeraient pour des valeurs distinctes, et la plaque en double
-- que l'unicité doit refuser passerait au travers.
--
-- La forme `unaccent(regdictionary, text)` est IMMUTABLE, contrairement à
-- `unaccent(text)` : c'est elle qui permet d'utiliser la fonction dans un index.

CREATE OR REPLACE FUNCTION normaliser_valeur(p_valeur text)
RETURNS text AS $$
  SELECT lower(unaccent('unaccent'::regdictionary, btrim(p_valeur)));
$$ LANGUAGE sql IMMUTABLE;

-- source : prisma/sql/fonctions/projeter_entite.sql
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

-- source : prisma/sql/fonctions/recalculer_valeurs_uniques.sql
-- Maintien de `valeur_unique` pour les champs marqués uniques.
--
-- La table porte une entrée par (type d'entité, champ, valeur normalisée), et
-- sa clé primaire est ce qui refuse deux plaques identiques sur deux véhicules
-- distincts.
--
-- Une entrée par *entité* et non par *fait* : deux faits peuvent affirmer la
-- même plaque depuis deux sources, ce qui est normal et ne doit pas déclencher
-- un conflit avec soi-même. D'où le DISTINCT.

CREATE OR REPLACE FUNCTION recalculer_valeurs_uniques(p_entite_id uuid)
RETURNS void AS $$
DECLARE
  v_conflit record;
BEGIN
  DELETE FROM valeur_unique WHERE entite_id = p_entite_id;

  -- Vérification avant insertion, uniquement pour produire un message qui
  -- nomme le champ et la valeur en cause. La clé primaire refuserait de toute
  -- façon, mais sans dire laquelle des valeurs est déjà prise.
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

-- source : prisma/sql/triggers/coeur.sql
-- Triggers de cohérence du cœur.
--
-- Frontière retenue : la base garantit que la donnée ne peut pas devenir
-- incohérente, l'application décide qui a le droit de la voir.

-- ─── Projection des faits sur l'entité, et recalcul du libellé ───

CREATE OR REPLACE FUNCTION fait_projection()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM projeter_entite(OLD.sujet_id);
    RETURN OLD;
  END IF;

  PERFORM projeter_entite(NEW.sujet_id);

  -- Un fait qui change de sujet laisse deux fiches à recalculer.
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

-- ─── Unicité des champs marqués uniques ───

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

-- ─── Reprojection après changement de gabarit ───
--
-- Sans cela, modifier « {plaque} » en « {plaque} {modele} » depuis
-- l'administration laisserait tous les libellés déjà calculés dans leur ancien
-- état, sans qu'aucun écran ne le signale.

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

-- ─── Horodatage ───

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

-- source : prisma/sql/contraintes/fait.sql
-- Contraintes de cohérence du fait, inexprimables dans schema.prisma.

-- Un fait est un champ ou un lien, jamais les deux, jamais ni l'un ni l'autre.
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

-- Quatre niveaux ordonnés : 1 douteux, 2 à confirmer, 3 probable, 4 certain.
ALTER TABLE fait DROP CONSTRAINT IF EXISTS fait_fiabilite;
ALTER TABLE fait ADD CONSTRAINT fait_fiabilite CHECK (fiabilite BETWEEN 1 AND 4);

-- Invariant : aucun fait sans source. `NOT NULL` ne suffit pas, une chaîne
-- vide en tiendrait lieu.
ALTER TABLE fait DROP CONSTRAINT IF EXISTS fait_source_non_vide;
ALTER TABLE fait ADD CONSTRAINT fait_source_non_vide CHECK (btrim(source) <> '');

-- Un lien vers soi-même n'apporte rien et fausserait le graphe.
ALTER TABLE fait DROP CONSTRAINT IF EXISTS fait_pas_de_boucle;
ALTER TABLE fait ADD CONSTRAINT fait_pas_de_boucle CHECK (cible_id IS NULL OR cible_id <> sujet_id);

-- source : prisma/sql/index/coeur.sql
-- Index du cœur.
--
-- Les deux premiers sont les plus importants de l'application : ils servent
-- chaque fiche et chaque chargement du graphe. Partiels sur `etat = 'actif'`,
-- ce que `@@index` ne sait pas exprimer.

CREATE INDEX IF NOT EXISTS idx_fait_sujet_actif ON fait (sujet_id) WHERE etat = 'actif';
CREATE INDEX IF NOT EXISTS idx_fait_cible_actif ON fait (cible_id) WHERE etat = 'actif';

CREATE INDEX IF NOT EXISTS idx_fait_type_lien ON fait (type_lien_id);
CREATE INDEX IF NOT EXISTS idx_fait_definition_champ ON fait (definition_champ_id);

CREATE INDEX IF NOT EXISTS idx_entite_type ON entite (type_entite_id);
CREATE INDEX IF NOT EXISTS idx_entite_etat ON entite (etat);

-- Similarité trigramme : détection de doublons à la frappe.
CREATE INDEX IF NOT EXISTS idx_entite_libelle_trgm ON entite USING gin (libelle gin_trgm_ops);

-- Recherche dans la projection des valeurs.
CREATE INDEX IF NOT EXISTS idx_entite_valeurs ON entite USING gin (valeurs);
