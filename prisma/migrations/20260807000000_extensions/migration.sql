-- Extensions PostgreSQL requises par la conception technique.
--
-- pg_trgm   — similarité trigramme, sert la détection de doublons à la frappe
--             (GET /entites/similaires) et l'index GIN sur entite.libelle.
-- unaccent  — normalisation des valeurs uniques : la clé de valeur_unique est
--             lower(unaccent(trim(...))), sans quoi « Moralès » et « Morales »
--             passeraient pour deux plaques distinctes.

CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
