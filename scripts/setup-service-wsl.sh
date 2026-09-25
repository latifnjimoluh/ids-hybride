#!/usr/bin/env bash
#
# Installe le service systemd snort3 attendu par le backend (mode linux).
# Utilise la config et les règles du projet (sur /mnt/d, éditables par le
# dashboard) et écrit les logs sur /mnt/d (lisibles sans root).
#     bash /mnt/d/Formation/Project/ids-hybride/scripts/setup-service-wsl.sh
set -euo pipefail

PROJ=/mnt/d/Formation/Project/ids-hybride
CONF="$PROJ/config/snort.lua"
LOGDIR="$PROJ/logs"

mkdir -p "$LOGDIR"

echo "==> Installation du service snort3.service"
sudo tee /etc/systemd/system/snort3.service >/dev/null <<UNIT
[Unit]
Description=Snort 3 NIDS (ids-hybride)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/snort -c $CONF -i eth0 -l $LOGDIR -A alert_json -s 65535 -k none -q
Restart=on-failure

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable snort3.service
echo "==> Service installé et activé."
echo "   Démarrer : sudo systemctl start snort3 && systemctl status snort3 --no-pager"
