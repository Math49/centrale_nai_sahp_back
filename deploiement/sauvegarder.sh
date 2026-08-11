#!/bin/sh


set -eu

DESTINATION="${DESTINATION:-/sauvegardes}"
SOURCE_FICHIERS="${SOURCE_FICHIERS:-/source/fichiers}"
RETENTION_JOURS="${RETENTION_JOURS:-14}"
HEURE_SAUVEGARDE="${HEURE_SAUVEGARDE:-03}"

dire() {
	echo "[$(date -u '+%Y-%m-%d %H:%M:%SZ')] $*"
}

sauvegarder() {
	horodatage=$(date -u '+%Y%m%dT%H%M%SZ')
	base="${DESTINATION}/${horodatage}"

	mkdir -p "${DESTINATION}"

	dire "sauvegarde de la base ${PGDATABASE}"


	pg_dump --format=custom --compress=9 --file="${base}.dump.partiel"
	mv "${base}.dump.partiel" "${base}.dump"

	dire 'sauvegarde du volume de fichiers'
	tar -czf "${base}.fichiers.tar.gz.partiel" -C "${SOURCE_FICHIERS}" .
	mv "${base}.fichiers.tar.gz.partiel" "${base}.fichiers.tar.gz"


	taille_base=$(du -h "${base}.dump" | cut -f1)
	taille_fichiers=$(du -h "${base}.fichiers.tar.gz" | cut -f1)
	dire "écrites — base ${taille_base}, fichiers ${taille_fichiers}"

	tourner
}

tourner() {
	dire "rotation au-delà de ${RETENTION_JOURS} jours"

	find "${DESTINATION}" -maxdepth 1 -name '*.dump' -mtime "+${RETENTION_JOURS}" -print -delete
	find "${DESTINATION}" -maxdepth 1 -name '*.fichiers.tar.gz' -mtime "+${RETENTION_JOURS}" -print -delete

	find "${DESTINATION}" -maxdepth 1 -name '*.partiel' -mtime +1 -print -delete
}

boucle() {
	dire "sauvegarde quotidienne à ${HEURE_SAUVEGARDE}h00 UTC, rétention ${RETENTION_JOURS} jours"

	while true; do
		maintenant=$(date -u '+%H')

		if [ "${maintenant}" = "${HEURE_SAUVEGARDE}" ]; then
			sauvegarder || dire 'ÉCHEC de la sauvegarde — la prochaine réessaiera'

			sleep 3600
		else
			sleep 300
		fi
	done
}

case "${1:-boucle}" in
maintenant) sauvegarder ;;
rotation) tourner ;;
boucle) boucle ;;
*)
	echo "usage : $0 [boucle|maintenant|rotation]" >&2
	exit 2
	;;
esac
