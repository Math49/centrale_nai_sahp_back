#!/bin/sh
# Sauvegarde de la Centrale N&I — base **et** volume de fichiers.
#
# Une base restaurée sans ses images est une base à moitié perdue : les photos
# versées à un dossier n'existent nulle part ailleurs, et aucune source ne
# permet de les réimporter. Les deux partent donc ensemble, dans une paire
# d'archives portant le même horodatage.
#
# Usage :
#   sauvegarder.sh boucle      attend l'heure dite, sauvegarde, recommence
#   sauvegarder.sh maintenant  sauvegarde une fois et rend la main
#
# La restauration se fait à la main, et volontairement : voir restaurer.sh.

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
	# Format personnalisé et compressé : `pg_restore` sait en extraire une seule
	# table, ce qu'un dump SQL brut ne permet pas.
	pg_dump --format=custom --compress=9 --file="${base}.dump.partiel"
	mv "${base}.dump.partiel" "${base}.dump"

	dire 'sauvegarde du volume de fichiers'
	tar -czf "${base}.fichiers.tar.gz.partiel" -C "${SOURCE_FICHIERS}" .
	mv "${base}.fichiers.tar.gz.partiel" "${base}.fichiers.tar.gz"

	# Les deux archives ne prennent leur nom définitif qu'une fois écrites : une
	# sauvegarde interrompue ne doit pas se faire passer pour complète, ni être
	# retenue par la rotation au détriment d'une bonne.
	taille_base=$(du -h "${base}.dump" | cut -f1)
	taille_fichiers=$(du -h "${base}.fichiers.tar.gz" | cut -f1)
	dire "écrites — base ${taille_base}, fichiers ${taille_fichiers}"

	tourner
}

tourner() {
	dire "rotation au-delà de ${RETENTION_JOURS} jours"

	find "${DESTINATION}" -maxdepth 1 -name '*.dump' -mtime "+${RETENTION_JOURS}" -print -delete
	find "${DESTINATION}" -maxdepth 1 -name '*.fichiers.tar.gz' -mtime "+${RETENTION_JOURS}" -print -delete
	# Les restes d'une exécution interrompue ne s'accumulent pas.
	find "${DESTINATION}" -maxdepth 1 -name '*.partiel' -mtime +1 -print -delete
}

boucle() {
	dire "sauvegarde quotidienne à ${HEURE_SAUVEGARDE}h00 UTC, rétention ${RETENTION_JOURS} jours"

	while true; do
		maintenant=$(date -u '+%H')

		if [ "${maintenant}" = "${HEURE_SAUVEGARDE}" ]; then
			sauvegarder || dire 'ÉCHEC de la sauvegarde — la prochaine réessaiera'
			# On dépasse l'heure courante pour ne pas sauvegarder deux fois.
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
