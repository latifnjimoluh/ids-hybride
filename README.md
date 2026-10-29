# 🛡️ IDS-Hybride — NIDS & Dashboard Web Tout-en-Un

[![Backend CI](https://github.com/latifnjimoluh/ids-hybride/actions/workflows/test.yml/badge.svg)](https://github.com/latifnjimoluh/ids-hybride/actions/workflows/test.yml)
[![Publish Docker Image](https://github.com/latifnjimoluh/ids-hybride/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/latifnjimoluh/ids-hybride/actions/workflows/docker-publish.yml)
[![Python Version](https://img.shields.io/badge/python-3.12%20%7C%203.13%20%7C%203.14-blue.svg)](https://www.python.org/)
[![Snort 3](https://img.shields.io/badge/engine-Snort%203-red.svg)](https://www.snort.org/)
[![Docker Image](https://img.shields.io/badge/docker-ghcr.io-blue?logo=docker)](https://github.com/latifnjimoluh/ids-hybride/pkgs/container/ids-hybride)

Un système de détection d'intrusion réseau (**NIDS**) hybride livré sous forme d'**appliance web autonome** : la puissance de détection par **signatures de Snort 3** est complétée par un moteur de détection d'**anomalies par Machine Learning** (Isolation Forest), le tout administrable en temps réel depuis une interface web unifiée.

Inspiré de l'expérience clé en main des appliances Suricata (comme SELKS avec EveBox/Scirius), **IDS-Hybride** démarre automatiquement et sert directement son interface sur une URL unique (**`http://<IP>:8000`**), sans nécessiter de configuration complexe.

---

## 📑 Sommaire

- [Aperçu de la Solution](#-aperçu-de-la-solution)
- [Architecture & Fonctionnement](#-architecture--fonctionnement)
- [Guides d'Installation Pas-à-Pas](#-guides-dinstallation-pas-à-pas)
  - [Méthode 1 : Déploiement Express Docker (Recommandé - 10 secondes)](#méthode-1--déploiement-express-docker-recommandé---10-secondes)
  - [Méthode 2 : Appliance Système Linux / Bare-metal / WSL 2 (`install.sh`)](#méthode-2--appliance-système-linux--bare-metal--wsl-2-installsh)
  - [Méthode 3 : Mode Développement Local (Windows / Linux sans Snort)](#méthode-3--mode-développement-local)
- [Guide de Prise en Main & Tests de Détection](#-guide-de-prise-en-main--tests-de-détection)
- [Visite Guidée du Dashboard Web](#-visite-guidée-du-dashboard-web)
- [Variables de Configuration](#-variables-de-configuration)
- [Tests Automatisés & Validation QA](#-tests-automatisés--validation-qa)
- [Guides & Documentation Détaillée](#-guides--documentation-détaillée)
- [Sécurité & Production](#-sécurité--production)

---

## 🌟 Aperçu de la Solution

| Détection Déterministe (Signatures) | Détection Comportementale (ML) | Pilotage Web & Appliance |
| :--- | :--- | :--- |
| **Moteur Snort 3** : capture multi-thread haute performance. | **Isolation Forest** (scikit-learn) entraîné sur les flux réseau. | **Interface React intégrée** directement servie par le backend FastAPI. |
| **Règles Talos & Emerging Threats** : blocage des exploits connus, scans et malwares. | **Détection de l'inconnu** : signale les déviations statistiques sans signature préalable. | **Temps réel (WebSocket)** avec notifications push du navigateur. |
| **Gestion dynamique** : ajout, modification, activation/désactivation et validation en 1 clic. | **Histogramme interactif** des scores d'anomalies et filtrage d'événements atypiques. | **Analyse PCAP forensique** par simple glisser-déposer de captures réseau. |

---

## 🏗️ Architecture & Fonctionnement

```
   Trafic Réseau (eth0 / enp3s0 / PCAP)
                  │
                  ▼
         ┌──────────────────┐
         │     Snort 3      │  (Capture live, décodage, réassemblage stream,
         │  (NIDS Moteur)   │   évaluation des règles, inspection d'état)
         └────────┬─────────┘
                  │ alert_json.txt (JSON Lines)
                  ▼
         ┌──────────────────────────────────────────────────────────────┐
         │                    Backend FastAPI                           │
         │  • Contrôleur Linux : lecture inversée par bloc (file.seek)  │
         │  • API REST sécurisée par JWT (/api/*)                       │
         │  • Flux temps réel WebSocket (/api/ws/alerts)                │
         │  • Module ML (/api/ml : StandardScaler + IsolationForest)     │
         │  • Serveur Web SPA : héberge et sert l'UI React compilée     │
         └──────────────────────────────┬───────────────────────────────┘
                                        │ Port unique : http://<IP>:8000
                                        ▼
                 Navigateur Web de l'Administrateur (SOC / Dashboard)
```

Le backend s'adapte automatiquement à son environnement via `SNORT_BACKEND` :
* **`linux`** : Pilote une vraie sonde Snort 3 (services `systemd` sur Linux/WSL, ou `supervisor` en conteneur Docker).
* **`mock`** : Simule Snort 3 de façon réaliste (idéal pour tester ou développer sous Windows sans machine Linux).

---

## 🚀 Guides d'Installation Pas-à-Pas

### Méthode 1 : Déploiement Express Docker (Recommandé - 10 secondes)

Cette méthode utilise l'image officielle pré-compilée hébergée sur **GitHub Container Registry (GHCR)**. Elle intègre Snort 3, libDAQ, Python, FastAPI, scikit-learn et l'interface React déjà assemblée.

#### Prérequis :
* Docker installé ([Installer Docker Engine ou Desktop](https://docs.docker.com/get-docker/)).

#### Option A — Commande `docker run` en 1 ligne :
```bash
docker run -d \
  --name ids-hybride \
  --restart unless-stopped \
  -p 8000:8000 \
  --cap-add NET_ADMIN \
  --cap-add NET_RAW \
  ghcr.io/latifnjimoluh/ids-hybride:latest
```

#### Option B — Déploiement via Docker Compose :
```bash
git clone https://github.com/latifnjimoluh/ids-hybride.git
cd ids-hybride
docker compose up -d
```

#### 🌐 Accès immédiat :
* Ouvrez votre navigateur sur **http://localhost:8000**
* Identifiants par défaut :
  * **Utilisateur :** `admin`
  * **Mot de passe :** `admin`

> [!NOTE]
> **Capture réseau en conteneur :**
> - **Sur Linux natif** : Décommentez `network_mode: host` dans `docker-compose.yml` pour que Snort écoute directement la carte réseau de la machine hôte.
> - **Sur Docker Desktop (Windows / macOS)** : Le conteneur s'exécute dans une VM isolée. Pour tester des détections réelles sous Windows, utilisez la page **Analyse PCAP** pour soumettre vos fichiers de capture, ou utilisez la Méthode 2 via WSL 2.

---

### Méthode 2 : Appliance Système Linux / Bare-metal / WSL 2 (`install.sh`)

Cette méthode configure une **appliance autonome native** sous `/opt/ids-hybride` sur n'importe quelle distribution **Ubuntu 22.04 / 24.04, Debian 12 ou WSL 2**. Les services démarrent automatiquement au boot de la machine.

#### Prérequis :
* Une machine Linux (Ubuntu, Debian, VM Proxmox/VMware) ou Windows avec **WSL 2** (`wsl --install`).
* Droits administrateur (`sudo`).

#### Déroulement de l'installation :

1. **Cloner le projet :**
   ```bash
   git clone https://github.com/latifnjimoluh/ids-hybride.git
   cd ids-hybride
   ```

2. **Lancer l'installeur automatique :**
   ```bash
   sudo bash install.sh
   ```

3. **Ce que fait le script automatiquement :**
   - 🔍 **Détection réseau** : Détecte automatiquement l'interface réseau active par défaut (`ip route get 8.8.8.8`).
   - 🛠️ **Installation de Snort 3** : Installe ou compile Snort 3 et `libdaq` s'ils sont absents.
   - 📂 **Déploiement système** : Synchronise l'application vers `/opt/ids-hybride`.
   - ⚛️ **Compilation Frontend** : Compile l'interface React vers `frontend/dist` (installe Node.js/npm si nécessaire).
   - 🐍 **Environnement Python** : Crée le venv isolé `/opt/ids-hybride/backend/.venv` et installe les dépendances.
   - ⚙️ **Services systemd** : Crée, active et démarre `snort3.service` et `ids-dashboard.service`.
   - 📝 **Permissions et logs** : Initialise `/opt/ids-hybride/logs/alert_json.txt` avec les bons privilèges.
   - 🖥️ **Bannière récapitulative** : Affiche l'adresse IP réseau détectée et le lien de connexion.

#### Options personnalisées de l'installeur :
```bash
sudo bash install.sh [OPTIONS]

Options :
  -d, --dir <CHEMIN>        Dossier de destination (défaut : /opt/ids-hybride)
  -i, --interface <IFACE>   Forcer une carte réseau (ex: ens33, eth0, enp3s0)
  --rebuild-frontend        Forcer une recompilation complète de l'UI React
  -h, --help                Afficher l'aide
```

#### Commandes utiles de gestion :
```bash
# Vérifier l'état des services
sudo systemctl status snort3 ids-dashboard

# Redémarrer l'interface ou le moteur Snort
sudo systemctl restart ids-dashboard
sudo systemctl restart snort3

# Consulter les journaux en direct
journalctl -u snort3 -f
journalctl -u ids-dashboard -f
```

---

### Méthode 3 : Mode Développement Local

Pour travailler sur le code, modifier les composants React ou l'API FastAPI sous Windows (sans Snort installé) :

```bash
# Script tout-en-un sous Windows PowerShell :
.\start-dev.ps1
```

Ou manuellement dans deux terminaux :
```bash
# Terminal 1 — Backend (mode mock automatique sous Windows)
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Terminal 2 — Frontend avec rechargement à chaud (Hot Reload)
cd frontend
npm install
npm run dev
```

* Dashboard de dev : **http://localhost:5173**
* Documentation Swagger de l'API : **http://localhost:8000/docs**

---

## 🧪 Guide de Prise en Main & Tests de Détection

Dès que votre appliance tourne sur **`http://<IP>:8000`**, testez le moteur de détection depuis une autre machine du réseau (ou un second terminal) :

### 1. Test ICMP (Ping)
```bash
ping <IP_DE_L_APPLIANCE> -c 4
```
👉 Ouvrez la page **Alertes** : vous verrez immédiatement apparaître l'alerte `ICMP Ping detecte` (SID `1000001`).

### 2. Test Attaque Web Shell
```bash
curl -i "http://<IP_DE_L_APPLIANCE>/?cmd=id"
```
👉 L'alerte critique `[Community] Shell web générique (cmd=)` se déclenche en temps réel.

### 3. Test Scanner Nikto
```bash
curl -A "Nikto/2.1.6" "http://<IP_DE_L_APPLIANCE>/"
```
👉 L'alerte `[ET] Scanner Nikto détecté` s'affiche instantanément.

### 4. Test Détection d'Anomalies (Machine Learning)
1. Rendez-vous sur la page **ML / Anomalies**.
2. Cliquez sur le bouton **Entraîner le modèle**.
3. Le modèle *Isolation Forest* apprend la distribution normale de votre trafic et calcule le score d'anomalie de chaque événement pour révéler les comportements suspects.

---

## 🖥️ Visite Guidée du Dashboard Web

| Écran | Fonctionnalités Clés |
| :--- | :--- |
| **Tableau de bord** | Vue d'ensemble opérationnelle : statut du moteur Snort 3, total des alertes, répartition des priorités P1/P2/P3, chronologie des 2 dernières heures, top signatures. |
| **Gestion des Règles** | Éditeur complet pour `local.rules` : création assistée ou brute, activation/désactivation par bascule (toggle), validation syntaxique `snort -T`, import de packs *Community* et *Emerging Threats*. |
| **Flux d'Alertes** | Surveillance en direct par WebSocket, filtrage multi-critères (recherche par IP source/destination, signature), pagination fluide et notifications push bureau. |
| **ML / Anomalies** | Entraînement de l'algorithme *Isolation Forest*, histogramme de distribution des anomalies, identification des événements statistiquement atypiques. |
| **Analyse PCAP** | Zone de glisser-déposer de captures `.pcap` / `.pcapng` pour analyse forensique immédiate par Snort (`snort -r capture.pcap`) avec restitution des alertes. |
| **Contrôle du Service** | Démarrer, arrêter, redémarrer Snort 3, surveillance de l'uptime, sélection du module DAQ (`pcap`, `afpacket`, etc.) et des profils de détection. |
| **Configuration** | Modification assistée des réseaux (`$HOME_NET`, `$EXTERNAL_NET`) et éditeur brut intégré pour [`snort.lua`](./config/snort.lua). |
| **Système** | Introspection matérielle et logicielle : version exacte de Snort, support Hyperscan, liste exhaustive des codecs, loggers et inspecteurs chargés. |
| **Logs & Console** | Consultation du journal d'exécution en continu et terminal interactif pour exécuter les commandes Snort en lecture seule (`snort -V`, `snort --daq-list`). |

---

## ⚙️ Variables de Configuration

Le backend se configure via des variables d'environnement (préfixe `SNORT_`) ou via un fichier `.env` :

| Variable | Valeur par défaut | Description |
| :--- | :--- | :--- |
| `SNORT_BACKEND` | `linux` (ou `mock`) | Moteur actif : `linux` pour piloter une vraie sonde, `mock` pour simuler. |
| `SNORT_SERVICE_MANAGER` | `systemd` | Gestionnaire de processus : `systemd` (Linux natif / WSL) ou `supervisor` (Docker). |
| `SNORT_CONFIG_PATH` | `/opt/ids-hybride/config/snort.lua` | Emplacement du fichier de configuration Snort 3. |
| `SNORT_RULES_PATH` | `/opt/ids-hybride/config/local.rules` | Emplacement du fichier de règles personnalisées. |
| `SNORT_ALERT_JSON_PATH` | `/opt/ids-hybride/logs/alert_json.txt` | Fichier journal JSON généré par Snort et consommé par le dashboard. |
| `SNORT_INTERFACE` | *Auto-détectée* | Interface réseau de capture (détectée dynamiquement, ex: `eth0`, `ens33`). |
| `SNORT_SECRET_KEY` | `dev-secret-change-me` | Clé secrète de signature des tokens JWT (**à modifier en production**). |
| `SNORT_ADMIN_USER` | `admin` | Nom d'utilisateur administrateur par défaut. |
| `SNORT_ADMIN_PASSWORD` | `admin` | Mot de passe administrateur initial. |

---

## 🧪 Tests Automatisés & Validation QA

Le projet intègre une suite complète de tests de non-régression et de résistance aux cas limites :

```bash
# Exécuter les 103 tests unitaires et d'intégration :
pytest backend/tests/ -v

# Exécuter la suite de tests adverses & stress tests :
python run_adversarial_tests.py
```

### Couverture validée :
* **Parser d'horodatage Snort 3** : Prise en charge native du format `"MM/dd-HH:mm:ss.uuuuuu"`, déduction de l'année, gestion du 29 février (bissextile) et préservation de `priority=0`.
* **Lecture inversée haute performance** : Algorithme `file.seek()` par blocs de 64 Ko depuis la fin du fichier, réduisant l'empreinte mémoire d'un facteur 31x sur les fichiers volumineux.
* **Intégrité de l'API & Authentification** : Tests complets de tous les endpoints protégés par JWT.

---

## 📚 Guides & Documentation Détaillée

Pour approfondir chaque aspect du projet, consultez les guides techniques inclus dans le dépôt :

| Document | Objet |
| :--- | :--- |
| 📖 [recherche-ids-opensource.md](./recherche-ids-opensource.md) | Panorama complet des IDS open source (NIDS/HIDS, Suricata, Snort, Zeek, Wazuh, approche hybride et datasets ML). |
| 📖 [recherche-snort.md](./recherche-snort.md) | Étude détaillée de l'architecture Snort 3 et de son écosystème. |
| 🛠️ [guide-01-installation-snort3.md](./guide-01-installation-snort3.md) | Compilation et installation de Snort 3 depuis les sources sur Ubuntu. |
| ✍️ [guide-02-regles-snort3.md](./guide-02-regles-snort3.md) | Guide pratique pour concevoir, tester et valider des règles de détection Snort 3. |
| 🔗 [guide-03-integration-wazuh-elk.md](./guide-03-integration-wazuh-elk.md) | Export des alertes Snort JSON vers Wazuh et une stack Elastic (ELK). |
| 💻 [guide-04-dashboard.md](./guide-04-dashboard.md) | Architecture détaillée du Dashboard web et conception de l'API FastAPI. |
| 🐧 [guide-05-passage-en-reel-wsl.md](./guide-05-passage-en-reel-wsl.md) | Configuration et exécution sous Windows via WSL 2. |
| 📦 [guide-06-packaging-appliance.md](./guide-06-packaging-appliance.md) | Mode appliance autonome, scripts systemd et déploiement sur serveur dédié. |

---

## 🔒 Sécurité & Production

Avant tout déploiement sur un réseau exposé en production :
1. **Changez les identifiants initiaux** : Modifiez le mot de passe du compte `admin` depuis la barre latérale ou via la variable d'environnement `SNORT_ADMIN_PASSWORD`.
2. **Définissez une clé secrète forte** : Renseignez `SNORT_SECRET_KEY` avec une chaîne aléatoire longue.
3. **Restreignez `$HOME_NET`** : Ajustez la variable de réseau local dans la page **Configuration** pour cibler précisément votre sous-réseau (ex: `192.168.1.0/24`) au lieu de `any`.
4. **Activez HTTPS** : Placez l'interface derrière un proxy inverse TLS (Nginx, Caddy, Traefik) avec un certificat Let's Encrypt.
5. **Cadre légal** : Ne capturez et n'analysez le trafic réseau que sur des infrastructures dont vous avez la responsabilité formelle.

---

## 📄 Licence

Ce projet est sous licence MIT — libre d'utilisation, de modification et de distribution.
Contributeur principal : [Latif Njimoluh](https://github.com/latifnjimoluh).
