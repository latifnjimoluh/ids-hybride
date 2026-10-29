#!/usr/bin/env bash
#
# Installeur tout-en-un du projet ids-hybride (Appliance autonome Linux / WSL).
# À la fin, l'interface web est disponible sur http://<IP>:8000 et
# démarre automatiquement au boot (services systemd snort3 + ids-dashboard).
#
#     bash install.sh [-d /opt/ids-hybride] [-i <interface>] [--rebuild-frontend]
#
# Étapes :
#   1. Prérequis & Snort 3
#   2. Déploiement cible & Build du frontend React
#   3. venv backend Python & dépendances
#   4. Répertoire de logs & permissions
#   5. Services systemd (snort3 + ids-dashboard) et démarrage
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${TARGET_DIR:-${IDS_INSTALL_DIR:-/opt/ids-hybride}}"
REBUILD_FRONTEND=0
IFACE="${SNORT_INTERFACE:-}"

# Traitement des arguments CLI
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
    --rebuild-frontend)
      REBUILD_FRONTEND=1
      shift
      ;;
    -h|--help)
      cat <<EOF
Usage: $0 [OPTIONS]

Options:
  -d, --dir <PATH>         Répertoire de déploiement (défaut : /opt/ids-hybride)
  -i, --interface <IFACE>  Interface réseau pour Snort 3 (défaut : auto-détection)
  --rebuild-frontend       Force la recompilation du frontend React
  -h, --help               Affiche cette aide et quitte
EOF
      exit 0
      ;;
    *)
      echo "Option inconnue : $1" >&2
      exit 1
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

detect_local_ip() {
  local iface="${1:-}"
  local ip=""
  iface="$(echo "$iface" | tr -d '[:space:]')"
  if [ -n "$iface" ] && ip link show "$iface" >/dev/null 2>&1; then
    ip="$(ip -o -4 addr show dev "$iface" scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -n1)"
  fi
  if [ -z "$ip" ]; then
    ip="$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") {print $(i+1); exit}}')"
  fi
  if [ -z "$ip" ]; then
    ip="$(hostname -I 2>/dev/null | grep -oE '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b' | head -n1)"
  fi
  if [ -z "$ip" ]; then
    ip="$(ip -o -4 addr show scope global 2>/dev/null | awk '$2 !~ /^(lo|docker|br-|veth|virbr)/ {print $4}' | cut -d/ -f1 | head -n1)"
  fi
  if [ -z "$ip" ]; then
    ip="127.0.0.1"
  fi
  echo "$ip"
}

IFACE="$(detect_network_interface)"

echo "======================================================================"
echo " IDS-Hybride : Installation Appliance Autonome"
echo " Source      : $SRC_DIR"
echo " Cible       : $TARGET_DIR"
echo " Interface   : $IFACE"
echo "======================================================================"

# Déploiement vers TARGET_DIR si exécuté depuis un autre répertoire
if [ "$SRC_DIR" != "$TARGET_DIR" ]; then
  echo "==> Synchronisation des fichiers vers $TARGET_DIR"
  sudo mkdir -p "$TARGET_DIR"
  if command -v rsync >/dev/null 2>&1; then
    sudo rsync -a --exclude='.venv' --exclude='venv' --exclude='node_modules' --exclude='.git' "$SRC_DIR/" "$TARGET_DIR/"
  else
    sudo cp -a "$SRC_DIR/backend" "$TARGET_DIR/"
    sudo cp -a "$SRC_DIR/frontend" "$TARGET_DIR/"
    sudo cp -a "$SRC_DIR/config" "$TARGET_DIR/"
    sudo cp -a "$SRC_DIR/scripts" "$TARGET_DIR/"
    [ -f "$SRC_DIR/install.sh" ] && sudo cp -a "$SRC_DIR/install.sh" "$TARGET_DIR/"
    [ -f "$SRC_DIR/README.md" ] && sudo cp -a "$SRC_DIR/README.md" "$TARGET_DIR/"
  fi
fi

