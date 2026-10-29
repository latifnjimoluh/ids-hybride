#!/usr/bin/env bash
#
# Lance le backend du dashboard en MODE REEL (SNORT_BACKEND=linux) dans WSL / Linux.
# Le venv Linux est créé en utilisateur (dans le home WSL pour la
# vitesse) ; uvicorn est ensuite lancé en root car le contrôleur linux doit
# piloter systemctl, lire alert_json.txt et écrire la config.
#     bash scripts/run-backend-wsl.sh
set -euo pipefail

# Racine du projet, détectée automatiquement (parent du dossier scripts/).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJ="$ROOT/backend"
VENV="$HOME/.ids-hybride-venv"

IFACE=""

while [ $# -gt 0 ]; do
  case "$1" in
    -i|--interface)
      IFACE="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [-i <interface>]"
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

if [ ! -d "$VENV" ]; then
  echo "==> Création du venv Linux + dépendances (utilisateur)"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q --upgrade pip
  "$VENV/bin/pip" install -q -r "$PROJ/requirements.txt"
fi

echo "==> Backend en mode linux (root) sur http://localhost:8000 (interface: $IFACE)"
echo "   (le frontend Vite reste sur Windows : http://localhost:5173)"
cd "$PROJ"
sudo SNORT_BACKEND=linux \
     SNORT_CONFIG_PATH="$ROOT/config/snort.lua" \
     SNORT_RULES_PATH="$ROOT/config/local.rules" \
     SNORT_ALERT_JSON_PATH="$ROOT/logs/alert_json.txt" \
     SNORT_SERVICE_NAME=snort3 \
     SNORT_INTERFACE="$IFACE" \
     "$VENV/bin/uvicorn" app.main:app --host 0.0.0.0 --port 8000
