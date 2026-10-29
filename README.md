# IDS-Hybride

Un système de détection d'intrusion **hybride**, livré avec son **interface web** : la détection par **signatures** (Snort 3) est complétée par une détection d'**anomalies** par machine learning, le tout piloté depuis un dashboard unique.

L'idée : les signatures attrapent les menaces **connues**, le module ML fait ressortir l'**inconnu** (ce qui s'écarte du trafic habituel). Une fois installé, tout démarre seul et l'interface est accessible sur une seule URL, à la manière des appliances livrées avec Suricata.

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Démarrage rapide](#démarrage-rapide)
  - [Docker (le plus simple)](#option-1--docker-le-plus-simple)
  - [Installeur natif (WSL / Linux)](#option-2--installeur-natif-wsl--linux)
  - [Mode développement](#option-3--mode-développement)
- [Le dashboard, page par page](#le-dashboard-page-par-page)
- [Configuration](#configuration)
- [Documentation](#documentation)
- [Pile technique](#pile-technique)
- [Avertissement](#avertissement)

---

## Fonctionnalités

- **Moteur Snort 3** : capture réseau, règles, détection par signatures, sortie JSON.
- **Dashboard web complet** : tout ce qu'on ferait en ligne de commande, depuis l'interface.
  - Gestion des règles (création assistée ou brute, activation, import de rulesets, validation).
  - Flux d'alertes en **temps réel** (WebSocket) avec **notifications navigateur** et pagination.
  - **Analyse de captures PCAP** (upload puis exécution de Snort).
  - Contrôle du service (start/stop/restart), options d'exécution.
  - Édition de la configuration (`snort.lua`) et des variables réseau.
  - Introspection **Système** (version, plugins, DAQ, interfaces) et **Console** Snort.
  - Consultation des **logs**.
- **Module ML / Anomalies** : Isolation Forest (scikit-learn) entraîné sur les événements Snort, avec score d'anomalie et visualisation.
- **Authentification** JWT.
- **Appliance** : le backend sert lui-même l'interface (une seule URL/port), services au démarrage.

---

## Architecture

```
   Trafic réseau
        │
        ▼
   ┌──────────┐   alert_json      ┌───────────────────────────────┐
   │ Snort 3  │──────────────────▶│  Backend FastAPI              │
   │ (capture)│                   │   /api/*   API JSON           │
   └──────────┘                   │   /api/ws  WebSocket (live)   │
        ▲                         │   /*       UI React (buildée) │
        │ systemctl / supervisor  │   /api/ml  Isolation Forest   │
        └─────────────────────────│                               │
                                  └───────────────┬───────────────┘
                                                  │ http://localhost:8000
                                                  ▼
                                            Navigateur (dashboard)
```

Le backend possède deux implémentations interchangeables via `SNORT_BACKEND` :
- `mock` : tout est simulé (développement sous Windows, sans Snort).
- `linux` : pilote un vrai Snort (systemd en WSL/VM, supervisor en conteneur).

---

## Démarrage rapide

### Option 1 : Docker / Appliance clé en main (le plus simple & instantané)

Prérequis : Docker.

**En une seule commande (image pré-compilée prête à l'emploi) :**
```bash
docker run -d \
  --name ids-hybride \
  --restart unless-stopped \
  -p 8000:8000 \
  --cap-add NET_ADMIN \
  --cap-add NET_RAW \
  ghcr.io/latifnjimoluh/ids-hybride:latest
```

**Ou via Docker Compose :**
```bash
git clone https://github.com/latifnjimoluh/ids-hybride.git
cd ids-hybride
docker compose up -d
```

L'interface est immédiatement accessible sur **http://localhost:8000** (identifiants par défaut : `admin` / `admin`).
L'image inclut Snort 3, libDAQ, le moteur Machine Learning, le backend FastAPI et l'interface React déjà intégrée. Aucune étape de compilation locale n'est requise.

> **Capture réseau selon l'environnement.**
> - Sur **Docker Desktop** (Windows / macOS), le conteneur tourne dans une VM : la capture *live* ne voit pas le trafic de l'hôte. Tout le reste fonctionne (interface, règles, **analyse PCAP**, ML, système, console) ; utilisez la page **Analyse PCAP** pour inspecter de vraies captures.
> - Sur **Linux natif**, décommentez `network_mode: host` dans `docker-compose.yml` : Snort capture alors le vrai trafic de la machine.
> - Pour de la capture live continue sur Windows, préférez l'installeur natif dans WSL (`install.sh`), où Snort capture automatiquement l'interface réseau active.

### Option 2 : Installeur natif — Appliance autonome (WSL / Linux)

Pour installer une appliance prête à l'emploi directement sur une machine Linux (bare-metal, VM ou WSL 2 sous Windows) :

```bash
git clone https://github.com/latifnjimoluh/ids-hybride.git
cd ids-hybride
sudo bash install.sh
```

**Options avancées :**
```bash
sudo bash install.sh [-d /opt/ids-hybride] [-i <interface>] [--rebuild-frontend]
```
- `-d, --dir <PATH>` : Chemin de déploiement (défaut : `/opt/ids-hybride`).
- `-i, --interface <IFACE>` : Interface réseau pour la capture (défaut : auto-détection dynamique multi-niveaux).
- `--rebuild-frontend` : Recompilation forcée du frontend React.

Le script installe Snort 3, synchronise le projet vers le répertoire cible, build l'UI React vers `frontend/dist`, configure l'environnement virtuel Python (`venv`), initialise les fichiers de logs avec permissions sécurisées, puis crée et démarre les services systemd `snort3.service` et `ids-dashboard.service`.

L'interface web est immédiatement disponible sur le réseau local : **http://&lt;IP&gt;:8000** et en local sur **http://localhost:8000** (identifiants par défaut : `admin` / `admin`).

**Gestion des services systemd :**
```bash
sudo systemctl status snort3 ids-dashboard
sudo systemctl restart ids-dashboard
journalctl -u ids-dashboard -f
```

Sous Windows, activez WSL 2 (`wsl --install` en PowerShell admin), puis lancez les commandes dans Ubuntu. Détails complets dans [guide-06-packaging-appliance.md](./guide-06-packaging-appliance.md).

### Option 3 : Mode développement

Deux serveurs séparés, avec rechargement à chaud du frontend.

```bash
# Backend (mock sous Windows, ou linux dans WSL)
cd backend && python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000

# Frontend (autre terminal)
cd frontend && npm install && npm run dev      # http://localhost:5173
```

Sous Windows, un script existe : `.\start-dev.ps1`.

---

## Le dashboard, page par page

| Page | Rôle |
|------|------|
| **Tableau de bord** | Vue d'ensemble : état du service, alertes, règles actives, graphiques. |
| **Règles** | Créer, éditer, (dés)activer, importer et valider les règles Snort. |
| **Alertes** | Flux temps réel (WebSocket), filtres, pagination, notifications navigateur. |
| **ML / Anomalies** | Entraînement Isolation Forest, scores d'anomalie, événements atypiques. |
| **Analyse PCAP** | Upload d'une capture et exécution de Snort dessus. |
| **Service** | Démarrer / arrêter / redémarrer Snort, options d'exécution. |
| **Configuration** | Variables réseau et édition brute de `snort.lua`. |
| **Système** | Version, plugins, modules DAQ, interfaces réseau. |
| **Logs** | Journal du moteur. |
| **Console** | Commandes d'introspection Snort (lecture seule). |

---

## Configuration

Variables d'environnement du backend (préfixe `SNORT_`) :

| Variable | Défaut | Rôle |
|----------|--------|------|
| `SNORT_BACKEND` | `mock` | `mock` (simulé) ou `linux` (vrai Snort). |
| `SNORT_SERVICE_MANAGER` | `systemd` | `systemd` (WSL/VM/Appliance) ou `supervisor` (conteneur). |
| `SNORT_CONFIG_PATH` | `/opt/ids-hybride/config/snort.lua` | Fichier de config Snort (repli `/usr/local/etc/snort/snort.lua`). |
| `SNORT_RULES_PATH` | `/opt/ids-hybride/config/local.rules` | Fichier de règles locales éditables. |
| `SNORT_ALERT_JSON_PATH` | `/opt/ids-hybride/logs/alert_json.txt` | Sortie JSON lue par le dashboard. |
| `SNORT_INTERFACE` | Auto-détectée (repli `eth0`) | Interface de capture (détection dynamique multi-niveaux). |
| `SNORT_SECRET_KEY` | *(dev)* | Clé de signature JWT (**à changer en production**). |
| `SNORT_ADMIN_USER` / `SNORT_ADMIN_PASSWORD` | `admin` / `admin` | Identifiants initiaux. |

---

## Documentation

Guides détaillés à la racine du dépôt :

| Document | Contenu |
|----------|---------|
| [recherche-ids-opensource.md](./recherche-ids-opensource.md) | Panorama des IDS open source (NIDS/HIDS, Snort, Suricata, Zeek, Wazuh, approche hybride, datasets ML). |
| [recherche-snort.md](./recherche-snort.md) | Étude approfondie de Snort et de son écosystème. |
| [guide-01-installation-snort3.md](./guide-01-installation-snort3.md) | Installation et configuration de Snort 3 sur Ubuntu. |
| [guide-02-regles-snort3.md](./guide-02-regles-snort3.md) | Écriture de règles Snort 3. |
| [guide-03-integration-wazuh-elk.md](./guide-03-integration-wazuh-elk.md) | Intégration Snort vers Wazuh / ELK. |
| [guide-04-dashboard.md](./guide-04-dashboard.md) | Le dashboard : architecture, API, démarrage. |
| [guide-05-passage-en-reel-wsl.md](./guide-05-passage-en-reel-wsl.md) | Passage du mode simulé au vrai Snort dans WSL. |
| [guide-06-packaging-appliance.md](./guide-06-packaging-appliance.md) | Mode appliance, installeur, installation sur PC vierge. |

---

## Pile technique

- **Détection** : Snort 3, règles Talos / Emerging Threats compatibles.
- **Backend** : Python, FastAPI, uvicorn, JWT.
- **ML** : scikit-learn (Isolation Forest).
- **Frontend** : React, Vite, Recharts.
- **Packaging** : Docker (multi-stage) + supervisor, ou services systemd.

Arborescence :

```
ids-hybride/
├── backend/           API FastAPI (contrôleurs mock/linux, ML, auth)
├── frontend/          UI React (buildée puis servie par le backend)
├── config/            snort.lua + local.rules (éditables par le dashboard)
├── scripts/           installation Snort et services (WSL/Linux)
├── docker/            Dockerfile, supervisor, entrypoint
├── docker-compose.yml
├── install.sh         installeur tout-en-un
└── *.md               recherche et guides
```

---

## Avertissement

Projet à visée pédagogique et de laboratoire. Avant tout usage exposé sur un réseau :
changer les identifiants et `SNORT_SECRET_KEY`, restreindre `HOME_NET`, mettre le dashboard derrière HTTPS et une authentification renforcée, et n'utiliser la capture que sur un réseau dont vous avez la responsabilité.
