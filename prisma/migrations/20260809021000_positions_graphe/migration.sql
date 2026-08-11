


CREATE TABLE "position_graphe" (
    "id" UUID NOT NULL,
    "entite_id" UUID NOT NULL,
    "dossier_id" UUID,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "modifie_par" UUID NOT NULL,
    "modifie_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "position_graphe_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "position_graphe_dossier_id_idx" ON "position_graphe"("dossier_id");
CREATE INDEX "position_graphe_entite_id_idx" ON "position_graphe"("entite_id");

ALTER TABLE "position_graphe" ADD CONSTRAINT "position_graphe_entite_id_fkey"
  FOREIGN KEY ("entite_id") REFERENCES "entite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "position_graphe" ADD CONSTRAINT "position_graphe_dossier_id_fkey"
  FOREIGN KEY ("dossier_id") REFERENCES "dossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "position_graphe" ADD CONSTRAINT "position_graphe_modifie_par_fkey"
  FOREIGN KEY ("modifie_par") REFERENCES "agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
