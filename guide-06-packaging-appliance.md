# Guide 06 : Package « appliance » (installation en un script)

> Projet **ids-hybride**
> Objet : transformer le projet en une appliance web, à la manière des interfaces livrées avec Suricata (EveBox, Scirius). Une fois installé, tout démarre tout seul et l'interface est disponible sur une seule URL.

---

## Principe

En développement, on lance deux serveurs (backend uvicorn + frontend Vite). En mode appliance, c'est différent :

- Le **frontend est buildé** (`npm run build` → `frontend/dist/`).
- Le **backend FastAPI sert lui-même cette UI** : une seule application, un seul port (**8000**), qui répond à la fois à l'API (`/api/...`), au WebSocket (`/api/ws/alerts`) et à l'interface (toutes les autres routes renvoient l'app React).
- Deux **services systemd** démarrent automatiquement au boot :
  - `snort3` : le moteur de détection (capture sur eth0).
  - `ids-dashboard` : le backend + l'UI.

Résultat : après installation, ouvrir **http://localhost:8000** suffit. Plus besoin de Node/Vite en production.

```
Navigateur ──▶ http://localhost:8000
                     │
        ┌────────────▼─────────────┐
        │  ids-dashboard (systemd) │   FastAPI (uvicorn)
        │  /api/*   -> API JSON    │
        │  /api/ws  -> WebSocket   │
        │  /*       -> UI React    │  (frontend/dist)
        └────────────┬─────────────┘
                     │ lit alert_json / systemctl
        ┌────────────▼─────────────┐
        │  snort3 (systemd)        │   capture eth0
        └──────────────────────────┘
```

---

## Installation en une commande

Dans WSL (ou toute machine Linux), depuis la racine du projet :

```bash
bash install.sh
```

Le script enchaîne automatiquement :

1. **Snort 3** : installé s'il est absent (compilation, cf. guide 01).
2. **Frontend** : buildé s'il ne l'est pas déjà (installe Node/npm au besoin).
3. **Backend** : venv Python + dépendances.
4. **Services systemd** : crée et active `snort3` et `ids-dashboard`, puis les démarre.

À la fin :

```
Interface web : http://localhost:8000   (identifiants : admin / admin)
Snort et le dashboard démarrent automatiquement au boot.
```

> Prérequis : systemd actif (déjà le cas dans WSL récent), et l'accès sudo. Sur cette machine, le projet est sous `/mnt/d/Formation/Project/ids-hybride` ; les scripts de service utilisent ce chemin.

---

## Gestion des services

```bash
# État
systemctl status snort3 ids-dashboard --no-pager

# Démarrer / arrêter / redémarrer
sudo systemctl start   snort3 ids-dashboard
sudo systemctl stop    snort3 ids-dashboard
sudo systemctl restart ids-dashboard      # après une mise à jour du code

# Logs
journalctl -u ids-dashboard -f
journalctl -u snort3 -f
```

Le dashboard peut lui-même piloter le service `snort3` (start/stop/restart) depuis la page **Service**, puisqu'il tourne avec les privilèges nécessaires.

---

## Mettre à jour le frontend

Après une modification du code React :

```bash
cd frontend && npm run build          # régénère frontend/dist
sudo systemctl restart ids-dashboard  # recharge (sert le nouveau build)
```

Le backend sert le contenu de `frontend/dist` : un simple rebuild + restart suffit, aucune reconstruction de paquet.

---

## Rappels des deux modes

| Mode | Frontend | Backend | URL | Usage |
|------|----------|---------|-----|-------|
| **Développement** | Vite (`npm run dev`, port 5173, HMR) | uvicorn (port 8000) | http://localhost:5173 | Itération sur le code |
| **Appliance** | buildé, servi par le backend | uvicorn service systemd (port 8000) | http://localhost:8000 | Utilisation réelle |

En développement, Vite proxifie `/api` vers le backend. En appliance, tout est sur le même port, servi par FastAPI.

---

## Installation sur un PC vierge (comme on installe Suricata)

Les scripts détectent automatiquement l'emplacement du projet : on peut donc cloner où l'on veut et lancer une seule commande.

### Cas A : PC Windows vierge (via WSL)

```powershell
# 1. PowerShell administrateur : installer WSL2 + Ubuntu, puis redémarrer
wsl --install
```
(La virtualisation doit être active dans le BIOS ; l'hyperviseur Windows est activé par `wsl --install`.)

```bash
# 2. Dans Ubuntu (WSL), prérequis + clone + installation
sudo apt update && sudo apt install -y git python3 python3-venv
git clone https://github.com/latifnjimoluh/ids-hybride.git
cd ids-hybride
bash install.sh
```

### Cas B : PC Linux vierge (Ubuntu / Debian)

```bash
sudo apt update && sudo apt install -y git python3 python3-venv
git clone https://github.com/latifnjimoluh/ids-hybride.git
cd ids-hybride
bash install.sh
```

Dans les deux cas, à la fin : **http://localhost:8000** (admin / admin), Snort et le dashboard démarrés et activés au boot.

### À savoir

- **Dépôt privé** : le clone demande une authentification GitHub (`gh auth login`, un token, ou une clé SSH). Le rendre public simplifie l'installation.
- **Durée** : `install.sh` compile Snort 3 depuis les sources (10 à 20 min). C'est une commande unique, mais plus long qu'un `apt install suricata` (Snort 3 n'est pas packagé).
- **Sudo** : sur une machine sans NOPASSWD, `install.sh` demande le mot de passe (lancement interactif dans un terminal).
- **Vraie sonde** (hors WSL) : ajuster l'interface de capture (`SNORT_INTERFACE`, `eth0` par défaut) dans `scripts/setup-service-wsl.sh` et restreindre `HOME_NET` dans `config/snort.lua`.

## Distribution encore plus simple (pistes)

Pour se rapprocher davantage du `apt install` de Suricata, les étapes suivantes possibles sont une **image Docker** (`docker compose up`) ou un **paquet `.deb`** (`apt install ./ids-hybride.deb`) avec les services systemd inclus.
