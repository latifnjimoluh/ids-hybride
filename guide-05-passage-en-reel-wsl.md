# Guide 05 : Passage en mode réel (WSL + vrai Snort 3)

> Projet **ids-hybride**
> Objet : basculer le dashboard du mode `mock` vers le mode `linux`, avec une vraie instance de Snort 3 qui tourne dans WSL Ubuntu.

---

## Contexte

Le backend possède deux implémentations interchangeables (voir `guide-04-dashboard.md`) :
- `mock` : tout est simulé (utilisé jusqu'ici sous Windows).
- `linux` : pilote un vrai Snort 3 via `systemctl`, `journalctl`, lecture de `alert_json.txt`, exécution de `snort` sur des PCAP, etc.

Snort 3 tourne sous Linux. Sur cette machine Windows, on utilise **WSL Ubuntu**.

### État déjà réglé

- Virtualisation matérielle (BIOS) : activée.
- Fonctionnalités Windows (Virtual Machine Platform, Subsystem-Linux) : activées.
- `hypervisorlaunchtype` : passé de `Off` à `Auto` (correctif appliqué).

**Il reste une seule action bloquante : redémarrer le PC** pour que l'hyperviseur démarre et que WSL2 fonctionne.

---

## Étape 0 : Redémarrer le PC

Redémarre Windows. Après le redémarrage, vérifie que WSL fonctionne, dans PowerShell :

```powershell
wsl -d Ubuntu -- echo ok
```

Si la commande affiche `ok`, WSL2 est opérationnel. Sinon, voir la section Dépannage en bas.

---

## Étape 1 : Installer Snort 3 dans WSL

Ouvre Ubuntu (WSL) et lance le script d'installation. Il demande le mot de passe sudo une fois et compile Snort 3 (10 à 30 minutes) :

```bash
bash /mnt/d/Formation/Project/ids-hybride/scripts/install-snort3-wsl.sh
```

À la fin, le script affiche la version de Snort et valide la configuration. Il a créé :
- le binaire `/usr/local/bin/snort`
- la config `/usr/local/etc/snort/snort.lua`
- des règles de test dans `/usr/local/etc/snort/rules/local.rules`
- le dossier de logs `/var/log/snort/`

---

## Étape 2 : Activer systemd et installer le service

Le mode `linux` utilise `systemctl` et `journalctl`, qui nécessitent systemd. Lance :

```bash
bash /mnt/d/Formation/Project/ids-hybride/scripts/setup-service-wsl.sh
```

La première exécution active systemd dans `/etc/wsl.conf`. Il faut alors recharger WSL **depuis PowerShell** :

```powershell
wsl --shutdown
```

Rouvre Ubuntu, puis relance le script `setup-service-wsl.sh` : cette fois il installe et active le service `snort3.service`.

Vérification :
```bash
sudo systemctl start snort3
systemctl status snort3
```

---

## Étape 3 : Lancer le backend en mode réel

Toujours dans WSL :

```bash
bash /mnt/d/Formation/Project/ids-hybride/scripts/run-backend-wsl.sh
```

Ce script crée un venv Linux (dans le home WSL), installe les dépendances, et lance le backend avec `SNORT_BACKEND=linux` sur le port 8000. Grâce au partage `localhost` de WSL2, il est accessible depuis Windows sur `http://localhost:8000`.

---

## Étape 4 : Lancer le frontend (sur Windows)

Le frontend ne change pas. Dans un terminal Windows :

```powershell
cd D:\Formation\Project\ids-hybride\frontend
npm run dev
```

Ouvre `http://localhost:5173`. Le dashboard affiche maintenant de **vraies données Snort** : la page Système montre la vraie version et les vrais plugins/DAQ, la Console exécute le vrai binaire, l'analyse PCAP lance le vrai Snort, et les alertes proviennent du vrai `alert_json.txt`.

Pour confirmer que le mode réel est actif : la page Système (ou `GET /api/system/info`) doit indiquer `backend: linux`.

---

## Ce que change le mode réel, page par page

| Page | En mode réel |
|------|--------------|
| **Système** | Vraie sortie de `snort -V`, vrais plugins (`--list-plugins`), vrais DAQ (`--daq-list`), interfaces lues dans `/sys/class/net`. |
| **Console** | Exécute le vrai binaire `snort` (commandes d'introspection en lecture seule). |
| **Analyse PCAP** | Lance réellement `snort -r fichier.pcap -c snort.lua -A alert_json` et lit les alertes produites. |
| **Règles** | Lit et écrit le vrai `/usr/local/etc/snort/rules/local.rules` ; la validation exécute `snort -T`. |
| **Service** | `systemctl start/stop/restart snort3`. |
| **Alertes** | Lit le vrai `alert_json.txt` ; le flux temps réel suit le fichier au fil de l'eau. |
| **Logs** | `journalctl -u snort3`. |
| **Configuration** | Lit et écrit le vrai `snort.lua`. |

---

## Capturer du vrai trafic

En WSL, Snort écoute l'interface `eth0` de la VM WSL. Pour générer des alertes de test faciles à voir :

```bash
# Depuis WSL, un ping déclenche la règle ICMP de test (sid 1000001)
ping -c 3 8.8.8.8
```

Pour analyser une vraie capture, dépose un fichier `.pcap` via la page **Analyse PCAP** du dashboard (glisser-déposer). C'est la façon la plus simple d'obtenir de vraies détections sans dépendre de l'interface réseau.

> Remarque : capturer le trafic Windows réel (et non celui de la VM WSL) demande du mirroring réseau, hors du périmètre de ce guide. L'analyse PCAP couvre déjà le besoin de « vraies données » de façon fiable.

---

## Revenir au mode mock

Il suffit de relancer le backend sous Windows comme avant (`SNORT_BACKEND` non défini vaut `mock`) :

```powershell
cd D:\Formation\Project\ids-hybride
.\start-dev.ps1
```

---

## Dépannage

| Symptôme | Cause / action |
|----------|----------------|
| `wsl` renvoie encore l'erreur hyperviseur | Le redémarrage n'a pas eu lieu, ou l'hyperviseur ne démarre pas. Vérifier dans PowerShell admin : `bcdedit /enum {current}` doit montrer `hypervisorlaunchtype Auto`, puis redémarrer. |
| `systemctl` : « System has not been booted with systemd » | systemd pas encore actif. Faire `wsl --shutdown` (PowerShell), rouvrir Ubuntu, relancer `setup-service-wsl.sh`. |
| La compilation de Snort échoue | Relire le message ; souvent une dépendance manquante. Le script réinstalle les paquets requis, relancer suffit en général. |
| Le dashboard montre `backend: mock` | Le backend a été lancé sous Windows. Le lancer via `run-backend-wsl.sh` dans WSL. |
| Snort ne capture rien sur eth0 | Le service tourne en root via systemd (OK). Vérifier `journalctl -u snort3` et que l'interface est bien `eth0` (`ip a` dans WSL). |
