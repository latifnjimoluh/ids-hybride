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

### Option 1 : Docker (le plus simple)

Prérequis : Docker.

```bash
git clone https://github.com/latifnjimoluh/ids-hybride.git
cd ids-hybride
docker compose up -d --build
```

L'interface est sur **http://localhost:8000** (identifiants par défaut : `admin` / `admin`).
Le premier build compile Snort depuis les sources (une dizaine de minutes) ; les suivants sont mis en cache.

> **Capture réseau selon l'environnement.**
> - Sur **Docker Desktop** (Windows / macOS), le conteneur tourne dans une VM : la capture *live* ne voit pas le trafic de l'hôte. Tout le reste fonctionne (interface, règles, **analyse PCAP**, ML, système, console) ; utilisez la page **Analyse PCAP** pour inspecter de vraies captures.
> - Sur **Linux natif**, décommentez `network_mode: host` dans `docker-compose.yml` : Snort capture alors le vrai trafic de la machine.
> - Pour de la capture live continue sur Windows, préférez l'installeur natif dans WSL (`install.sh`), où Snort capture l'interface `eth0` de WSL.

### Option 2 : Installeur natif (WSL / Linux)

Pour installer directement sur une machine (ou dans WSL sous Windows).

```bash
git clone https://github.com/latifnjimoluh/ids-hybride.git
cd ids-hybride
bash install.sh
```

Le script installe Snort 3, build le frontend, déploie le backend et crée les services systemd `snort3` + `ids-dashboard` (démarrage automatique au boot). Interface sur **http://localhost:8000**.

Sous Windows, il faut d'abord WSL2 : `wsl --install` (PowerShell admin), puis lancer les commandes ci-dessus dans Ubuntu. Détails et dépannage dans [guide-06-packaging-appliance.md](./guide-06-packaging-appliance.md).

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
| `SNORT_SERVICE_MANAGER` | `systemd` | `systemd` (WSL/VM) ou `supervisor` (conteneur). |
| `SNORT_CONFIG_PATH` | `/usr/local/etc/snort/snort.lua` | Fichier de config Snort. |
| `SNORT_RULES_PATH` | `.../local.rules` | Fichier de règles. |
| `SNORT_ALERT_JSON_PATH` | `/var/log/snort/alert_json.txt` | Sortie JSON lue par le dashboard. |
| `SNORT_INTERFACE` | `eth0` | Interface de capture. |
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
