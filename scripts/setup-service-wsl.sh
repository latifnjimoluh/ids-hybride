#!/usr/bin/env bash
#
# Installe le service systemd snort3 attendu par le backend (mode linux).
# Utilise la config et les règles du projet (sous /opt/ids-hybride ou chemin configuré).
#     bash scripts/setup-service-wsl.sh [-d /opt/ids-hybride] [-i <interface>]
set -euo pipefail

TARGET_DIR="${TARGET_DIR:-${IDS_INSTALL_DIR:-/opt/ids-hybride}}"
IFACE="${SNORT_INTERFACE:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -d|--dir)
      TARGET_DIR="$2"
      shift 2
      ;;
    -i|--interface)
      IFACE="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [-d <target_dir>] [-i <interface>]"
      exit 0
      ;;
    *)
      shift
      ;;
  esac
done

detect_network_interface() {
  local iface=""

  IFACE="$(echo "${IFACE:-}" | tr -d '[:space:]')"
  SNORT_INTERFACE="$(echo "${SNORT_INTERFACE:-}" | tr -d '[:space:]')"

  # 1. Respect d'une interface explicite
  if [ -n "$IFACE" ]; then
    if ip link show "$IFACE" >/dev/null 2>&1; then
      echo "$IFACE"
      return 0
    else
      echo "AVERTISSEMENT: L'interface '$IFACE' spécifiée par argument n'existe pas sur le système. Recherche automatique..." >&2
    fi
  fi
  if [ -n "$SNORT_INTERFACE" ]; then
    if ip link show "$SNORT_INTERFACE" >/dev/null 2>&1; then
      echo "$SNORT_INTERFACE"
      return 0
    else
      echo "AVERTISSEMENT: L'interface '$SNORT_INTERFACE' (SNORT_INTERFACE) n'existe pas sur le système. Recherche automatique..." >&2
    fi
  fi

  # 2. Requête vers le routeur / IP publique via le noyau
  iface="$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="dev") {print $(i+1); exit}}')"
  if [ -n "$iface" ] && ip link show "$iface" >/dev/null 2>&1; then
    echo "$iface"
    return 0
  fi

  # 3. Route par défaut
  iface="$(ip -o -4 route show to default 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="dev") {print $(i+1); exit}}' | head -n1)"
  if [ -n "$iface" ] && ip link show "$iface" >/dev/null 2>&1; then
    echo "$iface"
    return 0
  fi

  # 4. Première interface avec IPv4 globale active (hors loopback, conteneurs et bridges)
  iface="$(ip -o -4 addr show scope global 2>/dev/null | awk '{print $2}' | grep -Ev '^(lo|docker|br-|veth|virbr)' | head -n1)"
  if [ -n "$iface" ] && ip link show "$iface" >/dev/null 2>&1; then
    echo "$iface"
    return 0
  fi

  # 5. Première interface physique/virtuelle UP dans /sys/class/net
  for dev in /sys/class/net/*; do
    if [ -d "$dev" ]; then
      local name
      name="$(basename "$dev")"
      case "$name" in
        lo|docker*|br-*|veth*|virbr*|tun*|tap*) continue ;;
        *)
          if [ -f "$dev/operstate" ] && [ "$(cat "$dev/operstate" 2>/dev/null)" = "up" ]; then
            echo "$name"
            return 0
          fi
          ;;
      esac
    fi
  done

  # 6. Première interface non-loopback vue par ip link
  iface="$(ip -o link show 2>/dev/null | awk -F': ' '$2 != "lo" && $2 !~ /^(docker|br-|veth|virbr)/ {print $2; exit}')"
  if [ -n "$iface" ]; then
    echo "$iface"
    return 0
  fi

  # 7. Repli ultime
  echo "eth0"
}

IFACE="$(detect_network_interface)"
CONF="$TARGET_DIR/config/snort.lua"
LOGDIR="$TARGET_DIR/logs"

sudo mkdir -p "$LOGDIR"
sudo touch "$LOGDIR/alert_json.txt"
sudo chmod 755 "$LOGDIR"
sudo chmod 644 "$LOGDIR/alert_json.txt"

echo "==> Installation du service snort3.service (interface: $IFACE, dir: $TARGET_DIR)"
sudo tee /etc/systemd/system/snort3.service >/dev/null <<UNIT
[Unit]
Description=Snort 3 NIDS (ids-hybride)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=$TARGET_DIR
ExecStartPre=/bin/mkdir -p $LOGDIR
ExecStartPre=/usr/bin/touch $LOGDIR/alert_json.txt
ExecStart=/usr/local/bin/snort -c $CONF -i $IFACE -l $LOGDIR -A alert_json -s 65535 -k none -q
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
UNIT

if pidof systemd >/dev/null 2>&1 || [ -d /run/systemd/system ]; then
  sudo systemctl daemon-reload
  sudo systemctl enable snort3.service
  echo "==> Service snort3 installé et activé."
  echo "   Démarrer : sudo systemctl start snort3 && systemctl status snort3 --no-pager"
else
  echo "==> Fichier /etc/systemd/system/snort3.service généré (systemd non actif dans cet environnement)."
fi
