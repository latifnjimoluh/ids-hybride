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

## Portabilité (déploiement ailleurs)

Les scripts de service utilisent le chemin actuel du projet. Pour déployer sur une autre machine ou un autre emplacement :

- Adapter le chemin `PROJ` dans `scripts/setup-service-wsl.sh` et `scripts/setup-dashboard-service-wsl.sh` (ou cloner le projet au même emplacement).
- Sur une vraie sonde (hors WSL), choisir l'interface de capture (`SNORT_INTERFACE`) et restreindre `HOME_NET` dans `config/snort.lua`.
- Pour une distribution plus poussée, les prochaines étapes possibles sont une image Docker ou un paquet `.deb` (voir pistes en fin de README).
