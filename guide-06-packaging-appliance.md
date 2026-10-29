# Guide 06 : Package « appliance » (installation autonome clé en main)

> Projet **ids-hybride**  
> Objet : transformer le projet en une appliance réseau et web autonome, à la manière des distributions prêtes à l'emploi (ex. Suricata avec EveBox ou Scirius). Une fois installé, Snort 3 et le dashboard démarrent automatiquement au démarrage système et l'interface est accessible depuis n'importe quelle machine du réseau local.

---

## Principe

En développement, on lance généralement deux serveurs (backend FastAPI/uvicorn + frontend Vite en rechargement à chaud). En mode **appliance native**, l'architecture est standardisée et unifiée :

- Le **frontend est buildé** (`npm run build` → `frontend/dist/`).
- Le **backend FastAPI sert lui-même cette UI** : une seule application, un seul port (**8000**), qui répond à la fois à l'API (`/api/...`), au WebSocket (`/api/ws/alerts`), et à l'interface SPA React (toutes les autres routes renvoient `frontend/dist/index.html`).
- Le déploiement s'effectue par défaut dans le répertoire système standard `/opt/ids-hybride` (personnalisable).
- Deux **services systemd** sont enregistrés et démarrent automatiquement au boot :
  - `snort3.service` : le moteur de détection réseau (capture sur l'interface active détectée ou configurée, sortie `alert_json`).
  - `ids-dashboard.service` : le backend FastAPI avec son environnement virtuel dédié et l'interface utilisateur.

Résultat : après installation, ouvrir **http://&lt;IP&gt;:8000** ou **http://localhost:8000** suffit. Aucun serveur Node.js ou proxy inverse externe (Nginx) n'est nécessaire en production.

```
Navigateur (LAN) ──▶ http://<IP>:8000 (ou http://localhost:8000)
                              │
                 ┌────────────▼─────────────┐
                 │  ids-dashboard (systemd) │   FastAPI (uvicorn)
                 │  /api/*   -> API JSON    │   Port 8000
                 │  /api/ws  -> WebSocket   │
                 │  /*       -> UI React    │   (servi depuis frontend/dist)
                 └────────────┬─────────────┘
                              │ lit alert_json.txt / pilote systemctl
                 ┌────────────▼─────────────┐
                 │  snort3 (systemd)        │   moteur Snort 3
                 │                          │   capture dynamique (ex: eth0, enp3s0)
                 └──────────────────────────┘
```

---

## Installation en une commande

Depuis la racine du projet ou depuis le dépôt cloné :

```bash
sudo bash install.sh
```

### Options de la ligne de commande

L'installeur supporte plusieurs arguments optionnels pour s'adapter à votre infrastructure :

```bash
sudo bash install.sh [-d /chemin/cible] [-i <interface>] [--rebuild-frontend]
```

- `-d, --dir <PATH>` : Spécifie le répertoire de déploiement de l'appliance (défaut : `/opt/ids-hybride` ou variable `TARGET_DIR` / `IDS_INSTALL_DIR`). Si vous lancez le script depuis un autre dossier (par exemple un clone git temporaire), l'ensemble du projet est copié et synchronisé vers ce répertoire.
- `-i, --interface <IFACE>` : Force l'interface de capture pour Snort 3. Par défaut, le script applique une détection multi-niveaux automatique :
  1. Variable d'environnement `SNORT_INTERFACE` ou argument `-i`.
  2. Résolution de route par le noyau (`ip route get 1.1.1.1`).
  3. Passerelle IPv4 par défaut (`ip -o -4 route show to default`).
  4. Première interface dotée d'une IPv4 globale active (hors conteneurs, loopback et ponts).
  5. Première interface non-loopback à l'état `UP`.
  6. Repli ultime sur `eth0`.
- `--rebuild-frontend` : Force la recompilation de l'interface React même si `frontend/dist/index.html` est déjà présent.
- `-h, --help` : Affiche l'aide des options.

### Étapes automatiques déroulées par l'installeur

1. **Snort 3** : vérification de la présence du binaire `/usr/local/bin/snort`. S'il est absent, compilation et installation automatisées de libDAQ et Snort 3 (via `scripts/install-snort3-wsl.sh`).
2. **Déploiement système** : synchronisation des sources vers `$TARGET_DIR` (par exemple `/opt/ids-hybride`).
3. **Frontend React** : vérification de la présence de `frontend/dist`. Si nécessaire, installation de Node.js/npm et compilation de l'application SPA.
4. **Backend Python** : vérification des paquets `python3-venv` et `python3-pip`, initialisation de l'environnement virtuel dans `$TARGET_DIR/venv`, mise à niveau de pip et installation de toutes les dépendances (`backend/requirements.txt`).
5. **Logs & Permissions** : initialisation du répertoire `$TARGET_DIR/logs` (permissions `755`) et du fichier `$TARGET_DIR/logs/alert_json.txt` (permissions `644`).
6. **Services systemd** : génération et enregistrement de `snort3.service` et `ids-dashboard.service` dans `/etc/systemd/system/`, rechargement du démon (`systemctl daemon-reload`) et activation/démarrage immédiat (`systemctl enable --now`).

### Résultat de fin d'installation

À la fin de l'exécution, une bannière synthétique affiche toutes les coordonnées nécessaires :

```text
======================================================================
 IDS-Hybride : Installation terminée avec succès !
======================================================================
 Interface de capture       : eth0 (ou enp3s0)
 Répertoire d'installation  : /opt/ids-hybride
 Statut des services        : actif (démarré et activé au boot)

 Accès au Dashboard Web :
   - URL Réseau : http://192.168.1.50:8000
   - URL Locale : http://localhost:8000

 Identifiants par défaut :
   - Utilisateur  : admin
   - Mot de passe : admin

 Commandes de gestion systemd :
   - État Snort 3    : sudo systemctl status snort3
   - État Dashboard  : sudo systemctl status ids-dashboard
   - Suivi logs live : journalctl -u ids-dashboard -f
======================================================================
```

---

## Gestion et exploitation des services systemd

Les deux services sont complètement intégrés à `systemd` :

### Vérifier l'état des services

```bash
sudo systemctl status snort3 ids-dashboard --no-pager
```

### Démarrer, arrêter, redémarrer

```bash
# Démarrage
sudo systemctl start snort3 ids-dashboard

# Arrêt
sudo systemctl stop snort3 ids-dashboard

# Redémarrage (ex. après mise à jour de la configuration ou des règles)
sudo systemctl restart snort3
sudo systemctl restart ids-dashboard
```

### Consultation des logs en direct

Les logs de Snort 3 et du backend FastAPI sont directement capturés par `journald` :

```bash
# Suivi en temps réel du backend et de l'interface
journalctl -u ids-dashboard -f

# Suivi en temps réel de Snort 3
journalctl -u snort3 -f

# Suivi combiné des deux services
journalctl -u snort3 -u ids-dashboard -f
```

De plus, le dashboard web permet de piloter le service `snort3` (démarrage, arrêt, redémarrage, rechargement) directement depuis la page **Service** de l'interface graphique.

---

## Configuration et personnalisation

### Chemins et règles Snort (`config/snort.lua`)

La configuration `config/snort.lua` résout dynamiquement les règles locales :
- Emplacement standard : `/opt/ids-hybride/config/local.rules`.
- Surchargeable sans modifier le fichier via la variable d'environnement `SNORT_RULES_PATH`.

Pour tester manuellement la validité de la syntaxe de configuration de Snort 3 :
```bash
snort -T -c /opt/ids-hybride/config/snort.lua
```

### Variables d'environnement du Dashboard

Les services systemd injectent les variables nécessaires au backend :

| Variable | Valeur par défaut dans le service | Rôle |
|---|---|---|
| `SNORT_BACKEND` | `linux` | Mode de fonctionnement réel |
| `SNORT_CONFIG_PATH` | `/opt/ids-hybride/config/snort.lua` | Chemin absolu du fichier de configuration Snort |
| `SNORT_RULES_PATH` | `/opt/ids-hybride/config/local.rules` | Chemin des règles locales éditables par l'UI |
| `SNORT_ALERT_JSON_PATH` | `/opt/ids-hybride/logs/alert_json.txt` | Fichier JSON d'alertes en temps réel |
| `SNORT_SERVICE_NAME` | `snort3` | Nom du service systemd piloté par l'API |
| `SNORT_INTERFACE` | Détectée automatiquement | Interface réseau de capture |

---

## Mettre à jour l'application ou l'interface

Si vous modifiez le code source de l'interface React ou du backend dans `/opt/ids-hybride` :

```bash
# Rebuild de l'UI React
cd /opt/ids-hybride/frontend
npm run build

# Redémarrage du service pour servir le nouveau build
sudo systemctl restart ids-dashboard
```

---

## Procédure d'installation sur une machine vierge

### Cas A : Sur PC Windows vierge (via WSL 2)

```powershell
# 1. Dans PowerShell (en Administrateur) :
wsl --install
# Redémarrer la machine si demandé par Windows.
```

```bash
# 2. Dans le terminal Ubuntu (WSL 2) :
sudo apt update && sudo apt install -y git python3 python3-venv
git clone https://github.com/latifnjimoluh/ids-hybride.git
cd ids-hybride
sudo bash install.sh
```

### Cas B : Sur serveur / machine physique Linux vierge (Ubuntu / Debian)

```bash
sudo apt update && sudo apt install -y git python3 python3-venv
git clone https://github.com/latifnjimoluh/ids-hybride.git
cd ids-hybride
sudo bash install.sh
```

---

## Dépannage et résolution d'incidents

### 1. L'interface réseau a changé ou Snort ne capture rien
Si la machine change d'interface réseau (par exemple passage d'Ethernet à Wi-Fi, ou migration de carte réseau) :
1. Identifiez votre interface active : `ip route show default` ou `ip link`.
2. Mettez à jour `/etc/systemd/system/snort3.service` et `/etc/systemd/system/ids-dashboard.service` avec `-i <nouvelle_interface>` ou relancez :
   ```bash
   sudo bash /opt/ids-hybride/scripts/setup-service-wsl.sh -i <nouvelle_interface>
   sudo bash /opt/ids-hybride/scripts/setup-dashboard-service-wsl.sh -i <nouvelle_interface>
   sudo systemctl restart snort3 ids-dashboard
   ```

### 2. Permissions sur le fichier de logs
Si le dashboard affiche une erreur de lecture d'alertes :
```bash
sudo chmod 755 /opt/ids-hybride/logs
sudo chmod 644 /opt/ids-hybride/logs/alert_json.txt
```

### 3. Snort échoue à démarrer (`systemctl status snort3`)
Inspectez les logs détaillés de Snort :
```bash
journalctl -u snort3 -n 50 --no-pager
```
Vérifiez la configuration via le mode test de Snort :
```bash
snort -T -c /opt/ids-hybride/config/snort.lua
```
