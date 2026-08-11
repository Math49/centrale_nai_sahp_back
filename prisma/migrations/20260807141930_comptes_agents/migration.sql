
CREATE TABLE "role" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "permissions" TEXT[],
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);


CREATE TABLE "agent" (
    "id" UUID NOT NULL,
    "matricule" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "role_id" UUID NOT NULL,
    "super_admin" BOOLEAN NOT NULL DEFAULT false,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "mot_de_passe_hash" TEXT,
    "doit_changer_mdp" BOOLEAN NOT NULL DEFAULT true,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "anonymise" BOOLEAN NOT NULL DEFAULT false,
    "anonymise_le" TIMESTAMPTZ(6),
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_pkey" PRIMARY KEY ("id")
);


CREATE TABLE "journal_audit" (
    "id" BIGSERIAL NOT NULL,
    "agent_id" UUID,
    "action" TEXT NOT NULL,
    "cible_table" TEXT NOT NULL,
    "cible_id" UUID,
    "avant" JSONB,
    "apres" JSONB,
    "effectue_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_audit_pkey" PRIMARY KEY ("id")
);


CREATE UNIQUE INDEX "role_code_key" ON "role"("code");


CREATE UNIQUE INDEX "agent_matricule_key" ON "agent"("matricule");


CREATE INDEX "journal_audit_cible_table_cible_id_idx" ON "journal_audit"("cible_table", "cible_id");


CREATE INDEX "journal_audit_effectue_le_idx" ON "journal_audit"("effectue_le");


ALTER TABLE "agent" ADD CONSTRAINT "agent_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "journal_audit" ADD CONSTRAINT "journal_audit_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
