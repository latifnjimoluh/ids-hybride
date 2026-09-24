# Les IDS open source : panorama complet

> Document de recherche pour le projet **ids-hybride**
> Objet : cartographier les systèmes de détection d'intrusion open source (familles, moteurs NIDS et HIDS, approche hybride, jeux de données pour le machine learning) afin de choisir une stack cohérente.

---

## Table des matières

1. [Qu'est-ce qu'un IDS et les grandes familles](#1-quest-ce-quun-ids-et-les-grandes-familles)
2. [Les moteurs NIDS open source majeurs](#2-les-moteurs-nids-open-source-majeurs)
3. [Les HIDS open source majeurs](#3-les-hids-open-source-majeurs)
4. [L'approche hybride](#4-lapproche-hybride)
5. [Jeux de données pour la partie machine learning](#5-jeux-de-données-pour-la-partie-machine-learning)
6. [Recommandations pour ids-hybride](#6-recommandations-pour-ids-hybride)
7. [Sources](#7-sources)

---

## 1. Qu'est-ce qu'un IDS et les grandes familles

Un **IDS (Intrusion Detection System)** surveille le trafic réseau ou l'activité d'un système afin de détecter des comportements malveillants. On le classe selon deux axes.

### Selon l'emplacement de la surveillance

- **NIDS (Network-based)** : analyse le trafic réseau (paquets, flux). Exemples : Snort, Suricata, Zeek.
- **HIDS (Host-based)** : analyse ce qui se passe sur une machine (logs, intégrité des fichiers, processus, rootkits). Exemples : Wazuh, OSSEC.

### Selon la méthode de détection

- **Par signatures** : compare le trafic à une base de motifs d'attaques connues. Rapide et précis sur le connu, mais aveugle aux attaques zero-day.
- **Par anomalie** : modélise le comportement « normal » et signale les écarts. Capable de détecter l'inconnu, mais génère davantage de faux positifs.
- **Hybride** : combine les deux approches. C'est le cœur du projet (voir section 4).

> **IDS contre IPS** : un IDS détecte et alerte ; un IPS (Intrusion Prevention System) peut en plus bloquer le trafic. Suricata et Snort savent fonctionner dans les deux modes.

---

## 2. Les moteurs NIDS open source majeurs

### Snort

- Le pionnier (1998), à l'origine du mouvement IDS open source. Détection par signatures.
- **Forces** : maturité, documentation abondante, très grande communauté, base de règles riche (Talos/Cisco).
- **Limites** : longtemps mono-thread (Snort 3 a corrigé cela), gourmand, purement signature (rate les zero-days).
- Voir le document dédié [recherche-snort.md](./recherche-snort.md) pour un approfondissement complet.

### Suricata (recommandé pour un projet hybride)

- Apparu en 2010, conçu pour les réseaux haut débit. Architecture **multi-thread** (exploite plusieurs cœurs CPU).
- IDS, IPS et NSM dans un seul moteur. Compatible avec les règles Snort.
- Détection avancée des protocoles, extraction de fichiers, sortie **EVE JSON** idéale pour l'intégration SIEM et ML.
- **Limites** : courbe d'apprentissage plus raide, consommation de ressources plus élevée.

### Zeek (ex-Bro)

- Approche différente : ce n'est pas un moteur de signatures mais un **Network Security Monitor**. Il produit des logs riches et structurés de toute l'activité réseau, analysables via des scripts.
- Excellent pour l'analyse du trafic chiffré (métadonnées TLS, empreintes JA3 pour repérer du malware sur HTTPS).
- Très utilisé comme source de features pour le machine learning.

> **Tendance 2026** : le duo **Suricata + Zeek** est souvent recommandé plutôt qu'un choix unique. Suricata assure la détection par signature et l'IPS, Zeek apporte la visibilité fine et alimente les modèles ML. Bon rapport performance/consommation, même sur du matériel ARM (Raspberry Pi 5).

---

## 3. Les HIDS open source majeurs

### OSSEC

- L'un des plus anciens HIDS : analyse de logs, contrôle d'intégrité des fichiers (FIM), détection de rootkits, réponse active.
- Léger, idéal quand on ne veut pas déployer un SIEM complet.
- **Limite** : pas d'interface centrale native, mises à jour peu fréquentes (dernière version stable 3.8.0, janvier 2021).

### Wazuh (recommandé comme couche centrale)

- **Fork d'OSSEC (2015)** devenu une plateforme complète (HIDS, SIEM, XDR), considérée comme le SIEM open source le plus complet en 2026 (dernière version stable 4.12.0, mai 2025).
- Fonctions : FIM, détection de vulnérabilités (scan CVE), évaluation de configuration (benchmarks CIS), détection de malware, monitoring cloud.
- Dashboard basé sur OpenSearch, corrélation d'événements centralisée.
- Sait ingérer les logs Suricata (`eve.json`) et Snort (`alert_json`), ce qui en fait le pont naturel pour un IDS hybride.

---

## 4. L'approche hybride

Un **IDS hybride** combine détection par signatures et par anomalie pour attraper à la fois le connu et l'inconnu, tout en réduisant les faux positifs. Deux façons de le construire.

### Approche A : assemblage d'outils existants (pragmatique, orientée SOC)

```
        ┌─────────────┐     eve.json / json   ┌──────────────┐
Réseau ─┤  Suricata   ├──────────────────────▶│              │
        │ (signature) │                        │    Wazuh     │──▶ Dashboard
        └─────────────┘                        │ (HIDS+SIEM,  │    OpenSearch
        ┌─────────────┐     logs               │  corrélation)│
Réseau ─┤    Zeek     ├──────────────────────▶│              │
        │ (features)  │                        └──────┬───────┘
        └─────────────┘                               │
Hôtes ──▶ Agents Wazuh (FIM, logs, CVE) ──────────────┘
                                                       │
                          ┌────────────────────────────▼────────────┐
                          │  Module ML / anomalie (Python)           │
                          │  Isolation Forest, autoencoder, etc.     │
                          └──────────────────────────────────────────┘
```

- Suricata et Zeek transmettent leurs logs vers Wazuh (via `eve.json` ou syslog, port 514).
- Un module ML consomme les flux (features réseau) et ajoute la détection d'anomalies.
- Option : ajouter un honeypot pour la défense par déception.

### Approche B : pipeline ML « from scratch » (académique, R&D)

- **IDS-ML / MTH-IDS** : implémentation open source de référence d'un IDS hybride qui combine un IDS par signatures (arbres de décision, XGBoost, optimisé par Bayesian Optimization) et un IDS par anomalie (k-means cluster labeling et classifieurs biaisés pour isoler l'inconnu). Dépôt GitHub : `Western-OC2-Lab/Intrusion-Detection-System-Using-Machine-Learning`.
- Combinaison courante : **Isolation Forest** (anomalie) associé à des règles prédéfinies (signature).
- **Deep learning** (CNN, autoencoders, LSTM) branché en aval de Snort/Suricata/Zeek, souvent avec du SDN pour la flexibilité.

---

## 5. Jeux de données pour la partie machine learning

| Dataset | Année | Attaques | Particularités |
|---------|-------|----------|----------------|
| **NSL-KDD** | ~2009 | DoS, U2R, R2L, Probe | Version nettoyée de KDD'99 (doublons retirés). Classique mais daté. Répartition assez équilibrée (43/57). |
| **UNSW-NB15** | 2015 | 9 familles (Fuzzers, DoS, Backdoors, Worms, Reconnaissance, Shellcode, etc.) | Alternative moderne à KDD. Fortement déséquilibré (93/7). |
| **CIC-IDS2017** | 2017 | 14 types + BENIGN | 78 features de flux (durée, taille des paquets, etc.), fourni en CSV. Très utilisé pour ML/DL. |
| **CIC-IDS2018** | 2018 | idem, à plus grande échelle | Déséquilibre modéré (72/28). |

> ⚠️ Le **déséquilibre de classes** est le défi majeur. Techniques utiles : oversampling (SMOTE), feature embedding/extraction, approches cost-sensitive. Les études récentes atteignent environ 98 % de précision sur UNSW-NB15 et environ 97 % sur NSL-KDD.

---

## 6. Recommandations pour ids-hybride

Pour un projet de formation efficace et démontrable, stack open source suggérée :

1. **Suricata** : moteur de détection par signatures, sortie EVE JSON.
2. **Zeek** : extraction de features réseau riches pour le ML.
3. **Module ML Python** : scikit-learn (Isolation Forest, Random Forest) ou PyTorch (autoencoder), entraîné sur CIC-IDS2017.
4. **Wazuh** : couche HIDS, corrélation et dashboard central (ingère Suricata et Snort).
5. (Bonus) un honeypot léger pour enrichir les données.

Le tout se prototype très bien dans une VM ou des conteneurs Docker, ce qui rend la démonstration reproductible.

> Ce projet inclut par ailleurs **Snort** comme moteur de signatures (voir [recherche-snort.md](./recherche-snort.md) et les guides d'installation, de règles et d'intégration), ainsi qu'un dashboard de pilotage (voir [guide-04-dashboard.md](./guide-04-dashboard.md)).

---

## 7. Sources

- [Suricata vs Zeek (Stamus Networks)](https://www.stamus-networks.com/suricata-vs-zeek)
- [Open Source IDS Tools : Suricata, Snort, Bro/Zeek (AT&T Cybersecurity)](https://cybersecurity.att.com/blogs/security-essentials/open-source-intrusion-detection-tools-a-quick-overview)
- [Zeek vs Suricata 2026 (HookProbe)](https://hookprobe.com/blog/zeek-vs-suricata-network-security-guide/)
- [Top 5 open source HIDS (Logz.io)](https://logz.io/blog/open-source-hids/)
- [Wazuh vs OSSEC 2026 (ethicalhacking.ai)](https://ethicalhacking.ai/compare/wazuh-vs-ossec)
- [IDS-ML : open source ML IDS (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S2665963822001300)
- [GitHub : Intrusion-Detection-System-Using-Machine-Learning](https://github.com/Western-OC2-Lab/Intrusion-Detection-System-Using-Machine-Learning)
- [Hybrid IDS Signature + Anomaly (arXiv)](https://arxiv.org/pdf/2601.11998)
- [Wazuh doc : intégrer Suricata NIDS](https://documentation.wazuh.com/current/proof-of-concept-guide/integrate-network-ids-suricata.html)
- [Hybrid Security Architecture : Suricata + Wazuh + Honeypots (Medium)](https://medium.com/@emadmohammad/a-hybrid-security-architecture-leveraging-suricata-wazuh-and-honeypots-for-comprehensive-threat-27cf40e49438)
- [Benchmarking datasets pour NIDS (arXiv)](https://arxiv.org/pdf/1811.05372)