# 1. Snort 3
if ! command -v snort >/dev/null 2>&1; then
  echo "==> [1/4] Installation de Snort 3"
  if [ -f "$TARGET_DIR/scripts/install-snort3-wsl.sh" ]; then
    bash "$TARGET_DIR/scripts/install-snort3-wsl.sh"
  else
    bash "$SRC_DIR/scripts/install-snort3-wsl.sh"
  fi
else
  echo "==> [1/4] Snort 3 déjà installé ($(snort -V 2>&1 | grep -o 'Version [0-9.]*' | head -1))"
fi

# 2. Frontend (build) : servi par le backend FastAPI
if [ "$REBUILD_FRONTEND" -eq 1 ] || [ ! -f "$TARGET_DIR/frontend/dist/index.html" ]; then
  echo "==> [2/4] Build du frontend React"
  if ! command -v npm >/dev/null 2>&1; then
    echo "   Installation de Node.js/npm"
    sudo apt-get update && sudo apt-get install -y nodejs npm
  fi
  ( cd "$TARGET_DIR/frontend" && sudo npm install && sudo npm run build )
else
  echo "==> [2/4] Frontend déjà buildé ($TARGET_DIR/frontend/dist/index.html présent)"
fi

# 3. Backend (venv + dépendances)
VENV="$TARGET_DIR/venv"
if [ ! -d "$VENV" ]; then
  echo "==> [3/4] Création du venv backend + dépendances"
  if ! dpkg -s python3-venv >/dev/null 2>&1; then
    echo "   Installation des prérequis Python (python3-venv, python3-pip)"
    sudo apt-get update && sudo apt-get install -y python3-venv python3-pip
  fi
  sudo python3 -m venv "$VENV"
  sudo "$VENV/bin/pip" install -q --upgrade pip
  sudo "$VENV/bin/pip" install -q -r "$TARGET_DIR/backend/requirements.txt"
else
  echo "==> [3/4] venv backend déjà présent ($VENV)"
fi

# 4. Initialisation des logs et permissions
LOGDIR="$TARGET_DIR/logs"
sudo mkdir -p "$LOGDIR"
sudo touch "$LOGDIR/alert_json.txt"
sudo chmod 755 "$LOGDIR"
sudo chmod 644 "$LOGDIR/alert_json.txt"

# 5. Services systemd (Snort 3 + Dashboard)
echo "==> [4/4] Configuration des services systemd"
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
ExecStart=/usr/local/bin/snort -c $TARGET_DIR/config/snort.lua -i $IFACE -l $LOGDIR -A alert_json -s 65535 -k none -q
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
UNIT

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
Environment=SNORT_ALERT_JSON_PATH=$LOGDIR/alert_json.txt
Environment=SNORT_SERVICE_NAME=snort3
Environment=SNORT_INTERFACE=$IFACE
ExecStart=$VENV/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5s

[Install]
WantedBy=multi-user.target
UNIT

SERVICE_STATUS="inactif (systemd absent dans cet environnement)"
if pidof systemd >/dev/null 2>&1 || [ -d /run/systemd/system ]; then
  sudo systemctl daemon-reload
  sudo systemctl enable --now snort3 ids-dashboard || true
  SERVICE_STATUS="actif (démarré et activé au boot)"
fi

LOCAL_IP="$(detect_local_ip "$IFACE")"

echo ""
echo "======================================================================"
echo " IDS-Hybride : Installation terminée avec succès !"
echo "======================================================================"
echo " Interface de capture       : $IFACE"
echo " Répertoire d'installation  : $TARGET_DIR"
echo " Statut des services        : $SERVICE_STATUS"
echo ""
echo " Accès au Dashboard Web :"
echo "   - URL Réseau : http://${LOCAL_IP}:8000"
echo "   - URL Locale : http://localhost:8000"
echo ""
echo " Identifiants par défaut :"
echo "   - Utilisateur  : admin"
echo "   - Mot de passe : admin"
echo ""
echo " Commandes de gestion systemd :"
echo "   - État Snort 3    : sudo systemctl status snort3"
echo "   - État Dashboard  : sudo systemctl status ids-dashboard"
echo "   - Suivi logs live : journalctl -u ids-dashboard -f"
echo "======================================================================"
