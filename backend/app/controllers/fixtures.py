"""Données simulées pour le mode mock : sorties CLI Snort crédibles,
template snort.lua, listes de plugins/DAQ/interfaces.

Elles reproduisent le format réel de Snort 3 pour que le dashboard se
comporte comme face à une vraie sonde, sans Snort installé.
"""

from __future__ import annotations

SNORT_VERSION = "3.1.82.0"

# Template minimal mais réaliste de snort.lua
SNORT_LUA = """\
---------------------------------------------------------------------------
-- snort.lua, configuration de base (projet ids-hybride, mode mock)
---------------------------------------------------------------------------

HOME_NET = '192.168.1.0/24'
EXTERNAL_NET = '!$HOME_NET'

HTTP_PORTS = '80 81 311 443 591 593 901 8080 8081'
SSH_PORTS = '22'
DNS_SERVERS = HOME_NET

---------------------------------------------------------------------------
-- 1. Inspecteurs (ex-preprocessors)
---------------------------------------------------------------------------
stream = { }
stream_ip = { }
stream_tcp = { }
stream_udp = { }
http_inspect = { }
normalizer = { }

---------------------------------------------------------------------------
-- 2. Détection (règles)
---------------------------------------------------------------------------
ips =
{
    mode = tap,
    variables = default_variables,
    rules = [[
        include $RULE_PATH/local.rules
    ]],
}

---------------------------------------------------------------------------
-- 3. Sorties
---------------------------------------------------------------------------
alert_json =
{
    file = true,
    limit = 100,
    fields = 'timestamp action class msg priority proto src_addr src_port \
              dst_addr dst_port service rule sid gid rev dir',
}
"""

# snort -V
def version_banner() -> str:
    return f"""\
   ,,_     -*> Snort++ <*-
  o"  )~   Version {SNORT_VERSION}
   ''''    By Martin Roesch & The Snort Team
           http://snort.org/contact#team
           Copyright (C) 2014-2025 Cisco and/or its affiliates.
           Copyright (C) 1998-2013 Sourcefire, Inc., et al.
           Using DAQ version 3.0.14
           Using LuaJIT version 2.1.0
           Using OpenSSL 3.0.2
           Using libpcap version 1.10.1
           Using PCRE version 8.39
           Using ZLIB version 1.2.11
           Using Hyperscan version 5.4.0
"""

# Interfaces réseau simulées
INTERFACES = [
    {"name": "eth0", "description": "Interface Ethernet principale", "up": True, "addresses": ["192.168.1.10/24"]},
    {"name": "eth1", "description": "Interface de capture (SPAN/TAP)", "up": True, "addresses": []},
    {"name": "lo", "description": "Loopback", "up": True, "addresses": ["127.0.0.1/8"]},
    {"name": "wlan0", "description": "Interface Wi-Fi", "up": False, "addresses": []},
]

# Modules DAQ (snort --daq-list)
DAQS = [
    {"name": "pcap", "mode": "passive/read-file", "description": "Capture via libpcap (IDS passif)", "version": "1.0.0"},
    {"name": "afpacket", "mode": "passive/inline", "description": "AF_PACKET, bridging inline sans routage IP", "version": "1.0.0"},
    {"name": "nfq", "mode": "inline", "description": "NFQUEUE, inline via iptables", "version": "1.0.0"},
    {"name": "dump", "mode": "inline/passive", "description": "Écrit les paquets (test des politiques IPS)", "version": "1.0.0"},
    {"name": "trace", "mode": "read-file", "description": "Trace de débogage des paquets", "version": "1.0.0"},
]

