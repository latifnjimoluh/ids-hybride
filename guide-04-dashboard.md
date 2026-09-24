# Guide 04 : Dashboard web de pilotage de Snort

> Projet **ids-hybride** · 24 septembre 2026
> Interface graphique (FastAPI + React) pour gérer les règles, visualiser les alertes, contrôler le service et éditer la configuration de Snort.

---

## 1. Aperçu

Le dashboard permet de **réaliser depuis l'interface tout ce que permet le CLI de Snort**. Accès protégé par **authentification JWT** (login).

| Page | Fonctions | Équivalent CLI |
|------|-----------|----------------|
| **Tableau de bord** | État service, nb d'alertes, règles actives, critiques, graphiques, top signatures. | — |
| **Règles** | Lister / créer (assisté ou brut) / éditer / (dés)activer / supprimer / valider ; **catégories** (classtype) ; **import de rulesets** (Community, ET Open). | `local.rules`, `snort -T`, PulledPork |
| **Alertes** | Flux **temps réel (WebSocket)** + filtres priorité / IP / message. | `alert_json` |
| **Analyse PCAP** | **Upload** d'une capture + exécution Snort + alertes + stats + sortie brute. | `snort -r fichier.pcap -c snort.lua -A alert_json` |
| **Service** | Start / stop / restart ; **options d'exécution** : mode (IDS/IPS/sniffer), interface, DAQ, mode d'alerte, profil tweaks ; métriques. | `snort -i … --daq … -A … --tweaks …` |
| **Configuration** | Variables réseau + profil (assisté) **et éditeur brut de `snort.lua`**. | édition de `snort.lua` |
| **Système** | Version, plugins (inspectors/codecs/loggers…), modules DAQ, interfaces réseau. | `snort -V`, `--list-plugins`, `--daq-list`, `--list-interfaces` |
| **Logs** | Journal du moteur en direct (suivi auto). | `journalctl -u snort3`, fichiers log |
| **Console** | Exécuter des commandes d'introspection Snort (whitelist lecture seule). | `snort --list-*`, `--help-module`, `-V` |

---

## 2. Architecture

```
┌────────────────────────┐        HTTP/JSON        ┌──────────────────────────┐
│   Frontend React        │  ───────────────────▶  │   Backend FastAPI         │
│   (Vite, port 5173)     │   /api/* (proxy Vite)  │   (uvicorn, port 8000)    │
│   - pages Dashboard/... │  ◀───────────────────  │   - routers rules/alerts/ │
└────────────────────────┘                         │     service/config        │
                                                    │   ┌────────────────────┐  │
                                                    │   │ SnortController     │  │
                                                    │   │  (interface)        │  │
                                                    │   ├─────────┬──────────┤  │
                                                    │   │  Mock   │  Linux   │  │
                                                    │   └─────────┴──────────┘  │
                                                    └──────────────────────────┘
                                                         mock          │ linux
                                                    (fichiers JSON)     ▼
                                                              vraie instance Snort 3
                                                         (local.rules, systemctl,
                                                          alert_json.txt, snort.lua)
```

**Idée clé, la couche `SnortController`** : une interface abstraite avec **deux implémentations interchangeables**. Le frontend ne change jamais ; on bascule via une variable d'environnement.

- **`mock`** (défaut) : simule tout (règles persistées en JSON, alertes générées, service simulé). Parfait pour développer sous **Windows** sans Snort.
- **`linux`** : pilote une **vraie instance Snort 3** (édite `local.rules`, lance `snort -T`, lit `alert_json.txt`, contrôle le service via `systemctl`).

---

## 3. Arborescence

```
ids-hybride/
├── backend/
│   ├── .venv/                     # environnement Python
│   ├── requirements.txt
│   ├── .env.example               # config (copier en .env)
│   └── app/
│       ├── main.py                # app FastAPI + CORS + routers
│       ├── config.py              # settings (SNORT_BACKEND=mock|linux)
│       ├── models.py              # schémas Pydantic
│       ├── rule_parser.py         # parsing/rendu des règles Snort
│       ├── controllers/
│       │   ├── base.py            # interface SnortController
│       │   ├── mock.py            # implémentation simulée
│       │   ├── linux.py           # implémentation Snort réelle
│       │   └── __init__.py        # fabrique (choix mock/linux)
│       ├── routers/               # rules, alerts, service, config
│       └── data/                  # état/règles/alertes du mode mock
├── frontend/
│   ├── package.json
│   ├── vite.config.js             # proxy /api → :8000
│   └── src/
│       ├── App.jsx                # layout + navigation
│       ├── api.js                 # client API
│       ├── index.css              # thème sombre "SOC"
│       └── pages/                 # Dashboard, Rules, Alerts, Service, Config
└── start-dev.ps1                  # lance backend + frontend
```

