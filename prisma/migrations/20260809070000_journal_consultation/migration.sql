


CREATE TABLE "journal_consultation" (
    "id" BIGSERIAL NOT NULL,
    "agent_id" UUID NOT NULL,
    "entite_id" UUID,
    "dossier_id" UUID,
    "derogation" BOOLEAN NOT NULL DEFAULT false,
    "super_admin" BOOLEAN NOT NULL DEFAULT false,
    "consulte_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_consultation_pkey" PRIMARY KEY ("id")
);


CREATE INDEX "journal_consultation_entite_id_idx" ON "journal_consultation"("entite_id");


CREATE INDEX "journal_consultation_dossier_id_idx" ON "journal_consultation"("dossier_id");


CREATE INDEX "journal_consultation_consulte_le_idx" ON "journal_consultation"("consulte_le");


CREATE INDEX "journal_consultation_agent_id_idx" ON "journal_consultation"("agent_id");


ALTER TABLE "journal_consultation" ADD CONSTRAINT "journal_consultation_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "journal_consultation" ADD CONSTRAINT "journal_consultation_entite_id_fkey" FOREIGN KEY ("entite_id") REFERENCES "entite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "journal_consultation" ADD CONSTRAINT "journal_consultation_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
