-- Carte de la centrale : types de repères, repères, habilitations.
--
-- Écrite depuis `prisma migrate diff`, dont les 3 blocs `DropIndex` ont été
-- retirés à la main : ils visaient les index de `prisma/sql/`, que l'outil ne
-- connaît pas. Les laisser passer déferait le travail des lots précédents.
--   idx_dossier_entite_pivot
--   idx_fait_dossier
--   idx_fait_visibilite_effective

-- CreateEnum
CREATE TYPE "nature_repere" AS ENUM ('point', 'zone');

-- CreateTable
CREATE TABLE "type_repere" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "nature" "nature_repere" NOT NULL,
    "icone" TEXT NOT NULL,
    "couleur" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,

CONSTRAINT "type_repere_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repere" (
    "id" UUID NOT NULL,
    "type_repere_id" UUID NOT NULL,
    "geometrie" JSONB NOT NULL,
    "libelle" TEXT NOT NULL,
    "note" TEXT,
    "couleur" TEXT,
    "opacite" DOUBLE PRECISION,
    "visibilite" "visibilite" NOT NULL DEFAULT 'public',
    "etat" "etat_entite" NOT NULL DEFAULT 'actif',
    "cree_par" UUID NOT NULL,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_par" UUID,
    "modifie_le" TIMESTAMPTZ(6) NOT NULL,
    "archive_le" TIMESTAMPTZ(6),

CONSTRAINT "repere_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habilitation_repere" (
    "repere_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "accorde_par" UUID NOT NULL,
    "accorde_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "habilitation_repere_pkey" PRIMARY KEY ("repere_id","agent_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "type_repere_code_key" ON "type_repere"("code");

-- CreateIndex
CREATE INDEX "repere_etat_idx" ON "repere"("etat");

-- CreateIndex
CREATE INDEX "habilitation_repere_agent_id_idx" ON "habilitation_repere"("agent_id");

-- AddForeignKey
ALTER TABLE "repere" ADD CONSTRAINT "repere_type_repere_id_fkey" FOREIGN KEY ("type_repere_id") REFERENCES "type_repere"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repere" ADD CONSTRAINT "repere_cree_par_fkey" FOREIGN KEY ("cree_par") REFERENCES "agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habilitation_repere" ADD CONSTRAINT "habilitation_repere_repere_id_fkey" FOREIGN KEY ("repere_id") REFERENCES "repere"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habilitation_repere" ADD CONSTRAINT "habilitation_repere_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habilitation_repere" ADD CONSTRAINT "habilitation_repere_accorde_par_fkey" FOREIGN KEY ("accorde_par") REFERENCES "agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
