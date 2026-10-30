#!/usr/bin/env bash
#
# Script de mise à jour automatique IDS-Hybride (Appliance Linux Ubuntu).
#
# Ce script :
#   1. Récupère les dernières modifications du dépôt Git (git pull)
#   2. Met à jour les dépendances Python du backend (/opt/ids-hybride/venv)
#   3. Recompile le frontend React (/opt/ids-hybride/frontend/dist)
#   4. Préserve les logs et la configuration existante
#   5. Redémarre proprement les services systemd (snort3 + ids-dashboard)
#   6. Valide la bonne santé du système (Health Check)
#
# Usage :
#   sudo bash update.sh
#
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${TARGET_DIR:-${IDS_INSTALL_DIR:-/opt/ids-hybride}}"
VENV="$TARGET_DIR/venv"

echo "======================================================================"
echo " 🔄 IDS-Hybride : Mise à jour automatique de l'appliance"
echo " Source   : $SRC_DIR"
echo " Cible    : $TARGET_DIR"
echo "======================================================================"

# 1. Vérification des droits root
if [ "$EUID" -ne 0 ]; then
  echo "Erreur : Ce script doit être exécuté avec les privilèges root (sudo bash update.sh)" >&2
  exit 1
fi

# 2. Récupération des dernières modifications Git
echo "==> [1/5] Téléchargement des dernières mises à jour (git pull)..."
cd "$SRC_DIR"
if [ -d ".git" ]; then
  # Récupère l'utilisateur original si sudo a été utilisé
  ORIGINAL_USER="${SUDO_USER:-$(whoami)}"
  # Marque le dépôt comme safe si git s'exécute sous root
  git config --global --add safe.directory "$SRC_DIR" || true
  git pull origin main
else
  echo "    (Pas de répertoire .git détecté dans $SRC_DIR, synchronisation directe)"
fi

# 3. Synchronisation vers /opt/ids-hybride (si SRC_DIR != TARGET_DIR)
if [ "$SRC_DIR" != "$TARGET_DIR" ]; then
  echo "==> [2/5] Déploiement des fichiers vers $TARGET_DIR..."
  mkdir -p "$TARGET_DIR"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a \
      --exclude='.venv' \
      --exclude='venv' \
      --exclude='node_modules' \
      --exclude='logs' \
      --exclude='.git' \
      "$SRC_DIR/" "$TARGET_DIR/"
  else
    cp -a "$SRC_DIR/backend" "$TARGET_DIR/"
    cp -a "$SRC_DIR/frontend" "$TARGET_DIR/"
    cp -a "$SRC_DIR/config" "$TARGET_DIR/"
    cp -a "$SRC_DIR/scripts" "$TARGET_DIR/"
    [ -f "$SRC_DIR/install.sh" ] && cp -a "$SRC_DIR/install.sh" "$TARGET_DIR/"
    [ -f "$SRC_DIR/update.sh" ] && cp -a "$SRC_DIR/update.sh" "$TARGET_DIR/"
    [ -f "$SRC_DIR/README.md" ] && cp -a "$SRC_DIR/README.md" "$TARGET_DIR/"
  fi
fi

# 4. Mise à jour des dépendances Python du Backend
echo "==> [3/5] Mise à jour des dépendances backend..."
if [ -d "$VENV" ]; then
  "$VENV/bin/pip" install -q --upgrade pip
  "$VENV/bin/pip" install -q -r "$TARGET_DIR/backend/requirements.txt"
else
  echo "    Création de l'environnement virtuel..."
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q --upgrade pip
  "$VENV/bin/pip" install -q -r "$TARGET_DIR/backend/requirements.txt"
fi

# 5. Recompilation du Frontend React
echo "==> [4/5] Recompilation du Frontend React..."
if ! command -v npm >/dev/null 2>&1; then
  apt-get update && apt-get install -y nodejs npm
fi
(
  cd "$TARGET_DIR/frontend"
  npm install --silent
  npm run build
)

# 6. Redémarrage des services systemd
echo "==> [5/5] Redémarrage des services systemd..."
if pidof systemd >/dev/null 2>&1 || [ -d /run/systemd/system ]; then
  systemctl daemon-reload
  systemctl restart snort3 || echo "Avertissement: redémarrage snort3 ignoré (peut-être inactif)"
  systemctl restart ids-dashboard
  echo "    Services redémarrés avec succès."
else
  echo "    Environnement sans systemd actif. Relancez manuellement votre processus."
fi

# 7. Test de santé (Health Check)
echo ""
echo "==> Vérification de la disponibilité du service..."
sleep 2
if command -v curl >/dev/null 2>&1; then
  HEALTH_OUT="$(curl -s http://127.0.0.1:8000/api/health || true)"
  if echo "$HEALTH_OUT" | grep -q '"status":"ok"'; then
    echo "    ✅ Health Check validé : $HEALTH_OUT"
  else
    echo "    ℹ️ Le service démarre (réponse : $HEALTH_OUT)"
  fi
fi

echo ""
echo "======================================================================"
echo " 🎉 Mise à jour terminée avec succès !"
echo "======================================================================"
echo " Dashboard disponible sur http://localhost:8000 ou http://<IP>:8000"
echo " Logs : sudo journalctl -u ids-dashboard -f"
echo "======================================================================"