---

## 4. Démarrage rapide (Windows, mode mock)

**Option A, script tout-en-un :**
```powershell
cd D:\Formation\Project\ids-hybride
.\start-dev.ps1
```

**Option B, manuel (2 terminaux) :**
```powershell
# Terminal 1, backend
cd D:\Formation\Project\ids-hybride\backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

# Terminal 2, frontend
cd D:\Formation\Project\ids-hybride\frontend
npm run dev
```

Puis ouvrir :
- **Dashboard** : http://localhost:5173
- **API + doc interactive (Swagger)** : http://127.0.0.1:8000/docs

---

## 5. Passer en mode réel (sonde Linux)

Sur la machine Linux où tourne Snort 3 (cf. Guide 01) :

1. Copier `backend/` sur la sonde, créer le venv, `pip install -r requirements.txt`.
2. Créer un fichier `.env` :
   ```env
   SNORT_BACKEND=linux
   SNORT_CONFIG_PATH=/usr/local/etc/snort/snort.lua
   SNORT_RULES_PATH=/usr/local/etc/snort/rules/local.rules
   SNORT_ALERT_JSON_PATH=/var/log/snort/alert_json.txt
   SNORT_SERVICE_NAME=snort3
   SNORT_INTERFACE=eth0
   ```
3. Lancer uvicorn. Le backend contrôle alors le vrai Snort.

> ⚠️ Le contrôle du service (`systemctl`) et l'écriture dans `/usr/local/etc/snort/` nécessitent des **droits adaptés** (sudoers ciblé ou exécution sous un compte autorisé). À sécuriser avant toute mise en production (authentification du dashboard, HTTPS, permissions minimales).

---

## 6. API REST (résumé)

| Méthode | Endpoint | Rôle |
|---------|----------|------|
| POST | `/api/auth/login` | Connexion → token JWT |
| GET | `/api/auth/me` | Utilisateur courant |
| POST | `/api/auth/change-password` | Changer le mot de passe |
| GET | `/api/health` | Ping + backend actif (public) |
| GET · POST | `/api/rules` | Lister / créer |
| PUT · PATCH · DELETE | `/api/rules/{sid}` | Modifier / toggle / supprimer |
| GET | `/api/rules/categories` | Catégories (classtype) |
| POST | `/api/rules/import` | Importer un ruleset |
| POST | `/api/rules/validate` | Valider la config |
| GET | `/api/alerts` · `/api/alerts/stats` | Alertes + statistiques |
| WS | `/api/ws/alerts?token=` | Flux d'alertes temps réel |
| GET · POST | `/api/service/status` · `/action` · `/run-options` | Contrôle + options |
| GET · PUT | `/api/config` · `/api/config/raw` | Config assistée / brute |
| GET | `/api/system/info` · `/interfaces` · `/daqs` · `/plugins` | Introspection |
| GET · POST | `/api/pcap` · `/api/pcap/analyze` · `/api/pcap/{id}` | Analyse PCAP |
| GET | `/api/logs?lines=N` | Logs |
| GET · POST | `/api/console/commands` · `/api/console/run` | Console Snort |

> Tous les endpoints (sauf `/api/health` et `/api/auth/login`) exigent un **token JWT** (`Authorization: Bearer …`). Le WebSocket s'authentifie via `?token=`.

---

## 7. Prochaines évolutions possibles

- 🔐 **Authentification** (login + JWT) avant exposition réseau.
- 🔄 **WebSocket** pour un flux d'alertes temps réel (au lieu du polling 5 s).
- 🧠 **Onglet ML** : afficher les scores d'anomalie du module hybride à côté des alertes signatures.
- 📥 Import/export de rulesets (Talos, Emerging Threats) + intégration PulledPork.
- 📊 Lien direct vers Wazuh/Kibana pour la corrélation (cf. Guide 03).
