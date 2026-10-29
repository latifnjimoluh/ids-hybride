#!/usr/bin/env bash
#
# Installe le service systemd ids-dashboard : le backend FastAPI qui sert
# AUSSI l'interface web (frontend buildé). Une seule URL/port (8000).
#     bash scripts/setup-dashboard-service-wsl.sh [-d /opt/ids-hybride] [-i <interface>]
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

# Détermination du venv
VENV="$TARGET_DIR/venv"
if [ ! -f "$VENV/bin/uvicorn" ]; then
  if [ -f "$TARGET_DIR/.venv/bin/uvicorn" ]; then
    VENV="$TARGET_DIR/.venv"
  elif [ -f "$HOME/.ids-hybride-venv/bin/uvicorn" ]; then
    VENV="$HOME/.ids-hybride-venv"
  fi
fi

# venv backend si absent
if [ ! -d "$VENV" ]; then
  echo "==> Création du venv backend dans $VENV"
  if ! dpkg -s python3-venv >/dev/null 2>&1; then
    sudo apt-get update && sudo apt-get install -y python3-venv python3-pip
  fi
  sudo python3 -m venv "$VENV"
  sudo "$VENV/bin/pip" install -q --upgrade pip
  sudo "$VENV/bin/pip" install -q -r "$TARGET_DIR/backend/requirements.txt"
fi

UVICORN_BIN="$VENV/bin/uvicorn"
if [ ! -f "$UVICORN_BIN" ]; then
  UVICORN_BIN="$TARGET_DIR/venv/bin/uvicorn"
fi

echo "==> Installation du service ids-dashboard.service (interface: $IFACE, dir: $TARGET_DIR)"
sudo tee /etc/systemd/system/ids-dashboard.service >/dev/null <<UNIT
[Unit]
Description=IDS-Hybride Dashboard (FastAPI + UI)
After=network-online.target snort3.service
Wants=network-online.target snort3.service

[Service]
Type=simple
User=root
WorkingDirectory=$TARGET_DIR/backend
Environment=SNORT_BACKEND=linux
Environment=SNORT_CONFIG_PATH=$TARGET_DIR/config/snort.lua
Environment=SNORT_RULES_PATH=$TARGET_DIR/config/local.rules
Environment=SNORT_ALERT_JSON_PATH=$TARGET_DIR/logs/alert_json.txt
Environment=SNORT_SERVICE_NAME=snort3
Environment=SNORT_INTERFACE=$IFACE
ExecStart=$UVICORN_BIN app.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5s

[Install]
WantedBy=multi-user.target
UNIT

if pidof systemd >/dev/null 2>&1 || [ -d /run/systemd/system ]; then
  sudo systemctl daemon-reload
  sudo systemctl enable ids-dashboard.service
  echo "==> Service ids-dashboard installé et activé."
  echo "   Démarrer : sudo systemctl start ids-dashboard"
else
  echo "==> Fichier /etc/systemd/system/ids-dashboard.service généré (systemd non actif dans cet environnement)."
fi
