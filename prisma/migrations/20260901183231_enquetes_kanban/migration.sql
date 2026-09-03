-- Enquêtes : colonnes du kanban, cartes, assignations, habilitations.
--
-- Les 3 blocs `DropIndex` du diff ont été retirés à la main : ils visent les
-- index de `prisma/sql/`, que l'outil ne connaît pas.
--   idx_dossier_entite_pivot
--   idx_fait_dossier
--   idx_fait_visibilite_effective

-- CreateTable
CREATE TABLE "colonne_kanban" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,

CONSTRAINT "colonne_kanban_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carte_enquete" (
    "id" UUID NOT NULL,
    "colonne_id" UUID NOT NULL,
    "rang" INTEGER NOT NULL DEFAULT 0,
    "titre" TEXT NOT NULL,
    "description" TEXT,
    "echeance" DATE,
    "dossier_id" UUID,
    "entite_id" UUID,
    "visibilite" "visibilite" NOT NULL DEFAULT 'public',
    "etat" "etat_entite" NOT NULL DEFAULT 'actif',
    "cree_par" UUID NOT NULL,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_par" UUID,
    "modifie_le" TIMESTAMPTZ(6) NOT NULL,
    "archive_le" TIMESTAMPTZ(6),

CONSTRAINT "carte_enquete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignation_carte" (
    "carte_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "assigne_par" UUID NOT NULL,
    "assigne_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "assignation_carte_pkey" PRIMARY KEY ("carte_id","agent_id")
);

-- CreateTable
CREATE TABLE "habilitation_carte_enquete" (
    "carte_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "accorde_par" UUID NOT NULL,
    "accorde_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "habilitation_carte_enquete_pkey" PRIMARY KEY ("carte_id","agent_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "colonne_kanban_code_key" ON "colonne_kanban"("code");

-- CreateIndex
CREATE INDEX "carte_enquete_colonne_id_rang_idx" ON "carte_enquete"("colonne_id", "rang");

-- CreateIndex
CREATE INDEX "carte_enquete_etat_idx" ON "carte_enquete"("etat");

-- CreateIndex
CREATE INDEX "assignation_carte_agent_id_idx" ON "assignation_carte"("agent_id");

-- CreateIndex
CREATE INDEX "habilitation_carte_enquete_agent_id_idx" ON "habilitation_carte_enquete"("agent_id");

-- AddForeignKey
ALTER TABLE "carte_enquete" ADD CONSTRAINT "carte_enquete_colonne_id_fkey" FOREIGN KEY ("colonne_id") REFERENCES "colonne_kanban"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carte_enquete" ADD CONSTRAINT "carte_enquete_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carte_enquete" ADD CONSTRAINT "carte_enquete_entite_id_fkey" FOREIGN KEY ("entite_id") REFERENCES "entite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carte_enquete" ADD CONSTRAINT "carte_enquete_cree_par_fkey" FOREIGN KEY ("cree_par") REFERENCES "agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignation_carte" ADD CONSTRAINT "assignation_carte_carte_id_fkey" FOREIGN KEY ("carte_id") REFERENCES "carte_enquete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignation_carte" ADD CONSTRAINT "assignation_carte_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignation_carte" ADD CONSTRAINT "assignation_carte_assigne_par_fkey" FOREIGN KEY ("assigne_par") REFERENCES "agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habilitation_carte_enquete" ADD CONSTRAINT "habilitation_carte_enquete_carte_id_fkey" FOREIGN KEY ("carte_id") REFERENCES "carte_enquete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habilitation_carte_enquete" ADD CONSTRAINT "habilitation_carte_enquete_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habilitation_carte_enquete" ADD CONSTRAINT "habilitation_carte_enquete_accorde_par_fkey" FOREIGN KEY ("accorde_par") REFERENCES "agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
