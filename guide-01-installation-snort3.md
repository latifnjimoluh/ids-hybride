# Guide 01 : Installation & configuration de Snort 3 sur Ubuntu

> Projet **ids-hybride** · Guide pratique · 24 septembre 2026
> Cible : Ubuntu 22.04 / 24.04 LTS. Snort 3 n'est pas dans les dépôts par défaut → **compilation depuis les sources**.

---

## Table des matières
1. [Prérequis & schéma d'installation](#1-prérequis--schéma-dinstallation)
2. [Étape 1 : Dépendances](#2-étape-1--dépendances)
3. [Étape 2 : libDAQ](#3-étape-2--libdaq)
4. [Étape 3 : gperftools (tcmalloc)](#4-étape-3--gperftools-tcmalloc-optionnel-mais-recommandé)
5. [Étape 4 : Compilation de Snort 3](#5-étape-4--compilation-de-snort-3)
6. [Étape 5 : Vérification](#6-étape-5--vérification)
7. [Étape 6 : Configuration réseau (NIC)](#7-étape-6--configuration-de-la-carte-réseau)
8. [Étape 7 : snort.lua & HOME_NET](#8-étape-7--configuration-snortlua--home_net)
9. [Étape 8 : Test de la configuration](#9-étape-8--test-de-la-configuration)
10. [Étape 9 : Exécution en mode IDS](#10-étape-9--exécution-en-mode-ids)
11. [Étape 10 : Service systemd](#11-étape-10--exécution-en-service-systemd)
12. [Tuning & profils de performance](#12-tuning--profils-de-performance)
13. [Récapitulatif des chemins](#13-récapitulatif-des-chemins)
14. [Sources](#14-sources)

---

## 1. Prérequis & schéma d'installation

```
┌──────────────┐   ┌──────────┐   ┌──────────────┐   ┌───────────┐
│ Dépendances  │──▶│  libDAQ  │──▶│ gperftools   │──▶│  Snort 3  │
│ (apt)        │   │ (source) │   │ (tcmalloc)   │   │ (source)  │
└──────────────┘   └──────────┘   └──────────────┘   └───────────┘
```

On travaille dans un dossier de build dédié :
```bash
mkdir -p ~/snort_src && cd ~/snort_src
```

> ⚠️ **Ordre important** : libDAQ **doit** être compilé et installé **avant** Snort 3, sinon `./configure_cmake.sh` échouera.

---

## 2. Étape 1 : Dépendances

```bash
sudo apt update
sudo apt install -y \
  build-essential libpcap-dev libpcre3-dev libnet1-dev zlib1g-dev \
  luajit hwloc libdnet-dev libdumbnet-dev bison flex liblzma-dev \
  openssl libssl-dev pkg-config libhwloc-dev cmake cpputest \
  libsqlite3-dev uuid-dev libcmocka-dev libnetfilter-queue-dev \
  libmnl-dev autotools-dev libluajit-5.1-dev libunwind-dev libfl-dev
```

**À quoi servent les principales dépendances :**

| Paquet | Rôle |
|--------|------|
| `libpcap-dev` | Capture de paquets (DAQ pcap) |
| `libpcre3-dev` | Expressions régulières PCRE dans les règles |
| `luajit` / `libluajit-5.1-dev` | Config Lua + détecteurs OpenAppID |
| `libhwloc-dev` | Affinité CPU / topologie matérielle (multi-thread) |
| `libnetfilter-queue-dev`, `libmnl-dev` | DAQ **nfq** (mode IPS via iptables) |
| `flex`, `bison` | Générateurs d'analyseurs (parsing) |
| `cmake` | Système de build de Snort 3 |
| `libunwind-dev` | Traces de pile / débogage |

---

## 3. Étape 2 : libDAQ

La **Data Acquisition Library** est la couche d'abstraction d'acquisition de paquets. Elle n'est pas packagée → compilation :

```bash
cd ~/snort_src
git clone https://github.com/snort3/libdaq.git
cd libdaq
./bootstrap
./configure
make
sudo make install
```

Puis **rafraîchir le cache du linker dynamique** (indispensable) :
```bash
sudo ldconfig
```

---

## 4. Étape 3 : gperftools (tcmalloc) *(optionnel mais recommandé)*

`tcmalloc` (allocateur mémoire de Google) améliore nettement les performances de Snort en multi-thread.

```bash
cd ~/snort_src
wget https://github.com/gperftools/gperftools/releases/download/gperftools-2.15/gperftools-2.15.tar.gz
tar xzf gperftools-2.15.tar.gz
cd gperftools-2.15
./configure
make
sudo make install
sudo ldconfig
```

> Si vous sautez cette étape, retirez `--enable-tcmalloc` de la commande de configuration Snort à l'étape suivante.

---

## 5. Étape 4 : Compilation de Snort 3

```bash
cd ~/snort_src
git clone https://github.com/snort3/snort3.git
cd snort3

# Configuration du build (préfixe d'installation + tcmalloc)
./configure_cmake.sh --prefix=/usr/local --enable-tcmalloc

cd build
# -j$(nproc) => compile avec tous les cœurs disponibles
make -j$(nproc)
sudo make install
sudo ldconfig
```

> La compilation peut prendre plusieurs minutes selon la machine.
> Alternative : télécharger une archive `.zip`/release plutôt que `git clone` si pas de git.

---

## 6. Étape 5 : Vérification

```bash
snort -V
```

Sortie attendue (exemple) :
```
   ,,_     -*> Snort++ <*-
  o"  )~   Version 3.x.x.x
   ''''    By Martin Roesch & The Snort Team
```

Le binaire se trouve dans `/usr/local/bin/snort`. Si `snort -V` ne trouve pas le binaire, vérifier le `PATH` ou refaire `sudo ldconfig`.

---

## 7. Étape 6 : Configuration de la carte réseau

En **mode IDS passif**, l'interface d'écoute doit être en **mode promiscuous** et **sans offloads** (qui casseraient l'analyse de paquets réassemblés par le matériel).

Identifier l'interface :
```bash
ip a
```

Désactiver les offloads (remplacer `eth0` par votre interface) :
```bash
sudo ethtool -K eth0 gro off lro off
```

Rendre persistant via un service systemd (exemple minimal) :
```ini
# /etc/systemd/system/snort3-nic.service
[Unit]
Description=Snort 3 NIC setup
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/sbin/ip link set dev eth0 promisc on
ExecStart=/usr/sbin/ethtool -K eth0 gro off lro off
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl enable --now snort3-nic.service
```

---

## 8. Étape 7 : Configuration snort.lua & HOME_NET

Les fichiers de configuration sont dans `/usr/local/etc/snort/`. Les deux fichiers de base sont :
- **`snort.lua`**, configuration principale (à éditer).
- **`snort_defaults.lua`**, valeurs par défaut (variables, chemins de règles).

Éditer `snort.lua` :
```bash
sudo nano /usr/local/etc/snort/snort.lua
```

**Définir votre réseau à protéger** (`HOME_NET`) et l'externe :
```lua
-- Section network variables
HOME_NET = '192.168.1.0/24'      -- votre réseau interne
EXTERNAL_NET = '!$HOME_NET'      -- tout le reste
```

**Activer le chargement de vos règles locales.** Créer d'abord le fichier :
```bash
sudo mkdir -p /usr/local/etc/snort/rules
sudo touch /usr/local/etc/snort/rules/local.rules
```

Puis, dans `snort.lua`, section `ips` :
```lua
ips =
{
    -- mode de détection
    mode = tap,           -- 'tap' = IDS (passif) ; retirer pour inline/IPS
    variables = default_variables,

    -- charger les règles locales + (optionnel) le ruleset téléchargé
    rules = [[
        include /usr/local/etc/snort/rules/local.rules
        -- include /usr/local/etc/snort/rules/snort3-community.rules
    ]],
}
```

**Activer la sortie JSON** (essentiel pour l'intégration SIEM, détaillée dans le Guide 03). Ajouter/décommenter :
```lua
alert_json =
{
    file = true,
    limit = 100,          -- Mo avant rotation
    fields = 'timestamp action class msg priority proto \
              src_addr src_port dst_addr dst_port \
              service rule sid gid rev dir',
}
```

---

## 9. Étape 8 : Test de la configuration

**Valider la syntaxe** de `snort.lua` sans écouter de trafic :
```bash
snort -c /usr/local/etc/snort/snort.lua
```
Un message `Snort successfully validated the configuration` confirme que tout charge correctement.

**Tester sur un fichier PCAP** (recommandé avant le live) :
```bash
snort -c /usr/local/etc/snort/snort.lua -r capture.pcap -A alert_fast
```
- `-r` : lire depuis un fichier `.pcap`
- `-A alert_fast` : mode d'alerte concis en console

---

## 10. Étape 9 : Exécution en mode IDS

Écoute en direct sur l'interface :
```bash
sudo snort -c /usr/local/etc/snort/snort.lua \
     -i eth0 \
     -l /var/log/snort \
     -A alert_fast \
     -s 65535 \
     -k none
```

| Option | Signification |
|--------|---------------|
| `-i eth0` | Interface d'écoute |
| `-l /var/log/snort` | Répertoire des logs (à créer : `sudo mkdir -p /var/log/snort`) |
| `-A alert_fast` | Format d'alerte console (aussi : `alert_json`, `alert_full`, `alert_csv`) |
| `-s 65535` | Taille max de snap (capture le paquet complet) |
| `-k none` | Ignore les erreurs de checksum (utile avec offloads) |
| `-D` | Mode démon (arrière-plan) |
| `-q` | Mode silencieux (quiet) |

Générer du trafic de test simple (depuis une autre machine/onglet) : un `ping` ou un `curl` vers une règle que vous avez écrite (voir Guide 02).

---

## 11. Étape 10 : Exécution en service systemd

Créer un utilisateur dédié non privilégié :
```bash
sudo useradd -r -s /usr/sbin/nologin -M snort || true
sudo mkdir -p /var/log/snort
sudo chown -R snort:snort /var/log/snort
```

Service :
```ini
# /etc/systemd/system/snort3.service
[Unit]
Description=Snort 3 NIDS Daemon
After=network-online.target snort3-nic.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/snort -c /usr/local/etc/snort/snort.lua \
          -i eth0 -l /var/log/snort -A alert_json -s 65535 -k none \
          -u snort -g snort --daq afpacket
Restart=on-failure

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now snort3.service
sudo systemctl status snort3.service
journalctl -u snort3 -f          # suivre les logs du service
```

---

## 12. Tuning & profils de performance

**Profils prêts à l'emploi (`--tweaks`)**, Snort 3 fournit 4 fichiers de politique :

| Profil | Objectif |
|--------|----------|
| `max_detect` | **Sécurité maximale** (le plus de règles, le plus lourd) |
| `security` | Fort accent sécurité |
| `balanced` | Compromis (recommandé pour débuter) |
| `connectivity` | **Performance/uptime** avant tout (moins de détection) |

Usage :
```bash
snort -c /usr/local/etc/snort/snort.lua --tweaks balanced -r capture.pcap
```

**Multi-threading**, exploiter plusieurs cœurs :
```bash
snort -c /usr/local/etc/snort/snort.lua -i eth0 \
      --max-packet-threads 4          # 4 threads de traitement
```
Ou dans `snort.lua` via l'affinité CPU (`hwloc`).

**Profilage**, mesurer où le temps est passé :
```bash
snort -c /usr/local/etc/snort/snort.lua -r capture.pcap --enable-profiler
```

**Bonnes pratiques de tuning :**
- Restreindre `HOME_NET` au strict nécessaire (moins de faux positifs).
- N'activer que les catégories de règles pertinentes.
- Utiliser `tcmalloc` + Hyperscan si CPU Intel compatible.
- Surveiller les paquets perdus (`packet drops`) dans les stats de fin d'exécution.

---

## 13. Récapitulatif des chemins

| Élément | Chemin par défaut |
|---------|-------------------|
| Binaire | `/usr/local/bin/snort` |
| Config principale | `/usr/local/etc/snort/snort.lua` |
| Défauts | `/usr/local/etc/snort/snort_defaults.lua` |
| Règles locales | `/usr/local/etc/snort/rules/local.rules` |
| Logs | `/var/log/snort/` |
| Sortie JSON | `/var/log/snort/alert_json.txt` |

---

## 14. Sources

- [Snort 3 Docs, Installing Snort](https://docs.snort.org/start/installation)
- [Snort 3 Docs, Configuration](https://docs.snort.org/start/configuration)
- [Snort 3 Docs, Tweaks and Scripts](https://docs.snort.org/start/tweaks_scripts)
- [Kifarunix, Install and Configure Snort 3 on Ubuntu 22.04](https://kifarunix.com/install-and-configure-snort-3-on-ubuntu-22-04/)
- [HowtoForge, Install and Configure Snort 3 on Ubuntu 22.04](https://www.howtoforge.com/install-and-configure-snort-3-on-ubuntu-22-04/)
- [Noah Dietrich, Snort 3.1.x on Ubuntu: Full NIDS & SIEM (PDF)](https://snort-org-site.s3.amazonaws.com/production/document_files/files/000/012/147/original/Snort_3.1.8.0_on_Ubuntu_18_and_20.pdf)
- [Arm Learning, Optimize Snort 3 with multithreading](https://learn.arm.com/learning-paths/servers-and-cloud-computing/snort3-multithreading/usecase/)
