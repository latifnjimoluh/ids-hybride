#!/usr/bin/env bash
#
# Installeur tout-en-un du projet ids-hybride (à lancer dans WSL / Linux).
# À la fin, l'interface web est disponible sur http://localhost:8000 et
# démarre automatiquement au boot (services systemd).
#
#     bash install.sh
#
# Étapes : Snort 3 -> build du frontend -> venv backend -> services systemd
# (snort3 + ids-dashboard) -> démarrage.
set -euo pipefail

PROJ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJ"

echo "======================================================================"
echo " IDS-Hybride : installation ($PROJ)"
echo "======================================================================"

# 1. Snort 3
if ! command -v snort >/dev/null 2>&1; then
  echo "==> [1/4] Installation de Snort 3"
  bash "$PROJ/scripts/install-snort3-wsl.sh"
else
  echo "==> [1/4] Snort déjà installé ($(snort -V 2>&1 | grep -o 'Version [0-9.]*' | head -1))"
fi

# 2. Frontend (build) : nécessaire pour que le backend serve l'UI
if [ ! -f "$PROJ/frontend/dist/index.html" ]; then
  echo "==> [2/4] Build du frontend"
  if ! command -v npm >/dev/null 2>&1; then
    echo "   Installation de Node.js/npm"
    sudo apt-get update && sudo apt-get install -y nodejs npm
  fi
  ( cd "$PROJ/frontend" && npm install && npm run build )
else
  echo "==> [2/4] Frontend déjà buildé (frontend/dist présent)"
fi

# 3. Backend (venv + dépendances)
VENV="$HOME/.ids-hybride-venv"
if [ ! -d "$VENV" ]; then
  echo "==> [3/4] Création du venv backend + dépendances"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q --upgrade pip
  "$VENV/bin/pip" install -q -r "$PROJ/backend/requirements.txt"
else
  echo "==> [3/4] venv backend déjà présent"
fi

# 4. Services systemd (Snort + Dashboard) et démarrage
echo "==> [4/4] Services systemd"
bash "$PROJ/scripts/setup-service-wsl.sh"
bash "$PROJ/scripts/setup-dashboard-service-wsl.sh"
sudo systemctl restart snort3 ids-dashboard

echo ""
echo "======================================================================"
echo " Installation terminée."
echo " Interface web : http://localhost:8000   (identifiants : admin / admin)"
echo " Snort et le dashboard démarrent automatiquement au boot."
echo "======================================================================"
