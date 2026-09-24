# Snort et son écosystème : Recherche approfondie

> Document de recherche pour le projet **ids-hybride**
> Dernière mise à jour : 24 septembre 2026
> Objet : le moteur Snort, son fonctionnement interne, son histoire, tout ce qui l'utilise, et sa place dans une architecture IDS hybride.

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Histoire et gouvernance](#2-histoire-et-gouvernance)
3. [Architecture interne du moteur](#3-architecture-interne-du-moteur)
4. [Snort 2 vs Snort 3](#4-snort-2-vs-snort-3)
5. [Les modes de fonctionnement](#5-les-modes-de-fonctionnement)
6. [Le DAQ (Data Acquisition Layer)](#6-le-daq-data-acquisition-layer)
7. [Preprocessors / Inspectors](#7-preprocessors--inspectors)
8. [Le langage de règles Snort](#8-le-langage-de-règles-snort)
9. [Les rulesets (jeux de règles)](#9-les-rulesets-jeux-de-règles)
10. [OpenAppID : la détection applicative](#10-openappid--la-détection-applicative)
11. [La sortie des logs et Barnyard2](#11-la-sortie-des-logs-et-barnyard2)
12. [Outils de gestion des règles](#12-outils-de-gestion-des-règles)
13. [Frontends et interfaces d'analyse](#13-frontends-et-interfaces-danalyse)
14. [Tout ce qui embarque le moteur Snort](#14-tout-ce-qui-embarque-le-moteur-snort)
15. [Snort vs Suricata](#15-snort-vs-suricata)
16. [Limites et techniques d'évasion](#16-limites-et-techniques-dévasion)
17. [Snort dans une architecture IDS hybride](#17-snort-dans-une-architecture-ids-hybride)
18. [Sources](#18-sources)

---

## 1. Vue d'ensemble

**Snort** est le NIDS/NIPS (Network Intrusion Detection/Prevention System) open source le plus déployé au monde. Créé en 1998, il a « lancé » le mouvement des IDS open source et est devenu le **standard de fait** pour la syntaxe de règles IDS/IPS.

**Nature du moteur :**
- Détection **basée sur les signatures** (règles) : il compare le trafic réseau à une base de motifs d'attaques connues.
- Peut fonctionner en **IDS** (détection + alerte) ou en **IPS** (prévention : blocage inline).
- Analyse en profondeur : décodage de protocoles, réassemblage TCP, normalisation applicative.

**Points clés :**
- Extrêmement mature, documentation abondante, énorme communauté.
- Base de règles maintenue par **Cisco Talos** (l'une des plus grandes équipes de threat intelligence au monde).
- Faiblesse structurelle des versions historiques : **mono-thread** (corrigé dans Snort 3), et l'incapacité intrinsèque des signatures à détecter les **attaques zero-day** ou le **trafic chiffré**.

---

## 2. Histoire et gouvernance

| Année | Événement |
|-------|-----------|
| **1998** | **Martin Roesch** crée Snort comme projet perso « les week-ends et jours de pluie », puis le publie en open source. Il devient rapidement le standard mondial de détection d'attaques réseau. |
| **2001** | Roesch fonde **Sourcefire** (janvier 2001), qui utilise Snort comme fondation de ses produits NGFW et IDS/IPS commerciaux. |
| **2005** | Tentative de rachat de Sourcefire par Check Point (~225 M$), bloquée pour raisons de sécurité nationale (CFIUS). |
| **2007** | Sourcefire entre en bourse (IPO). |
| **Juil. 2013** | **Cisco annonce l'acquisition de Sourcefire pour ~2,7 milliards $.** |
| **7 oct. 2013** | Clôture officielle de l'acquisition par Cisco. |
| **Fév. 2014** | Cisco libère **OpenAppID**, la détection applicative open source pour Snort. |
| **2014→** | L'équipe de recherche Sourcefire (VRT) devient **Cisco Talos**, qui maintient les règles Snort. |
| **2021** | Snort 3.0 devient la branche recommandée (réécriture multi-thread). |

**Relation Snort ↔ Cisco aujourd'hui :** Snort reste **open source** (licence GPLv2). Cisco possède la marque et emploie Talos, qui développe le moteur et publie les règles. Snort est **le cœur** de la gamme sécurité de Cisco (Firepower / Secure Firewall).

**Martin Roesch** : après le rachat, il est resté CTO sécurité chez Cisco, puis est devenu CEO de Netography. Figure historique de la cybersécurité open source.

---

## 3. Architecture interne du moteur

Le pipeline de traitement d'un paquet dans Snort suit globalement cet enchaînement :

```
   Interface réseau
        │
        ▼
   ┌─────────┐   Couche d'abstraction d'acquisition de paquets
   │   DAQ   │   (pcap, afpacket, nfq, ...)
   └────┬────┘
        ▼
   ┌──────────┐   Décodage des couches (Ethernet, IP, TCP/UDP...)
   │ Décodeur │
   └────┬─────┘
        ▼
   ┌──────────────────────┐   Défragmentation IP, réassemblage TCP,
   │ Preprocessors /      │   normalisation HTTP/DNS/SMTP, etc.
   │ Inspectors           │
   └────┬─────────────────┘
        ▼
   ┌────────────────────┐   Comparaison aux règles (fast pattern
   │ Moteur de détection│   matcher + évaluation des options)
   └────┬───────────────┘
        ▼
   ┌──────────────┐   Alerte / log / drop (IPS)
   │ Sortie/Output│   → unified2, syslog, JSON...
   └──────────────┘
```

**Dans Snort 3**, l'architecture a été repensée autour d'un **système d'analytique modulaire** :
- Un **thread de contrôle** unique + **plusieurs threads de traitement (worker threads)**.
- Toute la logique de détection est mise dans des **modules d'analytique** tournant comme threads séparés.
- Les interactions entre modules et framework passent par une API : le **Snort Abstraction Layer (SAL)**.
- Chaque worker thread tourne dans une boucle d'événements infinie : il récupère le paquet suivant, le prétraite, l'analyse, et émet les alertes.

---

## 4. Snort 2 vs Snort 3

Snort 3 (initialement « Snort++ ») est une **réécriture complète en C++**, pas une simple mise à jour.

| Critère | Snort 2.x | Snort 3.x |
|---------|-----------|-----------|
| **Threading** | Mono-thread (1 process = 1 cœur) | **Multi-thread** : 1 thread de contrôle + N threads de traitement |
| **Modèle de détection** | Basé sur les **paquets** (packet-based) | Basé sur les **flux** (flow-based), normalisation facilitée |
| **Langage** | C | C++ |
| **Preprocessors** | « Preprocessors » | « **Inspectors** » (plugins, ne correspondent pas 1:1) |
| **Pattern matching** | Aho-Corasick | Support de **Hyperscan** (Intel) → fast patterns beaucoup plus rapides |
| **Syntaxe des règles** | Historique | **Nouvelle syntaxe simplifiée** (plus lisible, rétrocompatible avec les règles v2) |
| **Config** | `snort.conf` | `snort.lua` (configuration en **Lua**), scriptable |
| **Extensibilité** | Limitée | **Architecture à plugins** (inspectors, loggers, DAQ, codecs...) |
| **Performance** | Limitée à 1, 10 Gbps par instance | Inspecte plus de trafic à ressources égales |

**Verdict** : migrer vers Snort 3 est recommandé (gains majeurs en performance, scalabilité, écriture de règles), sauf si une fonctionnalité spécifique n'y est pas encore portée. Sur les produits Cisco, le passage au moteur Snort 3 a augmenté le débit d'inspection **sans changement matériel**.

---

## 5. Les modes de fonctionnement

Snort peut être lancé selon trois grands modes :

1. **Sniffer mode**, lit et affiche les paquets sur la console (comme tcpdump).
2. **Packet Logger mode**, enregistre les paquets sur disque.
3. **NIDS mode**, applique les règles au trafic et génère des alertes (mode le plus courant).
4. **IPS / Inline mode**, Snort est placé **sur le chemin** du trafic et peut **bloquer (drop)** les paquets malveillants. Nécessite un DAQ inline (afpacket, nfq, ipfw).

En IDS, Snort est branché en **passif** (port mirroring/SPAN, TAP réseau). En IPS, il est **en coupure** (bridge/routeur), ce qui introduit un point de passage unique à sécuriser (fail-open/fail-close).

---

## 6. Le DAQ (Data Acquisition Layer)

Le **DAQ** est la couche d'abstraction entre le moteur Snort et le mécanisme d'acquisition des paquets du système d'exploitation. Il permet de changer de source de trafic sans toucher au moteur.

**Modules DAQ disponibles** : `pcap`, `afpacket`, `dump`, `nfq`, `ipq`, `ipfw`.
**Modes** : `read-file`, `passive`, `inline`.

| DAQ | Usage | Particularités |
|-----|-------|----------------|
| **pcap** | IDS passif (par défaut) | Le plus simple, lecture depuis libpcap ou fichier `.pcap` |
| **afpacket** | IPS inline | Snort gère lui-même le bridging ; il suffit que les interfaces soient « up ». **Ne dépend pas du routage IP**. On configure des paires d'interfaces séparées par `:`. |
| **nfq** (NFQUEUE) | IPS inline | Utilise **iptables** pour router le trafic entre sous-réseaux ; Snort évalue tout le trafic. Plus complexe (nécessite de comprendre iptables + routage IP). |
| **dump** | Test | Écrit les paquets, utile pour valider une politique IPS |

Pour les hautes performances (NIC spécialisées, ex. Napatech), il existe des DAQ **DPDK multiqueue**.

---

## 7. Preprocessors / Inspectors

Avant la détection par règles, Snort **prépare et normalise** le trafic. C'est essentiel pour contrer l'évasion (fragmentation, encodage...). En Snort 2 ce sont des *preprocessors*, en Snort 3 des *inspectors* (plugins).

| Composant | Rôle |
|-----------|------|
| **Frag3** | Défragmentation IP « target-based ». Détecte jusqu'à 8 types d'anomalies de fragmentation. |
| **Stream / Stream5** | Réassemblage et suivi de sessions **TCP et UDP** (state tracking). Indispensable avant l'inspection applicative. |
| **HTTP Inspect / http_inspect** | Normalise les chaînes HTTP (URI, en-têtes). Ex : décode `%48%69...` → `Hidden`, normalise le JavaScript, les encodages en pourcentage, le Unicode. Ne travaille que sur du flux réassemblé par Stream. |
| **Autres** | DNS, SMTP, FTP/Telnet, SSH, SIP, DCE/RPC, port scan detection, sensitive data (détection de PII/cartes bancaires)... |

**Pourquoi c'est critique** : la normalisation empêche un attaquant de dissimuler une attaque via fragmentation, encodage d'URL, casse mixte, etc. Sans elle, une signature simple serait triviale à contourner.

---

## 8. Le langage de règles Snort

C'est LE standard de l'industrie. Une règle = **un en-tête (header)** + **des options** entre parenthèses.

### Structure

```
action proto src_ip src_port direction dst_ip dst_port ( options )
└──────────────── HEADER ──────────────────────────┘ └─ OPTIONS ─┘
```

### Exemple commenté

```snort
alert tcp $EXTERNAL_NET any -> $HOME_NET 80 ( \
    msg:"WEB-ATTACK tentative injection SQL"; \
    flow:to_server,established; \
    content:"UNION"; nocase; http_uri; \
    pcre:"/union\s+select/i"; \
    classtype:web-application-attack; \
    sid:1000001; rev:1; )
```

### L'en-tête (header)

| Champ | Rôle | Exemples |
|-------|------|----------|
| **action** | Que faire au match | `alert`, `log`, `pass`, `drop` (IPS), `reject`, `sdrop` |
| **proto** | Protocole | `tcp`, `udp`, `icmp`, `ip` |
| **src/dst_ip** | Adresses (variables) | `$HOME_NET`, `$EXTERNAL_NET`, `any`, `192.168.1.0/24` |
| **ports** | Ports | `any`, `80`, `[80,443]`, `!53` |
| **direction** | Sens | `->` (uni), `<>` (bidirectionnel) |

### Options courantes

- **`msg`** : message de l'alerte.
- **`content`** : motif à chercher (le cœur du matching), avec modificateurs `nocase`, `offset`, `depth`, `distance`, `within`.
- **`pcre`** : expression régulière compatible Perl.
- **`flow`** : contexte de session (`to_server`, `established`...).
- **`sid`** : Signature ID (identifiant unique, >1 000 000 pour les règles locales).
- **`rev`** : numéro de révision de la règle.
- **`classtype`** : catégorie d'attaque.
- **`reference`** : lien vers CVE/bugtraq/url.
- Modificateurs de « sticky buffer » Snort 3 : `http_uri`, `http_header`, `http_client_body`, etc.

> Le **fast pattern matcher** sélectionne le `content` le plus discriminant d'une règle pour un premier filtrage ultra-rapide (Aho-Corasick / Hyperscan), avant l'évaluation complète des options, clé de la performance.

---

## 9. Les rulesets (jeux de règles)

Les règles ne sont utiles que si elles sont **à jour**. Trois niveaux officiels (Cisco Talos) :

| Ruleset | Contenu | Délai | Coût |
|---------|---------|-------|------|
| **Subscriber (Talos / ex-VRT)** | Jeu complet, **sans délai**, mis à jour ~mardi/jeudi (et à tout moment sur menace émergente). Couvre les zero-days. | Immédiat | **Payant** (abonnement) |
| **Registered** | Identique au subscriber mais **avec 30 jours de retard**. Ne contient pas les toutes dernières signatures 0-day. Gratuit pour particuliers/entreprises (pas pour les intégrateurs). | 30 jours | Gratuit (inscription) |
| **Community** | Sous-ensemble contribué par la communauté, sous GPLv2. | — | Gratuit, sans inscription |

**Recommandation** si non-abonné : combiner **Registered + Community**.

**Autre source majeure : Emerging Threats (ET)**, maintenu par Proofpoint.
- **ET Open** : gratuit, très large couverture (souvent plus réactif que Community).
- **ET Pro** : commercial.
- Les règles ET sont compatibles Snort **et** Suricata.

Chaque règle nécessite un **oinkcode** (clé API personnelle) pour télécharger les règles Talos enregistrées/abonnées depuis snort.org.

---

## 10. OpenAppID : la détection applicative

Annoncé par Cisco en **février 2014**, **OpenAppID** ajoute la conscience applicative (couche 7) à Snort.

- Ensemble de **bibliothèques Lua open source** (des « detectors ») qui identifient les applications dans le trafic (pas juste le port).
- Lancé avec **>1400 applications** détectables ; enrichi depuis.
- Permet d'écrire des règles qui matchent une application (`appid`) plutôt qu'un simple port → utile face aux applis qui « sautent » de port ou tunnellent.
- Utilisé notamment dans **pfSense/OPNsense** pour le contrôle applicatif.

---

## 11. La sortie des logs et Barnyard2

Écrire les alertes directement (base de données, texte) **ralentit** Snort et peut faire perdre des paquets à haut débit. Solution : le format binaire **unified2** + un lecteur asynchrone.

- **unified2** : format binaire compact ; Snort écrit les alertes **le plus vite possible**, sans se soucier du stockage final.
- **Barnyard2** : processus séparé qui **lit les fichiers unified2** et effectue les tâches lentes (insertion en base MySQL/PostgreSQL, envoi syslog, écriture pour un frontend...).
- Ce découplage permet de tenir des liens **1 Gbps et plus** sans drop.

Snort 3 peut aussi sortir directement du **JSON** (loggers modulaires), ce qui simplifie l'ingestion vers un SIEM (Elastic, Wazuh, Splunk...) sans forcément passer par Barnyard2.

---

## 12. Outils de gestion des règles

Télécharger, mettre à jour et activer/désactiver des milliers de règles se gère avec des outils dédiés :

| Outil | État | Description |
|-------|------|-------------|
| **PulledPork** | Recommandé | Script qui télécharge automatiquement les dernières règles (Talos, ET), gère les politiques (enable/disable/modify), suit la structure moderne des règles Snort. Supporte Snort **et** Suricata. |
| **Oinkmaster** | Ancien / obsolète | Le précurseur (>10 ans), n'a pas suivi les évolutions récentes de Snort. À éviter pour du neuf. |
| **PulledPork Sandwich** | Complémentaire | Gestion de politiques globales et locales pour parcs multi-capteurs. |

---

## 13. Frontends et interfaces d'analyse

Snort seul ne fournit pas d'interface graphique riche. Historiquement, un écosystème de frontends s'est développé :

| Outil | Rôle |
|-------|------|
| **BASE** (Basic Analysis and Security Engine) | Interface web historique d'analyse des alertes (héritier d'ACID). |
| **Snorby** | Frontend web moderne (Ruby on Rails), axé simplicité + puissance, pour usage privé/entreprise. |
| **Sguil** | GUI de **Network Security Monitoring** : événements temps réel, session data, et **capture paquet brute** ; analyse orientée événements. |
| **Squert** | Vue web (métadonnées, séries temporelles) au-dessus des données Sguil. |
| **BASE/Snorby → SIEM moderne** | Aujourd'hui on préfère souvent envoyer les alertes vers **Elastic (ELK), Wazuh, Splunk, Graylog**. |

> **Security Onion** est la distribution Linux qui a longtemps agrégé tout cet écosystème (Snort, Suricata, Zeek/Bro, OSSEC, Sguil, Squert, Snorby, ELSA, Xplico, NetworkMiner...). C'est **la** plateforme de référence pour un lab NSM/IDS complet et prêt à l'emploi.

---

## 14. Tout ce qui embarque le moteur Snort

Snort est le moteur de détection sous-jacent d'un très grand nombre de produits, open source comme commerciaux.

### Produits Cisco (commerciaux)
- **Cisco Firepower / Secure Firewall (FTD)**, la gamme NGFW/NGIPS de Cisco ; Snort en est le cœur (migration en cours vers le moteur **Snort 3**).
- **Cisco ASA with FirePOWER Services**, pare-feu ASA + module IPS Snort.
- **Cisco Firepower Management Center (FMC / ex-FireSIGHT)**, console de gestion centralisée des capteurs Snort.
- **Cisco Meraki MX**, appliances SD-WAN/sécurité cloud-managées, avec IDS/IPS basé sur Snort et règles Talos.

### Lignée Sourcefire
- Les appliances **Sourcefire 3D / Firepower** d'origine étaient bâties sur Snort ; c'est cette gamme qui est devenue le NGFW de Cisco après le rachat de 2013.

### Open source / firewalls
- **pfSense** (Netgate), paquet Snort intégré (et alternative Suricata) : « le principal IDS open source + le pare-feu open source le plus utilisé ». Supporte OpenAppID pour le contrôle applicatif.
- **OPNsense**, dérivé de pfSense, propose aussi l'IDS/IPS (surtout Suricata, mais l'écosystème de règles est commun).
- **Security Onion**, distribution NSM qui embarque Snort (et Suricata, Zeek).
- Innombrables intégrations maison via l'API de règles + unified2.

### À noter
De très nombreux NGFW et solutions IPS du marché ont, à un moment, utilisé le langage de règles Snort ou le format ET, tant ce format s'est imposé comme lingua franca de la détection réseau.

---

## 15. Snort vs Suricata

Le choix le plus fréquent pour un projet NIDS. Les deux partagent une **philosophie signature** et une **compatibilité de règles** partielle.

| Critère | **Snort** (2.x) | **Snort 3** | **Suricata** |
|---------|-----------------|-------------|--------------|
| Année | 1998 | 2021 | 2010 |
| Threading | Mono-thread | Multi-thread | **Multi-thread natif** (dès l'origine) |
| Débit typique / instance | 1, 10 Gbps | Amélioré | **10 Gbps+**, scalabilité ~linéaire jusqu'à ~48 cœurs |
| Compatibilité règles | Standard Snort | Standard Snort | Lit **la plupart des règles Snort** (avec ajustements) + mots-clés étendus |
| Protocoles L7 | Bon | Bon | **Très étendu** (HTTP, TLS, SMTP, FTP, SSH, DNS...) + extraction de fichiers, JA3 |
| Sortie | unified2, JSON (v3) | unified2, JSON | **EVE JSON** natif (excellent pour SIEM/ML) |
| Maturité écosystème | Très élevée | Élevée | Élevée |
| Base de règles phare | Talos | Talos | ET Open/Pro (+ règles Snort) |

**Synthèse :**
- **Suricata** est en général le meilleur choix pour du **haut débit** (multi-thread mature) et pour l'**intégration SIEM/ML** grâce à sa sortie **EVE JSON** riche.
- **Snort 3** a rattrapé une grande partie de l'écart de performance et reste **le standard** côté règles Talos et écosystème Cisco.
- Les deux peuvent **coexister** ; beaucoup d'architectures utilisent Suricata comme moteur temps réel et Zeek pour la visibilité.

---

## 16. Limites et techniques d'évasion

Comprendre les faiblesses est essentiel, surtout pour un projet **hybride** (c'est précisément ce que la partie anomalie/ML doit compenser).

**Limites structurelles de la détection par signature :**
- **Zero-days** : par nature, une signature ne détecte que le **connu**. Une attaque inédite passe inaperçue (faux négatif).
- **Trafic chiffré (HTTPS/TLS)** : Snort ne voit pas le contenu chiffré. Il ne peut travailler que sur les métadonnées (SNI, certificats) sauf déchiffrement en amont.
- **Faux positifs** : le matching de motifs déclenche sur du trafic bénin ressemblant → nécessite un tuning permanent des règles.
- **Coût opérationnel** : mise à jour et maintenance continues des règles ; retard des signatures = fenêtre de vulnérabilité.
- **Angle mort cloud/SaaS/identité** : les règles réseau ne voient pas le plan de contrôle cloud, les événements SaaS ou les attaques sur l'identité.
- **Débit** : au-delà de ~1, 10 Gbps, une instance Snort 2 peut perdre des paquets.

**Techniques d'évasion classiques (à connaître pour tester la robustesse) :**
- **Fragmentation IP / segmentation TCP** pour éclater la signature entre plusieurs paquets (contré par Frag3/Stream si bien configuré).
- **Encodage / obfuscation** de la charge (URL-encoding, casse mixte, Unicode), d'où l'importance des normalisations (http_inspect).
- **Chiffrement** du payload.
- **Insertion/évasion** exploitant des différences d'interprétation TTL/checksum entre l'IDS et la cible.
- Dépôt de référence sur le sujet : `ahm3dhany/IDS-Evasion` (évasion de Snort, à des fins pédagogiques/pentest).

> **Conclusion pour ids-hybride** : ces limites justifient exactement l'approche hybride, Snort/Suricata pour le **connu** et une couche **anomalie/ML** pour l'**inconnu**, le tout corrélé dans un SIEM.

---

## 17. Snort dans une architecture IDS hybride

Positionnement recommandé de Snort au sein du projet `ids-hybride` :

```
                          ┌─────────────────────────────┐
   Trafic réseau ────────▶│ Snort 3 (signatures Talos/ET)│──┐  alertes
   (SPAN/TAP ou inline)   │  détection du CONNU          │  │  (JSON/unified2)
                          └─────────────────────────────┘  │
                                                            ▼
                          ┌─────────────────────────────┐  ┌──────────────┐
   Trafic réseau ────────▶│ Zeek (logs/flux enrichis)    │─▶│  SIEM        │
                          │  features pour le ML         │  │  (Wazuh/ELK) │──▶ Dashboard
                          └─────────────────────────────┘  │  corrélation │
                                                            └──────┬───────┘
                          ┌─────────────────────────────┐         │
   Flux/features ────────▶│ Module ML (anomalie)         │─────────┘
                          │  Isolation Forest / autoenc. │  détection de l'INCONNU
                          └─────────────────────────────┘
```

**Rôle de chaque brique :**
- **Snort 3** : détection rapide et fiable des menaces **connues** via règles Talos/ET. Sortie JSON pour ingestion facile.
- **Zeek** (complémentaire) : produit des logs riches servant de **features** au module ML et couvrant le trafic chiffré (métadonnées TLS/JA3).
- **Module ML** : détecte les **anomalies** (attaques inédites) que Snort rate par construction.
- **SIEM (Wazuh/ELK)** : **corrèle** alertes signatures + anomalies + logs hôtes, réduit les faux positifs, fournit le dashboard.

**Pistes de mise en œuvre :**
- Déployer Snort 3 sur Ubuntu (DAQ `pcap` en IDS, `afpacket` en IPS).
- Gérer les règles avec **PulledPork** (Talos Registered + Community + ET Open).
- Sortie **JSON** → forwarder vers Wazuh/Elastic.
- Prototyper le tout dans **Docker** ou une VM ; envisager **Security Onion** pour un banc d'essai complet et reproductible.

---

## 18. Sources

**Architecture & versions**
- [Snort Blog, The major differences that set Snort 3 apart from Snort 2](https://blog.snort.org/2020/08/snort-3-2-differences.html)
- [Cisco, Snort 2 versus Snort 3](https://www.cisco.com/c/en/us/td/docs/security/secure-firewall/management-center/snort3/snort3-custom-policies/g_migrating_from_snort2_to_snort3/r_snort2_versus_snort3.html)
- [Cisco, Snort 3 Adoption](https://secure.cisco.com/secure-firewall/docs/snort-3-adoption)
- [Arm Learning, Optimize Snort 3 with multithreading](https://learn.arm.com/learning-paths/servers-and-cloud-computing/snort3-multithreading/usecase/)
- [Wikipedia, Snort (software)](https://en.wikipedia.org/wiki/Snort_(software))

**Histoire**
- [Snort Blog, Martin Roesch on Snort's history and the Sourcefire Acquisition](https://blog.snort.org/2013/07/martin-roesch-on-snorts-history-and.html)
- [Snort.org FAQ, What is the relationship between Snort and Cisco?](https://www.snort.org/faq/what-is-the-relationship-between-snort-and-cisco)
- [Wikipedia, Sourcefire](https://en.wikipedia.org/wiki/Sourcefire)
- [Wikipedia, Cisco Talos](https://en.wikipedia.org/wiki/Cisco_Talos)

**DAQ, preprocessors, IPS**
- [Snort, README.daq](https://www.snort.org/document/readme-daq)
- [Snort, Snort IPS using DAQ AFPacket (PDF)](https://snort-org-site.s3.amazonaws.com/production/document_files/files/000/000/013/original/Snort_IPS_using_DAQ_AFPacket.pdf)
- [Sublime Robots, Snort IPS with NFQ routing on Ubuntu](http://sublimerobots.com/2017/06/snort-ips-with-nfq-routing-on-ubuntu/)
- [snort3 GitHub, http_inspect documentation](https://github.com/snort3/snort3/blob/master/doc/user/http_inspect.txt)
- [Cisco, Snort 3 Inspector Reference](https://www.cisco.com/c/en/us/td/docs/security/secure-firewall/snort3-inspectors/snort-3-inspector-reference/intro.html)

**Règles & rulesets**
- [Cymulate, Snort Rules Explained: Structure, Syntax & Use Cases](https://cymulate.com/cybersecurity-glossary/snort-rules/)
- [Snort.org FAQ, What are the differences in the rule sets?](https://www.snort.org/faq/what-are-the-differences-in-the-rule-sets)
- [Cisco-Talos/snort-faq, Differences in the rulesets](https://github.com/Cisco-Talos/snort-faq/blob/master/Rules/What-are-the-differences-in-the-rulesets.md)

**OpenAppID**
- [Cisco Newsroom, Open Source Application Detection and Control (OpenAppID)](https://newsroom.cisco.com/c/r/newsroom/en/us/a/y2014/m02/cisco-security-introduces-open-source-application-detection-and-control.html)
- [Network World, Application awareness goes open source: Snort OpenAppID](https://www.networkworld.com/article/748376/cisco-subnet-application-awareness-goes-open-source-snort-openappid.html)

**Gestion des règles & frontends**
- [GitHub, shirkdog/pulledpork](https://github.com/shirkdog/pulledpork)
- [Snort.org, Downloads](https://www.snort.org/downloads)

**Produits embarquant Snort**
- [PacketMischief, Snort Implementation in Cisco Products (BRKSEC-2137)](https://www.packetmischief.ca/2015/06/11/brksec-2137-snort-implementation-in-cisco-products/)
- [Netgate, Application Detection on pfSense Software](https://www.netgate.com/blog/application-detection-on-pfsense-software)
- [Dependency Hell, Snort 3 Deep Dive: The Future of Cisco Firepower](https://dependencyhell.net/2021/snort-3-deep-dive-the-future-of-cisco-firepower)

**Snort vs Suricata**
- [Stamus Networks, Suricata vs Snort](https://www.stamus-networks.com/suricata-vs-snort)
- [StationX, Suricata vs Snort: A Comprehensive Review](https://www.stationx.net/suricata-vs-snort/)

**Limites & évasion**
- [Comparitech, Snort Review for 2025 & the Best Alternatives](https://www.comparitech.com/net-admin/snort-review/)
- [Future of SecOps, Snort rules in 2026: still useful, still awkward](https://www.futureofsecops.com/blog/snort-rules)
- [GitHub, ahm3dhany/IDS-Evasion](https://github.com/ahm3dhany/IDS-Evasion)
