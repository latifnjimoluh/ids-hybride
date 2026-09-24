# Guide 03 : Intégration Snort 3 → Wazuh & ELK

> Projet **ids-hybride** · Guide pratique · 24 septembre 2026
> Objet : faire remonter les alertes Snort 3 vers un SIEM (Wazuh ou Elastic/ELK) pour la centralisation, la corrélation et la visualisation.

---

## Table des matières
1. [Pourquoi centraliser dans un SIEM](#1-pourquoi-centraliser-dans-un-siem)
2. [Architecture cible](#2-architecture-cible)
3. [Prérequis : sortie JSON de Snort](#3-prérequis--activer-la-sortie-json-de-snort)
4. [Partie A : Intégration avec Wazuh](#4-partie-a--intégration-avec-wazuh)
5. [Partie B : Intégration avec ELK (Elastic Stack)](#5-partie-b--intégration-avec-elk-elastic-stack)
6. [Vérification & dépannage](#6-vérification--dépannage)
7. [Corrélation dans le contexte hybride](#7-corrélation-dans-le-contexte-hybride)
8. [Sources](#8-sources)

---

## 1. Pourquoi centraliser dans un SIEM

Snort seul produit des fichiers d'alerte locaux, difficiles à exploiter à l'échelle. Un SIEM apporte :
- **Centralisation** multi-capteurs (plusieurs sondes Snort → un seul point).
- **Corrélation** avec d'autres sources (logs hôtes, Suricata, Zeek, module ML anomalie).
- **Visualisation** (dashboards, recherche, séries temporelles).
- **Alerting** et enrichissement (threat intel, géolocalisation IP).

> **Format JSON = clé.** Wazuh et Elastic disposent de décodeurs JSON natifs : pas besoin d'écrire un parseur custom, et on conserve tous les champs.

---

## 2. Architecture cible

### Modèle distribué (recommandé)
```
┌─────────────────────────────┐         ┌───────────────────────────┐
│  Endpoint / Sonde réseau    │         │      Serveur SIEM         │
│                             │         │                           │
│  ┌────────┐   alert_json    │         │  ┌─────────────────────┐  │
│  │ Snort 3│──▶ /var/log/    │         │  │  Wazuh Manager      │  │
│  └────────┘   snort/        │         │  │  + Indexer          │  │
│       │       alert_json.txt│         │  │  (OpenSearch)       │  │
│       ▼                     │  chiffré│  └──────────┬──────────┘  │
│  ┌──────────────┐           │ 1514/tcp│             ▼             │
│  │ Wazuh Agent  │───────────┼────────▶│  ┌─────────────────────┐  │
│  │ (localfile)  │           │         │  │  Wazuh Dashboard    │  │
│  └──────────────┘           │         │  └─────────────────────┘  │
└─────────────────────────────┘         └───────────────────────────┘
```

L'agent Wazuh lit le fichier JSON de Snort et le transmet (chiffré) au Manager, qui décode, applique les règles de corrélation et alimente le dashboard.

---

## 3. Prérequis : activer la sortie JSON de Snort

Dans `/usr/local/etc/snort/snort.lua`, configurer le plugin **`alert_json`** :

```lua
alert_json =
{
    file = true,            -- écrire dans un fichier (pas la console)
    limit = 100,            -- taille (Mo) avant rotation
    fields = 'seconds action class b64_data dir dst_addr dst_ap \
              dst_port eth_dst eth_len eth_src eth_type gid \
              icmp_code icmp_id icmp_seq icmp_type iface ip_id \
              ip_len msg mpls pkt_gen pkt_len pkt_num priority \
              proto rev rule service sid src_addr src_ap src_port \
              target tcp_ack tcp_flags tcp_len tcp_seq tcp_win \
              timestamp tos ttl udp_len vlan',
}
```

Lancer Snort avec ce mode :
```bash
sudo snort -c /usr/local/etc/snort/snort.lua -i eth0 \
     -l /var/log/snort -A alert_json -s 65535 -k none
```

→ Les alertes s'écrivent dans **`/var/log/snort/alert_json.txt`** (une ligne JSON par événement).

**Vérifier la sortie :**
```bash
tail -f /var/log/snort/alert_json.txt
```
Chaque ligne ressemble à :
```json
{"timestamp":"09/24-14:03:11.123456","action":"allow","class":"Web Application Attack","msg":"SQL injection dans URI","priority":1,"proto":"TCP","src_addr":"203.0.113.5","src_port":51514,"dst_addr":"192.168.1.10","dst_port":80,"service":"http","sid":1000010,"gid":1,"rev":1}
```

---

## 4. Partie A : Intégration avec Wazuh

### Étape A1 : Installer l'agent Wazuh sur la sonde
(Depuis le dashboard Wazuh : *Agents → Deploy new agent*, ou en ligne de commande selon la doc Wazuh pour votre OS.)

### Étape A2 : Dire à l'agent de lire le fichier JSON de Snort

Éditer `/var/ossec/etc/ossec.conf` sur la machine où tourne Snort, dans la section `<ossec_config>` :

```xml
<localfile>
  <log_format>json</log_format>
  <location>/var/log/snort/alert_json.txt</location>
</localfile>
```

- `<log_format>json</log_format>` : Wazuh utilise son **décodeur JSON natif** → chaque champ JSON devient un champ exploitable.
- `<location>` : chemin exact du fichier produit par `alert_json`.

### Étape A3 : Redémarrer l'agent
```bash
sudo systemctl restart wazuh-agent
```

### Étape A4 : (Option) Règles de corrélation personnalisées

Wazuh embarque déjà des décodeurs/règles IDS (`0285-snort_decoders.xml`, `0240-ids_rules.xml`), **mais** ils ciblent surtout le format texte de Snort 2. Avec le JSON de Snort 3, les champs arrivent déjà décodés ; on écrit alors des **règles de niveau** sur ces champs.

Exemple dans `/var/ossec/etc/rules/local_rules.xml` (côté **Manager**) :
```xml
<group name="snort3,ids,">

  <!-- Règle de base : tout événement Snort 3 JSON -->
  <rule id="100200" level="3">
    <decoded_as>json</decoded_as>
    <field name="sid">\.+</field>
    <field name="msg">\.+</field>
    <description>Snort3: $(msg)</description>
  </rule>

  <!-- Élévation : priorité 1 = alerte haute -->
  <rule id="100201" level="10">
    <if_sid>100200</if_sid>
    <field name="priority">^1$</field>
    <description>Snort3 ALERTE HAUTE: $(msg) [$(src_addr) -> $(dst_addr)]</description>
    <group>attack,</group>
  </rule>

</group>
```
Redémarrer le manager :
```bash
sudo systemctl restart wazuh-manager
```

> ⚠️ Point d'attention connu : les décodeurs Snort **historiques** de Wazuh parsent mal la sortie **texte** de Snort 3. C'est précisément pourquoi on privilégie **`alert_json`** + décodeur JSON.

### Étape A5 : Visualiser
Dans le **Wazuh Dashboard** → *Threat Hunting* / *Security Events*, filtrer sur `rule.groups: snort3` ou `data.msg: *`. Les alertes Snort apparaissent avec leurs champs (src/dst, sid, msg, priorité...).

---

## 5. Partie B : Intégration avec ELK (Elastic Stack)

Deux approches possibles.

### Approche 1 : Filebeat + module/ingest (simple)
```
Snort alert_json.txt ──▶ Filebeat ──▶ Elasticsearch ──▶ Kibana
```

1. Installer **Filebeat** sur la sonde.
2. Configurer une entrée `filestream` dans `/etc/filebeat/filebeat.yml` :
```yaml
filebeat.inputs:
  - type: filestream
    id: snort3-json
    paths:
      - /var/log/snort/alert_json.txt
    parsers:
      - ndjson:
          target: "snort"
          add_error_key: true

output.elasticsearch:
  hosts: ["https://elastic-host:9200"]
  username: "elastic"
  password: "..."
```
3. Démarrer Filebeat :
```bash
sudo systemctl enable --now filebeat
```
4. Dans **Kibana** : créer un *data view* sur l'index `filebeat-*` et explorer les champs `snort.*`.

### Approche 2 : Logstash (parsing/enrichissement avancé)
```
Snort JSON ──▶ Filebeat ──▶ Logstash (filtres) ──▶ Elasticsearch ──▶ Kibana
```
Pipeline Logstash `/etc/logstash/conf.d/snort.conf` :
```ruby
input {
  beats { port => 5044 }
}
filter {
  json { source => "message" }
  geoip { source => "src_addr" target => "src_geo" }
  date  { match => ["timestamp", "MM/dd-HH:mm:ss.SSSSSS"] }
}
output {
  elasticsearch {
    hosts => ["https://elastic-host:9200"]
    index => "snort3-%{+YYYY.MM.dd}"
  }
}
```
Logstash permet d'ajouter **géolocalisation IP**, enrichissement threat-intel, normalisation ECS, etc.

> **Note** : Elastic fournit aussi une intégration **Suricata** clé-en-main (EVE JSON). Pour Snort 3, on passe par du JSON générique (ndjson) comme ci-dessus.

---

## 6. Vérification & dépannage

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| Fichier `alert_json.txt` vide | Aucune règle ne matche / mauvais `-A` | Ajouter une règle de test (ICMP), vérifier `-A alert_json` |
| Agent Wazuh n'envoie rien | Mauvais `<location>` ou droits | Vérifier le chemin, `chmod`/`chown` lisible par `wazuh` |
| Manager ne décode pas | Format non JSON | Confirmer `<log_format>json</log_format>` |
| Champs absents dans Kibana | Parser ndjson mal configuré | Vérifier `parsers: ndjson` dans Filebeat |
| Pas d'événement live | Interface/offloads | `ethtool -K eth0 gro off lro off`, mode promisc |

**Commandes utiles :**
```bash
# Voir les logs de l'agent Wazuh
sudo tail -f /var/ossec/logs/ossec.log

# Tester le décodage d'un log avec l'outil Wazuh
/var/ossec/bin/wazuh-logtest

# Vérifier que Filebeat lit bien
sudo filebeat test output
```

---

## 7. Corrélation dans le contexte hybride

C'est ici que le SIEM devient le **cerveau de l'IDS hybride** :

```
   Snort 3 (signatures) ─────┐
                             ├──▶  SIEM (Wazuh / ELK)  ──▶  Corrélation
   Zeek (logs/flux) ─────────┤          │                   + dashboard
                             │          ▼                   + alerting
   Module ML (anomalie) ─────┘   Règles de corrélation
   Logs hôtes (agents) ──────┘   (ex: "anomalie ML + alerte
                                  Snort sur même IP en <5 min
                                  → incident critique")
```

**Exemples de corrélation à forte valeur :**
- Alerte Snort (signature connue) **+** score d'anomalie ML élevé sur la même IP source → **incident confirmé, priorité max**.
- Balayage détecté par `detection_filter` Snort **+** connexions sortantes inhabituelles vues par Zeek → **latéralisation possible**.
- Alerte réseau Snort **+** modification de fichier critique (FIM Wazuh) sur l'hôte cible → **compromission probable**.

Cette couche de corrélation est ce qui **réduit les faux positifs** individuels et transforme des signaux isolés en incidents actionnables.

---

## 8. Sources

- [Snort 3 Docs, Alert Logging](https://docs.snort.org/start/alert_logging)
- [GitHub, jncornett/alert_json (JSON alerter pour Snort 3)](https://github.com/jncornett/alert_json)
- [Wazuh Docs, JSON decoder](https://documentation.wazuh.com/current/user-manual/ruleset/decoders/json-decoder.html)
- [Wazuh Docs, Integrate Network IDS (Suricata), modèle transposable](https://documentation.wazuh.com/current/proof-of-concept-guide/integrate-network-ids-suricata.html)
- [Medium, From Detection to Visibility: Integrating Snort IDS Alerts into Wazuh SIEM](https://enescayvarli.medium.com/from-detection-to-visibility-integrating-snort-ids-alerts-into-wazuh-siem-9330fa8bcd28)
- [Elastic Docs, Suricata integration (EVE JSON, référence)](https://www.elastic.co/docs/reference/integrations/suricata)
- [Graylog, Snort 3 IDS Content Pack](https://go2docs.graylog.org/illuminate-current/content_packs/snort_ids_processing_security_content_pack.htm)
- [GitHub, NDietrich/Splunk-Snort3-TA](https://github.com/NDietrich/Splunk-Snort3-TA)
- [Noah Dietrich, Snort 3 on Ubuntu: Full NIDS & SIEM (PDF)](https://snort-org-site.s3.amazonaws.com/production/document_files/files/000/012/147/original/Snort_3.1.8.0_on_Ubuntu_18_and_20.pdf)
