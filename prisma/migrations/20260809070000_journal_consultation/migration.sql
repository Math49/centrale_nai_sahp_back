-- Journal de consultation.
--
-- Toute lecture de fiche y laisse une trace, y compris celle d'un super-admin,
-- qui est en outre marquée comme telle : sans cela, l'accès total du
-- développeur serait le point faible du dispositif qu'il est censé protéger.
--
-- `derogation` distingue la lecture ordinaire de celle qui n'a été possible que
-- par une permission dérogatoire — c'est ce que le journal existe pour rendre
-- visible.
--
-- Les clés étrangères sont en RESTRICT, comme partout : une trace ne doit pas
-- pouvoir disparaître avec ce qu'elle désigne.
--
-- Les DROP INDEX que `prisma migrate diff` propose ont été retirés : ils
-- portent sur les index de prisma/sql/, que Prisma ne connaît pas.

-- CreateTable
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

-- CreateIndex
CREATE INDEX "journal_consultation_entite_id_idx" ON "journal_consultation"("entite_id");

-- CreateIndex
CREATE INDEX "journal_consultation_dossier_id_idx" ON "journal_consultation"("dossier_id");

-- CreateIndex
CREATE INDEX "journal_consultation_consulte_le_idx" ON "journal_consultation"("consulte_le");

-- CreateIndex
CREATE INDEX "journal_consultation_agent_id_idx" ON "journal_consultation"("agent_id");

-- AddForeignKey
ALTER TABLE "journal_consultation" ADD CONSTRAINT "journal_consultation_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_consultation" ADD CONSTRAINT "journal_consultation_entite_id_fkey" FOREIGN KEY ("entite_id") REFERENCES "entite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_consultation" ADD CONSTRAINT "journal_consultation_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
