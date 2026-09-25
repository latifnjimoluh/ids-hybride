#!/usr/bin/env bash
#
# Lance le backend du dashboard en MODE REEL (SNORT_BACKEND=linux) dans WSL.
# Le venv Linux est créé dans le home WSL (pas sur /mnt/d, pour la vitesse).
#     bash /mnt/d/Formation/Project/ids-hybride/scripts/run-backend-wsl.sh
set -euo pipefail

PROJ="/mnt/d/Formation/Project/ids-hybride/backend"
VENV="$HOME/.ids-hybride-venv"

if [ ! -d "$VENV" ]; then
  echo "==> Création du venv Linux + dépendances"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q --upgrade pip
  "$VENV/bin/pip" install -q -r "$PROJ/requirements.txt"
fi

echo "==> Backend en mode linux sur http://localhost:8000"
echo "   (le frontend Vite reste sur Windows : http://localhost:5173)"
cd "$PROJ"
SNORT_BACKEND=linux \
SNORT_CONFIG_PATH=/usr/local/etc/snort/snort.lua \
SNORT_RULES_PATH=/usr/local/etc/snort/rules/local.rules \
SNORT_ALERT_JSON_PATH=/var/log/snort/alert_json.txt \
SNORT_SERVICE_NAME=snort3 \
SNORT_INTERFACE=eth0 \
  "$VENV/bin/uvicorn" app.main:app --host 0.0.0.0 --port 8000
