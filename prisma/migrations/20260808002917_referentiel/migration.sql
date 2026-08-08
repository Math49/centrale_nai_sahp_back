-- CreateEnum
CREATE TYPE "type_donnee" AS ENUM ('texte', 'nombre', 'date', 'datetime', 'booleen', 'liste', 'fichier');

-- CreateEnum
CREATE TYPE "sens_lien" AS ENUM ('direct', 'inverse');

-- CreateTable
CREATE TABLE "type_entite" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "libelle_pluriel" TEXT NOT NULL,
    "icone" TEXT NOT NULL,
    "modele_libelle" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "type_entite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "definition_champ" (
    "id" UUID NOT NULL,
    "type_entite_id" UUID NOT NULL,
    "cle" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "type_donnee" "type_donnee" NOT NULL,
    "obligatoire" BOOLEAN NOT NULL DEFAULT false,
    "est_unique" BOOLEAN NOT NULL DEFAULT false,
    "multiple" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "definition_champ_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "type_lien" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "libelle_inverse" TEXT NOT NULL,
    "type_entite_source_id" UUID NOT NULL,
    "type_entite_cible_id" UUID NOT NULL,
    "multiple" BOOLEAN NOT NULL DEFAULT true,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "type_lien_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onglet" (
    "id" UUID NOT NULL,
    "type_entite_id" UUID NOT NULL,
    "libelle" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "onglet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onglet_type_lien" (
    "onglet_id" UUID NOT NULL,
    "type_lien_id" UUID NOT NULL,
    "sens" "sens_lien" NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "onglet_type_lien_pkey" PRIMARY KEY ("onglet_id","type_lien_id","sens")
);

-- CreateIndex
CREATE UNIQUE INDEX "type_entite_code_key" ON "type_entite"("code");

-- CreateIndex
CREATE UNIQUE INDEX "definition_champ_type_entite_id_cle_key" ON "definition_champ"("type_entite_id", "cle");

-- CreateIndex
CREATE UNIQUE INDEX "type_lien_code_key" ON "type_lien"("code");

-- AddForeignKey
ALTER TABLE "definition_champ" ADD CONSTRAINT "definition_champ_type_entite_id_fkey" FOREIGN KEY ("type_entite_id") REFERENCES "type_entite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "type_lien" ADD CONSTRAINT "type_lien_type_entite_source_id_fkey" FOREIGN KEY ("type_entite_source_id") REFERENCES "type_entite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "type_lien" ADD CONSTRAINT "type_lien_type_entite_cible_id_fkey" FOREIGN KEY ("type_entite_cible_id") REFERENCES "type_entite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onglet" ADD CONSTRAINT "onglet_type_entite_id_fkey" FOREIGN KEY ("type_entite_id") REFERENCES "type_entite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onglet_type_lien" ADD CONSTRAINT "onglet_type_lien_onglet_id_fkey" FOREIGN KEY ("onglet_id") REFERENCES "onglet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onglet_type_lien" ADD CONSTRAINT "onglet_type_lien_type_lien_id_fkey" FOREIGN KEY ("type_lien_id") REFERENCES "type_lien"("id") ON DELETE CASCADE ON UPDATE CASCADE;
