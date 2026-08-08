-- CreateEnum
CREATE TYPE "visibilite" AS ENUM ('public', 'restreint', 'prive');

-- CreateEnum
CREATE TYPE "etat_entite" AS ENUM ('actif', 'archive');

-- CreateEnum
CREATE TYPE "etat_fait" AS ENUM ('actif', 'infirme', 'archive');

-- CreateEnum
CREATE TYPE "nature_fait" AS ENUM ('champ', 'lien');

-- CreateTable
CREATE TABLE "entite" (
    "id" UUID NOT NULL,
    "type_entite_id" UUID NOT NULL,
    "libelle" TEXT NOT NULL,
    "valeurs" JSONB NOT NULL DEFAULT '{}',
    "note" TEXT,
    "visibilite" "visibilite" NOT NULL DEFAULT 'public',
    "etat" "etat_entite" NOT NULL DEFAULT 'actif',
    "fusionnee_vers_id" UUID,
    "cree_par" UUID NOT NULL,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fait" (
    "id" UUID NOT NULL,
    "sujet_id" UUID NOT NULL,
    "nature" "nature_fait" NOT NULL,
    "definition_champ_id" UUID,
    "valeur" JSONB,
    "fichier_id" UUID,
    "type_lien_id" UUID,
    "cible_id" UUID,
    "source" TEXT NOT NULL,
    "fiabilite" SMALLINT NOT NULL,
    "date_constatation" DATE NOT NULL,
    "etat" "etat_fait" NOT NULL DEFAULT 'actif',
    "visibilite" "visibilite" NOT NULL DEFAULT 'public',
    "visibilite_effective" "visibilite" NOT NULL DEFAULT 'public',
    "cree_par" UUID NOT NULL,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_par" UUID,
    "modifie_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fait_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fichier" (
    "id" UUID NOT NULL,
    "entite_id" UUID NOT NULL,
    "nom_origine" TEXT NOT NULL,
    "chemin" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "taille" INTEGER NOT NULL,
    "depose_par" UUID NOT NULL,
    "depose_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fichier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "valeur_unique" (
    "type_entite_id" UUID NOT NULL,
    "definition_champ_id" UUID NOT NULL,
    "valeur_normalisee" TEXT NOT NULL,
    "entite_id" UUID NOT NULL,

    CONSTRAINT "valeur_unique_pkey" PRIMARY KEY ("type_entite_id","definition_champ_id","valeur_normalisee")
);

-- CreateIndex
CREATE UNIQUE INDEX "fichier_chemin_key" ON "fichier"("chemin");

-- CreateIndex
CREATE INDEX "valeur_unique_entite_id_idx" ON "valeur_unique"("entite_id");

-- AddForeignKey
ALTER TABLE "entite" ADD CONSTRAINT "entite_type_entite_id_fkey" FOREIGN KEY ("type_entite_id") REFERENCES "type_entite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entite" ADD CONSTRAINT "entite_fusionnee_vers_id_fkey" FOREIGN KEY ("fusionnee_vers_id") REFERENCES "entite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entite" ADD CONSTRAINT "entite_cree_par_fkey" FOREIGN KEY ("cree_par") REFERENCES "agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fait" ADD CONSTRAINT "fait_sujet_id_fkey" FOREIGN KEY ("sujet_id") REFERENCES "entite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fait" ADD CONSTRAINT "fait_definition_champ_id_fkey" FOREIGN KEY ("definition_champ_id") REFERENCES "definition_champ"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fait" ADD CONSTRAINT "fait_fichier_id_fkey" FOREIGN KEY ("fichier_id") REFERENCES "fichier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fait" ADD CONSTRAINT "fait_type_lien_id_fkey" FOREIGN KEY ("type_lien_id") REFERENCES "type_lien"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fait" ADD CONSTRAINT "fait_cible_id_fkey" FOREIGN KEY ("cible_id") REFERENCES "entite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fait" ADD CONSTRAINT "fait_cree_par_fkey" FOREIGN KEY ("cree_par") REFERENCES "agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichier" ADD CONSTRAINT "fichier_entite_id_fkey" FOREIGN KEY ("entite_id") REFERENCES "entite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichier" ADD CONSTRAINT "fichier_depose_par_fkey" FOREIGN KEY ("depose_par") REFERENCES "agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valeur_unique" ADD CONSTRAINT "valeur_unique_entite_id_fkey" FOREIGN KEY ("entite_id") REFERENCES "entite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
