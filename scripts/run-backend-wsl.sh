#!/usr/bin/env bash
#
# Lance le backend du dashboard en MODE REEL (SNORT_BACKEND=linux) dans WSL.
# Le venv Linux est créé en utilisateur (dans le home WSL, hors /mnt/d pour la
# vitesse) ; uvicorn est ensuite lancé en root car le contrôleur linux doit
# piloter systemctl, lire /var/log/snort (écrit par le service root) et écrire
# la config sous /usr/local/etc/snort.
#     bash /mnt/d/Formation/Project/ids-hybride/scripts/run-backend-wsl.sh
set -euo pipefail

# Racine du projet, détectée automatiquement (parent du dossier scripts/).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJ="$ROOT/backend"
VENV="$HOME/.ids-hybride-venv"

if [ ! -d "$VENV" ]; then
  echo "==> Création du venv Linux + dépendances (utilisateur)"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q --upgrade pip
  "$VENV/bin/pip" install -q -r "$PROJ/requirements.txt"
fi

echo "==> Backend en mode linux (root) sur http://localhost:8000"
echo "   (le frontend Vite reste sur Windows : http://localhost:5173)"
cd "$PROJ"
sudo SNORT_BACKEND=linux \
     SNORT_CONFIG_PATH="$ROOT/config/snort.lua" \
     SNORT_RULES_PATH="$ROOT/config/local.rules" \
     SNORT_ALERT_JSON_PATH="$ROOT/logs/alert_json.txt" \
     SNORT_SERVICE_NAME=snort3 \
     SNORT_INTERFACE=eth0 \
     "$VENV/bin/uvicorn" app.main:app --host 0.0.0.0 --port 8000
