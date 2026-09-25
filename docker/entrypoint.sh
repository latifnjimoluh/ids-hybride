#!/usr/bin/env bash
# Point d'entrée du conteneur : prépare les dossiers puis lance supervisor,
# qui gère Snort (capture) et le dashboard (backend + UI) ensemble.
set -e

mkdir -p /opt/ids-hybride/logs

# Repli si l'interface configurée n'existe pas dans le conteneur.
if ! ip link show "${SNORT_INTERFACE:-eth0}" >/dev/null 2>&1; then
  iface="$(ip -o link show | awk -F': ' '$2 != "lo" {print $2; exit}')"
  export SNORT_INTERFACE="${iface:-eth0}"
  echo "[entrypoint] interface ${SNORT_INTERFACE} sélectionnée automatiquement"
fi

exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf
