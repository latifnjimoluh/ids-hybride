#!/usr/bin/env bash
#
# Installe le service systemd ids-dashboard : le backend FastAPI qui sert
# AUSSI l'interface web (frontend buildé). Une seule URL/port (8000).
#     bash /mnt/d/Formation/Project/ids-hybride/scripts/setup-dashboard-service-wsl.sh
set -euo pipefail

# Racine du projet, détectée automatiquement (parent du dossier scripts/).
PROJ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="$HOME/.ids-hybride-venv"

# venv backend si absent
if [ ! -d "$VENV" ]; then
  echo "==> Création du venv backend"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q --upgrade pip
  "$VENV/bin/pip" install -q -r "$PROJ/backend/requirements.txt"
fi

echo "==> Installation du service ids-dashboard.service"
sudo tee /etc/systemd/system/ids-dashboard.service >/dev/null <<UNIT
[Unit]
Description=IDS-Hybride Dashboard (FastAPI + UI)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=SNORT_BACKEND=linux
Environment=SNORT_CONFIG_PATH=$PROJ/config/snort.lua
Environment=SNORT_RULES_PATH=$PROJ/config/local.rules
Environment=SNORT_ALERT_JSON_PATH=$PROJ/logs/alert_json.txt
Environment=SNORT_SERVICE_NAME=snort3
Environment=SNORT_INTERFACE=eth0
WorkingDirectory=$PROJ/backend
ExecStart=$VENV/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=on-failure

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable ids-dashboard.service
echo "==> Service ids-dashboard installé et activé."
echo "   Démarrer : sudo systemctl start ids-dashboard"
echo "   Interface : http://localhost:8000"
