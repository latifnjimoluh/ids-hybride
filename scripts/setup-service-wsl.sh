#!/usr/bin/env bash
#
# Configure systemd dans WSL et installe le service snort3 attendu par le
# backend (mode linux : systemctl start/stop, journalctl).
# À lancer DANS WSL après install-snort3-wsl.sh :
#     bash /mnt/d/Formation/Project/ids-hybride/scripts/setup-service-wsl.sh
set -euo pipefail

echo "==> Activation de systemd dans WSL (/etc/wsl.conf)"
if ! grep -q "systemd=true" /etc/wsl.conf 2>/dev/null; then
  sudo tee /etc/wsl.conf >/dev/null <<'CONF'
[boot]
systemd=true
CONF
  echo "   systemd activé. IMPORTANT : depuis PowerShell (Windows), lance :"
  echo "       wsl --shutdown"
  echo "   puis rouvre Ubuntu, et relance ce script."
fi

echo "==> Installation du service snort3.service"
sudo tee /etc/systemd/system/snort3.service >/dev/null <<'UNIT'
[Unit]
Description=Snort 3 NIDS (ids-hybride)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/snort -c /usr/local/etc/snort/snort.lua -i eth0 -l /var/log/snort -A alert_json -s 65535 -k none -q
Restart=on-failure

[Install]
WantedBy=multi-user.target
UNIT

if pidof systemd >/dev/null 2>&1; then
  sudo systemctl daemon-reload
  sudo systemctl enable snort3.service
  echo "==> Service installé et activé."
  echo "   Test : sudo systemctl start snort3 && systemctl status snort3"
else
  echo "!! systemd n'est pas actif dans cette session WSL."
  echo "   Fais 'wsl --shutdown' depuis PowerShell, rouvre Ubuntu, puis relance ce script."
fi
