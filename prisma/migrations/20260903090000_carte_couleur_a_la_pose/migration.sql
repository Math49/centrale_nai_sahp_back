-- La couleur quitte le type de repère et rejoint le repère.
--
-- Un type dit ce qu'on pose ; c'est l'objet posé qui se signale. Deux planques
-- du même type n'appellent pas la même couleur selon l'affaire, et la couleur
-- du type imposait de créer un type pour changer de teinte.
--
-- Les repères qui n'imposaient pas de couleur reprennent celle de leur type,
-- avant que la colonne ne disparaisse : personne ne change d'apparence.
UPDATE "repere"
SET "couleur" = "type_repere"."couleur"
FROM "type_repere"
WHERE "repere"."type_repere_id" = "type_repere"."id"
  AND "repere"."couleur" IS NULL;

-- Filet : un repère orphelin de couleur reste visible plutôt que de bloquer.
UPDATE "repere" SET "couleur" = '#6f9dc4' WHERE "couleur" IS NULL;

ALTER TABLE "repere" ALTER COLUMN "couleur" SET NOT NULL;

ALTER TABLE "type_repere" DROP COLUMN "couleur";

-- Une zone devient un rectangle ou un rond ; le polygone libre disparaît.
--
-- Aucun polygone n'est censé exister — la carte est vide au moment de cette
-- migration. La conversion est donc un no-op ; elle est écrite quand même,
-- parce qu'un polygone survivant deviendrait une zone illisible, et que rien
-- ne se supprime dans cette base : il devient son rectangle englobant.
UPDATE "repere"
SET "geometrie" = jsonb_build_object(
      'type', 'rectangle',
      'a', jsonb_build_object('x', bornes.min_x, 'y', bornes.min_y),
      'b', jsonb_build_object('x', bornes.max_x, 'y', bornes.max_y)
    )
FROM (
  SELECT r."id",
         min((sommet ->> 'x')::numeric) AS min_x,
         min((sommet ->> 'y')::numeric) AS min_y,
         max((sommet ->> 'x')::numeric) AS max_x,
         max((sommet ->> 'y')::numeric) AS max_y
  FROM "repere" r,
       jsonb_array_elements(r."geometrie" -> 'sommets') AS sommet
  WHERE r."geometrie" ->> 'type' = 'polygone'
  GROUP BY r."id"
) AS bornes
WHERE "repere"."id" = bornes."id";
