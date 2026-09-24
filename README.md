# Projet ids-hybride : Documentation

> Système de détection d'intrusion **hybride** : détection par signatures (Snort/Suricata) + détection d'anomalies (ML), corrélées dans un SIEM.

## 📚 Documents de recherche

| Fichier | Contenu |
|---------|---------|
| [recherche-snort.md](./recherche-snort.md) | **Recherche approfondie sur Snort et son écosystème** : histoire, architecture interne, Snort 2 vs 3, DAQ, inspectors, langage de règles, rulesets, OpenAppID, Barnyard2, frontends, produits embarquant Snort (Cisco/pfSense...), Snort vs Suricata, limites & évasion. |
| [guide-01-installation-snort3.md](./guide-01-installation-snort3.md) | **Installation & configuration de Snort 3 sur Ubuntu** : dépendances, libDAQ, compilation, snort.lua, HOME_NET, service systemd, tuning perf. |
| [guide-02-regles-snort3.md](./guide-02-regles-snort3.md) | **Écriture de règles Snort 3** : anatomie, header, content, modificateurs, sticky buffers, PCRE, flowbits, detection_filter, exemples complets, tests. |
| [guide-03-integration-wazuh-elk.md](./guide-03-integration-wazuh-elk.md) | **Intégration Snort → Wazuh & ELK** : sortie JSON, agent Wazuh, décodeurs, Filebeat/Logstash, dashboards, corrélation hybride. |
| [guide-04-dashboard.md](./guide-04-dashboard.md) | **Dashboard web (FastAPI + React)** pour piloter Snort : règles, alertes, service, config. Architecture, démarrage, API. |

## 🖥️ Dashboard

Une interface graphique de pilotage de Snort est incluse (`backend/` + `frontend/`).

```powershell
# Démarrage rapide (Windows, mode mock)
.\start-dev.ps1
# → Dashboard : http://localhost:5173   ·   API : http://127.0.0.1:8000/docs
```

Voir [guide-04-dashboard.md](./guide-04-dashboard.md) pour les détails.

## 🏗️ Architecture cible

```
   Trafic réseau ──▶ Snort 3 (signatures) ──┐
                                            ├──▶ SIEM (Wazuh/ELK) ──▶ Dashboard
   Trafic réseau ──▶ Zeek (features) ───────┤        corrélation      + alerting
                                            │
   Flux ──────────▶ Module ML (anomalie) ───┘
   Hôtes ─────────▶ Agents Wazuh (FIM/logs)─┘
```

## 🧩 Stack open source retenue

- **Snort 3**, moteur de détection par signatures (règles Talos/Emerging Threats).
- **Zeek**, extraction de features réseau riches + visibilité trafic chiffré.
- **Module ML (Python)**, Isolation Forest / autoencoder, entraîné sur CIC-IDS2017.
- **Wazuh**, HIDS + SIEM + corrélation + dashboard (ingère le JSON de Snort).

## 🗺️ Prochaines étapes suggérées

1. Monter un lab (VM/Docker) avec Snort 3 selon le guide 01.
2. Écrire quelques règles de test (guide 02) et valider sur PCAP.
3. Brancher la sortie JSON vers Wazuh (guide 03).
4. Développer le module ML d'anomalie et le connecter au SIEM.
5. Écrire les règles de corrélation signature + anomalie.
