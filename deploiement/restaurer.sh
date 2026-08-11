#!/bin/sh


set -eu

HORODATAGE="${1:-}"
DESTINATION="${DESTINATION:-/sauvegardes}"
CIBLE_FICHIERS="${CIBLE_FICHIERS:-/cible/fichiers}"

dire() {
	echo "[$(date -u '+%Y-%m-%d %H:%M:%SZ')] $*"
}

rater() {
	echo "$*" >&2
	exit 1
}

if [ -z "${HORODATAGE}" ]; then
	echo 'usage : restaurer.sh <horodatage>' >&2
	echo '' >&2
	echo 'sauvegardes disponibles :' >&2
	ls -1 "${DESTINATION}" 2>/dev/null | sed 's/\.dump$//' | sort -u >&2
	exit 2
fi

archive_base="${DESTINATION}/${HORODATAGE}.dump"
archive_fichiers="${DESTINATION}/${HORODATAGE}.fichiers.tar.gz"

[ -f "${archive_base}" ] || rater "introuvable : ${archive_base}"
[ -f "${archive_fichiers}" ] || rater "introuvable : ${archive_fichiers}"


dire "restauration de ${HORODATAGE}"

entites=$(psql --tuples-only --no-align --command \
	"SELECT count(*) FROM entite" 2>/dev/null || echo 0)

if [ "${entites}" != "0" ] && [ "${FORCER:-0}" != "1" ]; then
	rater "la base contient ${entites} entités — relancer avec FORCER=1 pour les écraser"
fi

dire 'restauration de la base'


pg_restore --clean --if-exists --no-owner --no-privileges \
	--dbname="${PGDATABASE}" "${archive_base}"

dire 'restauration du volume de fichiers'
mkdir -p "${CIBLE_FICHIERS}"


rm -rf "${CIBLE_FICHIERS:?}"/*
tar -xzf "${archive_fichiers}" -C "${CIBLE_FICHIERS}"

restaurees=$(psql --tuples-only --no-align --command "SELECT count(*) FROM entite")
fichiers=$(find "${CIBLE_FICHIERS}" -type f | wc -l)
attendus=$(psql --tuples-only --no-align --command "SELECT count(*) FROM fichier")

dire "base restaurée — ${restaurees} entités"
dire "volume restauré — ${fichiers} images pour ${attendus} attendues"

if [ "${fichiers}" != "${attendus}" ]; then
	rater 'ÉCART entre la base et le volume — restauration à reprendre'
fi

dire 'restauration cohérente.'