# Plugins (snort --list-plugins), échantillon représentatif par type
PLUGINS = {
    "inspector": [
        ("stream", "Suivi de session / réassemblage global"),
        ("stream_tcp", "Réassemblage TCP"),
        ("stream_udp", "Suivi UDP"),
        ("stream_ip", "Défragmentation IP"),
        ("http_inspect", "Inspection et normalisation HTTP"),
        ("dns", "Inspection DNS"),
        ("ftp_server", "Inspection FTP"),
        ("ssh", "Inspection SSH"),
        ("smtp", "Inspection SMTP"),
        ("normalizer", "Normalisation des protocoles (anti-évasion)"),
        ("appid", "Identification applicative (OpenAppID)"),
        ("port_scan", "Détection de balayage de ports"),
        ("binder", "Association trafic → inspecteurs"),
    ],
    "codec": [
        ("eth", "Décodage Ethernet"),
        ("ipv4", "Décodage IPv4"),
        ("ipv6", "Décodage IPv6"),
        ("tcp", "Décodage TCP"),
        ("udp", "Décodage UDP"),
        ("icmp4", "Décodage ICMPv4"),
        ("vlan", "Décodage VLAN 802.1Q"),
    ],
    "logger": [
        ("alert_json", "Alertes au format JSON (SIEM)"),
        ("alert_fast", "Alertes concises une ligne"),
        ("alert_full", "Alertes détaillées"),
        ("alert_csv", "Alertes CSV"),
        ("alert_syslog", "Alertes vers syslog"),
        ("unified2", "Sortie binaire unified2 (Barnyard2)"),
    ],
    "ips_action": [
        ("alert", "Générer une alerte"),
        ("block", "Bloquer le flux (IPS)"),
        ("drop", "Rejeter le paquet (IPS)"),
        ("reject", "Rejeter + TCP reset/ICMP unreachable"),
    ],
    "ips_option": [
        ("content", "Recherche de contenu"),
        ("pcre", "Expression régulière PCRE"),
        ("flow", "Contexte de session"),
        ("flowbits", "Drapeaux d'état de session"),
        ("http_uri", "Sticky buffer URI HTTP"),
        ("detection_filter", "Seuil d'occurrences"),
    ],
}

# Règles "community" simulées ajoutées lors d'un import de ruleset
COMMUNITY_RULES = [
    'alert tcp $EXTERNAL_NET any -> $HOME_NET 3389 ( msg:"[Community] Tentative de connexion RDP externe"; flow:to_server; classtype:attempted-recon; sid:2100001; rev:1; )',
    'alert tcp $HOME_NET any -> $EXTERNAL_NET 4444 ( msg:"[Community] Trafic Metasploit par défaut (port 4444)"; flow:to_server,established; classtype:trojan-activity; sid:2100002; rev:1; )',
    'alert udp $EXTERNAL_NET any -> $HOME_NET 53 ( msg:"[Community] Requête DNS de longueur anormale (tunneling)"; dsize:>300; classtype:policy-violation; sid:2100003; rev:1; )',
    'alert icmp $EXTERNAL_NET any -> $HOME_NET any ( msg:"[Community] Balayage ICMP (ping sweep)"; itype:8; detection_filter:track by_src,count 10,seconds 30; classtype:attempted-recon; sid:2100004; rev:1; )',
    'alert http $EXTERNAL_NET any -> $HOME_NET any ( msg:"[Community] Shell web générique (cmd=)"; flow:to_server,established; http_uri; content:"cmd=",nocase; classtype:web-application-attack; sid:2100005; rev:1; )',
]

EMERGING_RULES = [
    'alert http $EXTERNAL_NET any -> $HOME_NET any ( msg:"[ET] Scanner Nikto détecté"; flow:to_server,established; http_header:field user-agent; content:"Nikto",nocase; classtype:web-application-attack; sid:2200001; rev:1; )',
    'alert tcp $HOME_NET any -> $EXTERNAL_NET any ( msg:"[ET] Balise C2 potentielle (User-Agent suspect)"; flow:to_server,established; content:"User-Agent|3a 20|Mozilla/4.0"; classtype:trojan-activity; sid:2200002; rev:1; )',
    'alert tls $EXTERNAL_NET any -> $HOME_NET any ( msg:"[ET] Certificat auto-signé suspect"; flow:established; classtype:bad-unknown; sid:2200003; rev:1; )',
]

RULESETS = {
    "community": COMMUNITY_RULES,
    "emerging-threats": EMERGING_RULES,
}


def console_help() -> str:
    return """\
Commandes autorisées dans la console (introspection Snort, lecture seule) :

  snort -V                     Affiche la version et les bibliothèques
  snort --version              Idem
  snort --daq-list             Liste les modules DAQ disponibles
  snort --list-interfaces      Liste les interfaces réseau
  snort --list-plugins         Liste tous les plugins
  snort --show-plugins         Détaille les plugins chargés
  snort --list-gids            Liste les Generator IDs
  snort --list-builtin         Liste les règles intégrées
  snort --help                 Aide générale
  snort --help-config          Options de configuration
  snort --help-module <nom>    Aide sur un module (ex: http_inspect)
  snort -c snort.lua -T        Valide la configuration

Les commandes de capture live / modification sont désactivées ici :
utilisez les pages « Service » et « Configuration » pour cela.
"""
