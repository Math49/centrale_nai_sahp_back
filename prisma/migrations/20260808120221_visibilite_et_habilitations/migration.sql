
DROP INDEX "idx_entite_etat";


DROP INDEX "idx_entite_libelle_trgm";


DROP INDEX "idx_entite_type";


DROP INDEX "idx_entite_valeurs";


DROP INDEX "idx_fait_definition_champ";


DROP INDEX "idx_fait_type_lien";


ALTER TABLE "fait" ADD COLUMN     "dossier_id" UUID;


CREATE TABLE "dossier" (
    "id" UUID NOT NULL,
    "nom" TEXT NOT NULL,
    "entite_pivot_id" UUID NOT NULL,
    "visibilite" "visibilite" NOT NULL DEFAULT 'public',
    "note" TEXT,
    "etat" "etat_entite" NOT NULL DEFAULT 'actif',
    "cree_par" UUID NOT NULL,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dossier_pkey" PRIMARY KEY ("id")
);


CREATE TABLE "suivi" (
    "dossier_id" UUID NOT NULL,
    "entite_id" UUID NOT NULL,
    "ajoute_par" UUID NOT NULL,
    "ajoute_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suivi_pkey" PRIMARY KEY ("dossier_id","entite_id")
);


CREATE TABLE "habilitation_dossier" (
    "dossier_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "accorde_par" UUID NOT NULL,
    "accorde_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "habilitation_dossier_pkey" PRIMARY KEY ("dossier_id","agent_id")
);


CREATE TABLE "habilitation_entite" (
    "entite_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "accorde_par" UUID NOT NULL,
    "accorde_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "habilitation_entite_pkey" PRIMARY KEY ("entite_id","agent_id")
);


CREATE UNIQUE INDEX "dossier_nom_key" ON "dossier"("nom");


CREATE INDEX "suivi_entite_id_idx" ON "suivi"("entite_id");


CREATE INDEX "habilitation_dossier_agent_id_idx" ON "habilitation_dossier"("agent_id");


CREATE INDEX "habilitation_entite_agent_id_idx" ON "habilitation_entite"("agent_id");


ALTER TABLE "fait" ADD CONSTRAINT "fait_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "dossier" ADD CONSTRAINT "dossier_entite_pivot_id_fkey" FOREIGN KEY ("entite_pivot_id") REFERENCES "entite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "dossier" ADD CONSTRAINT "dossier_cree_par_fkey" FOREIGN KEY ("cree_par") REFERENCES "agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "suivi" ADD CONSTRAINT "suivi_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "suivi" ADD CONSTRAINT "suivi_entite_id_fkey" FOREIGN KEY ("entite_id") REFERENCES "entite"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "suivi" ADD CONSTRAINT "suivi_ajoute_par_fkey" FOREIGN KEY ("ajoute_par") REFERENCES "agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "habilitation_dossier" ADD CONSTRAINT "habilitation_dossier_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "habilitation_dossier" ADD CONSTRAINT "habilitation_dossier_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "habilitation_dossier" ADD CONSTRAINT "habilitation_dossier_accorde_par_fkey" FOREIGN KEY ("accorde_par") REFERENCES "agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "habilitation_entite" ADD CONSTRAINT "habilitation_entite_entite_id_fkey" FOREIGN KEY ("entite_id") REFERENCES "entite"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "habilitation_entite" ADD CONSTRAINT "habilitation_entite_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "habilitation_entite" ADD CONSTRAINT "habilitation_entite_accorde_par_fkey" FOREIGN KEY ("accorde_par") REFERENCES "agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
