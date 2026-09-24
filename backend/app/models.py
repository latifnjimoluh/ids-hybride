"""Schémas Pydantic partagés entre les contrôleurs et l'API."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

# --------------------------------------------------------------------------- #
# Règles
# --------------------------------------------------------------------------- #


class Rule(BaseModel):
    """Représentation unifiée d'une règle Snort (mock et Linux identiques)."""

    sid: int
    enabled: bool = True
    action: str = "alert"
    proto: str = "ip"
    msg: str = ""
    classtype: Optional[str] = None
    rev: int = 1
    raw: str = Field(..., description="Ligne de règle Snort complète")


class RuleCreate(BaseModel):
    """Payload de création d'une règle. `raw` prime si fourni, sinon on
    construit la règle à partir des champs individuels."""

    raw: Optional[str] = None
    action: str = "alert"
    proto: str = "tcp"
    source: str = "$EXTERNAL_NET"
    sport: str = "any"
    direction: str = "->"
    dest: str = "$HOME_NET"
    dport: str = "any"
    msg: str = "Custom rule"
    sid: Optional[int] = None
    enabled: bool = True


class RuleToggle(BaseModel):
    enabled: bool


class ValidationResult(BaseModel):
    ok: bool
    output: str = ""


# --------------------------------------------------------------------------- #
# Alertes
# --------------------------------------------------------------------------- #


class Alert(BaseModel):
    timestamp: datetime
    msg: str = ""
    priority: int = 3
    proto: str = ""
    src_addr: str = ""
    src_port: Optional[int] = None
    dst_addr: str = ""
    dst_port: Optional[int] = None
    sid: Optional[int] = None
    classtype: str = ""
    action: str = ""


class AlertStats(BaseModel):
    total: int
    by_priority: dict[int, int]
    by_signature: list[dict]
    by_src: list[dict]
    timeline: list[dict]


# --------------------------------------------------------------------------- #
# Service
# --------------------------------------------------------------------------- #


class ServiceStatus(BaseModel):
    running: bool
    backend: str
    version: str = ""
    interface: str = ""
    uptime_seconds: Optional[int] = None
    pid: Optional[int] = None
    packets_analyzed: Optional[int] = None
    packets_dropped: Optional[int] = None


class ServiceAction(BaseModel):
    action: Literal["start", "stop", "restart"]
    # Options d'exécution optionnelles (appliquées au démarrage)
    mode: Optional[Literal["ids", "ips", "sniffer"]] = None
    interface: Optional[str] = None
    daq: Optional[str] = None
    alert_mode: Optional[str] = None
    tweak: Optional[str] = None


# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #


class SnortConfig(BaseModel):
    home_net: str = "192.168.1.0/24"
    external_net: str = "!$HOME_NET"
    interface: str = "eth0"
    tweak_profile: Literal["none", "connectivity", "balanced", "security", "max_detect"] = "balanced"
    rules_path: str = ""
    alert_json_enabled: bool = True


class RawConfig(BaseModel):
    content: str
    path: str = ""


# --------------------------------------------------------------------------- #
# Système (introspection Snort : snort -V, --list-*, interfaces, DAQ)
# --------------------------------------------------------------------------- #


class SystemInfo(BaseModel):
    version: str = ""
    build: str = ""
    backend: str = ""
    inspectors: int = 0
    codecs: int = 0
    loggers: int = 0
    total_plugins: int = 0
    daq_modules: int = 0
    lua_version: str = ""
    pcre_version: str = ""
    hyperscan: bool = False


class NetworkInterface(BaseModel):
    name: str
    description: str = ""
    up: bool = True
    addresses: list[str] = []


class DaqModule(BaseModel):
    name: str
    mode: str = ""  # passive / inline / read-file
    description: str = ""
    version: str = ""


class Plugin(BaseModel):
    name: str
    type: str = ""  # inspector / codec / logger / ips_action / ips_option ...
    help: str = ""


# --------------------------------------------------------------------------- #
# Analyse PCAP
# --------------------------------------------------------------------------- #


class PcapSummary(BaseModel):
    id: str
    filename: str
    size_bytes: int
    analyzed_at: datetime
    alert_count: int


class PcapResult(BaseModel):
    id: str
    filename: str
    size_bytes: int
    analyzed_at: datetime
    alerts: list[Alert] = []
    stats: dict = {}
    output: str = ""


# --------------------------------------------------------------------------- #
# Logs & Console
# --------------------------------------------------------------------------- #


class LogsResponse(BaseModel):
    lines: list[str] = []
    source: str = ""


class ConsoleResult(BaseModel):
    command: str
    output: str
    returncode: int = 0
    ok: bool = True


class ConsoleCommand(BaseModel):
    command: str


# --------------------------------------------------------------------------- #
# Catégories de règles & import de rulesets
# --------------------------------------------------------------------------- #


class RuleCategory(BaseModel):
    name: str
    total: int
    enabled: int


class RulesetImport(BaseModel):
    name: str  # community / emerging-threats / ...


class ImportResult(BaseModel):
    imported: int
    message: str


# --------------------------------------------------------------------------- #
# Options d'exécution du service (mode, interface, DAQ, mode d'alerte)
# --------------------------------------------------------------------------- #


class RunOptions(BaseModel):
    modes: list[str] = ["ids", "ips", "sniffer"]
    daqs: list[str] = ["pcap", "afpacket", "nfq", "dump"]
    alert_modes: list[str] = ["alert_json", "alert_fast", "alert_full", "alert_csv"]
    tweaks: list[str] = ["none", "connectivity", "balanced", "security", "max_detect"]
