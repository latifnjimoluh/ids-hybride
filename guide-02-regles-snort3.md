# Guide 02 : Écriture de règles Snort 3

> Projet **ids-hybride** · Guide pratique · 24 septembre 2026
> Objet : maîtriser la syntaxe des règles Snort 3, des bases aux options avancées (sticky buffers, flowbits, detection_filter), avec des exemples testables.

---

## Table des matières
1. [Anatomie d'une règle](#1-anatomie-dune-règle)
2. [L'en-tête (header)](#2-len-tête-header)
3. [Les options générales obligatoires](#3-les-options-générales-gid-sid-rev-msg)
4. [Détection de contenu (`content`)](#4-détection-de-contenu-content)
5. [Les modificateurs de `content`](#5-les-modificateurs-de-content)
6. [Les sticky buffers (nouveauté Snort 3)](#6-les-sticky-buffers-nouveauté-snort-3)
7. [PCRE : expressions régulières](#7-pcre--expressions-régulières)
8. [Options non-payload (`flow`, `flowbits`...)](#8-options-non-payload-flow-flowbits)
9. [Contrôle du bruit (`detection_filter`, `threshold`)](#9-contrôle-du-bruit-detection_filter--seuils)
10. [Exemples complets commentés](#10-exemples-complets-commentés)
11. [Tester ses règles](#11-tester-ses-règles)
12. [Migration Snort 2 → 3](#12-migration-des-règles-snort-2--3)
13. [Bonnes pratiques](#13-bonnes-pratiques)
14. [Sources](#14-sources)

---

## 1. Anatomie d'une règle

Une règle Snort = **un en-tête** + **un corps d'options** entre parenthèses.

```
alert tcp $EXTERNAL_NET any -> $HOME_NET 80 ( msg:"..."; content:"..."; sid:1000001; )
└──┬─┘ └┬┘ └─────┬─────┘ └┬┘ └┬┘ └───┬──┘ └┬┘ └──────────── options ───────────────┘
 action proto  src_ip  sport dir dst_ip dport
└──────────────────── HEADER ──────────────────┘
```

- **Header** : *qui / quoi / d'où / vers où*.
- **Options** : *comment détecter* + métadonnées (message, identifiant, classification).

---

## 2. L'en-tête (header)

### Actions

| Action | Effet |
|--------|-------|
| `alert` | Génère une alerte + journalise (le plus courant) |
| `log` | Journalise sans alerter |
| `pass` | Ignore le paquet (whitelist) |
| `drop` | **IPS** : bloque le paquet + alerte |
| `reject` | **IPS** : bloque + envoie un TCP reset / ICMP unreachable |
| `sdrop` | **IPS** : bloque silencieusement (pas de log) |

### Protocoles
`tcp`, `udp`, `icmp`, `ip`, et en Snort 3, les **services applicatifs** : `http`, `ssl`, `dns`, `ftp`, `ssh`...

### Adresses & ports (variables)
```
$HOME_NET  $EXTERNAL_NET  any  192.168.1.10  10.0.0.0/8  [10.0.0.0/8,192.168.0.0/16]  !$HOME_NET
```
Ports : `any`, `80`, `[80,443]`, `1024:` (≥1024), `:1024` (≤1024), `!53` (tout sauf 53).

### Direction
- `->` : unidirectionnel (source vers destination).
- `<>` : bidirectionnel.

---

## 3. Les options générales (`gid`, `sid`, `rev`, `msg`)

| Option | Rôle | Note |
|--------|------|------|
| `msg` | Texte de l'alerte | Toujours descriptif |
| `sid` | Signature ID (unique) | **≥ 1 000 000 pour vos règles locales** |
| `rev` | Révision de la règle | Incrémenter à chaque modif |
| `gid` | Generator ID | 1 par défaut (moteur de règles de texte) |
| `classtype` | Catégorie d'attaque | Ex : `web-application-attack`, `trojan-activity` |
| `reference` | Lien externe | `reference:cve,2021-44228;` |
| `metadata` | Métadonnées libres | politique, auteur... |
| `priority` | Priorité (1 = haute) | Surcharge celle du classtype |

> **Règle d'or** : les SID de vos règles maison commencent à **1000000** et s'incrémentent de 1. Cela évite les collisions avec les règles Talos/ET.

---

## 4. Détection de contenu (`content`)

`content` est le cœur du matching : cherche une chaîne d'octets dans la charge utile.

```snort
content:"malicious";              # texte ASCII
content:"|90 90 90 90|";          # octets en hexadécimal (NOP sled)
content:"cmd.exe|00|";            # mixte ASCII + hex
```
- Les octets entre `| |` sont en **hexadécimal**.
- On peut chaîner plusieurs `content` dans une même règle (tous doivent matcher).

---

## 5. Les modificateurs de `content`

Ils précisent **où** et **comment** chercher. Placés après le `content` concerné, séparés par des virgules ou en options suivantes.

| Modificateur | Effet |
|--------------|-------|
| `nocase` | Insensible à la casse |
| `offset:N` | Commence la recherche à l'octet N |
| `depth:N` | Cherche seulement dans les N premiers octets |
| `distance:N` | Saute N octets après le `content` précédent |
| `within:N` | Le match doit tomber dans N octets après le précédent |
| `fast_pattern` | Désigne ce `content` comme motif de pré-filtrage rapide |
| `bufferlen` | Longueur du buffer courant |

Exemple :
```snort
content:"GET", depth:3;                     # "GET" dans les 3 premiers octets
content:"/admin", distance:0, within:20;    # "/admin" dans les 20 octets suivants
```

> **`fast_pattern`** : Snort choisit un `content` par règle pour le passage rapide (Aho-Corasick/Hyperscan). Désigner explicitement le motif le plus **long et discriminant** améliore la performance.

---

## 6. Les sticky buffers (nouveauté Snort 3)

C'est **le** changement majeur de Snort 3 par rapport à Snort 2. Un *sticky buffer* **fixe le buffer d'inspection** : tous les `content`/`pcre` qui suivent s'appliquent à CE buffer, jusqu'au prochain sticky buffer.

> ⚠️ **Ordre inversé vs Snort 2** : en Snort 3, on place le **sticky buffer AVANT** le `content`. En Snort 2, le modificateur (ex. `http_uri`) venait *après* le content.

### Principaux sticky buffers HTTP

| Buffer | Contenu inspecté |
|--------|------------------|
| `http_uri` | URI de la requête HTTP |
| `http_raw_uri` | URI non normalisée |
| `http_header` | En-têtes HTTP (option `field` pour cibler un en-tête précis) |
| `http_raw_header` | En-têtes bruts |
| `http_method` | Méthode (GET, POST...) |
| `http_client_body` | Corps de la requête |
| `http_stat_code` | Code de statut de la réponse |
| `http_cookie` | Cookie |
| `file_data` | Corps de réponse / données de fichier |
| `pkt_data` | Données de paquet normalisées |

### Exemple
```snort
# Cherche "union select" UNIQUEMENT dans l'URI HTTP
alert http $EXTERNAL_NET any -> $HOME_NET any (
    msg:"SQL injection dans URI";
    flow:to_server,established;
    http_uri;                          # <-- sticky buffer d'abord
    content:"union", nocase;
    content:"select", nocase, distance:0;
    sid:1000010; rev:1;
)
```

Cibler un en-tête précis :
```snort
http_header: field user-agent;
content:"sqlmap", nocase;
```

---

## 7. PCRE : expressions régulières

Pour les motifs complexes que `content` ne peut exprimer. Syntaxe : `pcre:"/motif/modificateurs";`

```snort
pcre:"/union\s+select/i";      # i = insensible à la casse
pcre:"/\/admin\/\w+\.php/";
```

Modificateurs PCRE utiles : `i` (nocase), `s` (dot = tout), `m` (multiligne), `R` (relatif au content précédent).

> ⚠️ **Performance** : PCRE est coûteux. Toujours l'**ancrer avec un `content` + `fast_pattern`** en amont pour que le moteur ne lance la regex que sur les paquets déjà pré-filtrés. Ne jamais faire une règle *uniquement* PCRE sur du trafic large.

---

## 8. Options non-payload (`flow`, `flowbits`)

### `flow` : contexte de session
```snort
flow:to_server,established;    # requête cliente sur session TCP établie
flow:to_client,established;    # réponse serveur
flow:stateless;                # ignore l'état de session
```

### `flowbits` : machine à états sur une session
Permet de **corréler plusieurs paquets** d'une même session (poser/tester des drapeaux booléens). 5 opérations : `set`, `unset`, `toggle`, `isset`, `isnotset`, plus `noalert`.

Cas d'usage classique, détecter une réponse **seulement si** une requête précise a eu lieu :
```snort
# Règle 1 : on voit la requête suspecte, on pose un flag, sans alerter
alert http $HOME_NET any -> $EXTERNAL_NET any (
    msg:"Requête vers domaine suspect";
    flow:to_server,established;
    http_header: field host;
    content:"evil.example.com", nocase;
    flowbits:set,evil_request;
    flowbits:noalert;
    sid:1000020; rev:1;
)

# Règle 2 : n'alerte QUE si le flag a été posé plus tôt dans la session
alert http $EXTERNAL_NET any -> $HOME_NET any (
    msg:"Réponse malveillante du domaine suspect";
    flow:to_client,established;
    flowbits:isset,evil_request;
    file_data;
    content:"malware_payload";
    sid:1000021; rev:1;
)
```

---

## 9. Contrôle du bruit (`detection_filter` & seuils)

### `detection_filter` : n'alerter qu'après N occurrences
Idéal pour le brute-force / scan : n'alerte que si le seuil est franchi dans une fenêtre de temps.

```snort
# Alerte si > 5 échecs de login SSH depuis la même source en 60 s
alert tcp $EXTERNAL_NET any -> $HOME_NET 22 (
    msg:"Brute-force SSH possible";
    flow:to_server,established;
    content:"Failed password";
    detection_filter:track by_src, count 5, seconds 60;
    classtype:attempted-admin;
    sid:1000030; rev:1;
)
```
- `track by_src` / `by_dst` : compte par IP source ou destination.
- `count N` : nombre de hits avant alerte.
- `seconds S` : fenêtre glissante.

> Il existe aussi des seuils globaux d'événement (`event_filter`, `rate_filter` dans la config) pour limiter le volume d'alertes d'une même règle.

---

## 10. Exemples complets commentés

### a) Détection ICMP (test de base)
```snort
alert icmp $EXTERNAL_NET any -> $HOME_NET any (
    msg:"ICMP Ping détecté";
    itype:8;                       # type 8 = echo request
    sid:1000001; rev:1;
)
```
Test : `ping <ip_snort>` depuis une autre machine → doit déclencher.

### b) Accès à une page d'admin
```snort
alert http $EXTERNAL_NET any -> $HOME_NET any (
    msg:"Tentative d'accès à la page admin";
    flow:to_server,established;
    http_uri;
    content:"/admin", nocase;
    classtype:web-application-activity;
    sid:1000002; rev:1;
)
```

### c) User-Agent d'outil offensif (sqlmap)
```snort
alert http $EXTERNAL_NET any -> $HOME_NET any (
    msg:"Outil sqlmap détecté via User-Agent";
    flow:to_server,established;
    http_header: field user-agent;
    content:"sqlmap", nocase;
    classtype:web-application-attack;
    reference:url,sqlmap.org;
    sid:1000003; rev:1;
)
```

### d) Exfiltration : gros POST vers l'extérieur
```snort
alert http $HOME_NET any -> $EXTERNAL_NET any (
    msg:"POST volumineux sortant - exfiltration possible";
    flow:to_server,established;
    http_method;
    content:"POST";
    http_client_body;
    bufferlen:>10000;
    sid:1000004; rev:1;
)
```

### e) Signature Log4Shell (exemple pédagogique)
```snort
alert http $EXTERNAL_NET any -> $HOME_NET any (
    msg:"Tentative exploitation Log4Shell (JNDI)";
    flow:to_server,established;
    http_header;
    content:"${jndi:", nocase;
    pcre:"/\$\{jndi:(ldap|ldaps|rmi|dns):/i";
    classtype:attempted-admin;
    reference:cve,2021-44228;
    sid:1000005; rev:1;
)
```

---

## 11. Tester ses règles

**1. Placer la règle** dans `/usr/local/etc/snort/rules/local.rules` (chargé via `snort.lua`).

**2. Valider la syntaxe :**
```bash
snort -c /usr/local/etc/snort/snort.lua --warn-all
```

**3. Rejouer un PCAP en ne chargeant que vos règles :**
```bash
snort -q -c /usr/local/etc/snort/snort.lua \
      -r trafic_test.pcap \
      -R /usr/local/etc/snort/rules/local.rules \
      -A alert_fast
```
- `-R` : charge un fichier de règles spécifique.
- `-A alert_fast` : affiche les alertes en console.

**4. Générer du trafic de test** correspondant à la règle (curl, ping, nc...) en mode live, puis observer `/var/log/snort/`.

---

## 12. Migration des règles Snort 2 → 3

Snort 3 fournit un outil de conversion :
```bash
snort2lua -c snort.conf -r snort3.lua
```
Points d'attention lors du portage :
- Les modificateurs HTTP (`http_uri`, etc.) deviennent des **sticky buffers placés AVANT** le content (ordre inversé).
- `content:"...";http_uri;` (Snort 2) → `http_uri; content:"...";` (Snort 3).
- Vérifier les `pcre` (certains buffers `U`, `H`... sont remplacés par les sticky buffers).

---

## 13. Bonnes pratiques

- ✅ **SID ≥ 1 000 000** pour vos règles, incrémentés proprement, `rev` à jour.
- ✅ Toujours un `content` + `fast_pattern` **avant** un `pcre`.
- ✅ Restreindre au maximum header (`$HOME_NET`, ports précis, `flow`).
- ✅ Utiliser `detection_filter` pour les patterns bruyants (scan/brute-force).
- ✅ `msg` clair et `classtype`/`reference` renseignés → exploitables dans le SIEM.
- ✅ Tester sur PCAP avant la prod ; mesurer l'impact perf des règles lourdes.
- ❌ Éviter les règles `content:"a"` trop génériques → déluge de faux positifs.
- ❌ Éviter PCRE seul sur trafic large.

---

## 14. Sources

- [Snort 3 Docs, Rules (The Basics)](https://docs.snort.org/rules/)
- [Snort 3 Docs, Payload Detection Rule Options](https://docs.snort.org/rules/options/payload/)
- [Snort 3 Docs, HTTP Specific Options](https://docs.snort.org/rules/options/payload/http/)
- [Snort 3 Docs, http_header / http_raw_header](https://docs.snort.org/rules/options/payload/http/header)
- [Snort 3 Docs, flowbits](https://docs.snort.org/rules/options/non_payload/flowbits)
- [Snort 3 Docs, detection_filter](https://docs.snort.org/rules/options/post/detection_filter)
- [Snort Blog, How rules are improving in Snort 3](https://blog.snort.org/2020/08/how-rules-are-improving-in-snort-3.html)
- [Snort Blog, Converting custom Snort 2 rules for Snort 3](https://blog.snort.org/2020/09/converting-custom-snort-2-rules-for.html)
- [Lipson Thomas, Write Custom Snort Rules Like a Pro](https://lipsonthomas.com/custom-snort-rules/)
