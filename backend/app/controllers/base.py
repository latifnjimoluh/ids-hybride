"""Interface abstraite d'un contrôleur Snort.

Toute la logique de l'API passe par ce contrat. Les implémentations
concrètes (mock, linux) le respectent, ce qui rend le frontend
indépendant de l'environnement d'exécution.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from ..models import (
    Alert,
    AlertStats,
    ConsoleResult,
    DaqModule,
    ImportResult,
    LogsResponse,
    NetworkInterface,
    PcapResult,
    PcapSummary,
    Plugin,
    Rule,
    RuleCategory,
    RuleCreate,
    ServiceStatus,
    SnortConfig,
    SystemInfo,
    ValidationResult,
)


class SnortController(ABC):
    """Contrat commun mock/linux."""

    # --- Règles ---
    @abstractmethod
    def list_rules(self) -> list[Rule]: ...

    @abstractmethod
    def create_rule(self, payload: RuleCreate) -> Rule: ...

    @abstractmethod
    def update_rule(self, sid: int, raw: str) -> Rule: ...

    @abstractmethod
    def toggle_rule(self, sid: int, enabled: bool) -> Rule: ...

    @abstractmethod
    def delete_rule(self, sid: int) -> None: ...

    @abstractmethod
    def validate_rules(self) -> ValidationResult: ...

    # --- Alertes ---
    @abstractmethod
    def list_alerts(self, limit: int = 200) -> list[Alert]: ...

    @abstractmethod
    def alert_stats(self) -> AlertStats: ...

    @abstractmethod
    def new_alerts(self) -> list[Alert]:
        """Alertes apparues depuis le dernier appel (flux temps réel / WebSocket)."""
        ...

    # --- Service ---
    @abstractmethod
    def service_status(self) -> ServiceStatus: ...

    @abstractmethod
    def service_action(self, action: str, options: dict | None = None) -> ServiceStatus: ...

    # --- Configuration ---
    @abstractmethod
    def get_config(self) -> SnortConfig: ...

    @abstractmethod
    def update_config(self, cfg: SnortConfig) -> SnortConfig: ...

    @abstractmethod
    def read_raw_config(self) -> tuple[str, str]:
        """Retourne (contenu, chemin) du fichier snort.lua."""
        ...

    @abstractmethod
    def write_raw_config(self, content: str) -> None: ...

    # --- Catégories de règles & import ---
    @abstractmethod
    def rule_categories(self) -> list[RuleCategory]: ...

    @abstractmethod
    def import_ruleset(self, name: str) -> ImportResult: ...

    # --- Système / introspection ---
    @abstractmethod
    def system_info(self) -> SystemInfo: ...

    @abstractmethod
    def list_interfaces(self) -> list[NetworkInterface]: ...

    @abstractmethod
    def list_daqs(self) -> list[DaqModule]: ...

    @abstractmethod
    def list_plugins(self, kind: str = "") -> list[Plugin]: ...

    # --- Analyse PCAP ---
    @abstractmethod
    def analyze_pcap(self, filename: str, data: bytes) -> PcapResult: ...

    @abstractmethod
    def list_pcaps(self) -> list[PcapSummary]: ...

    @abstractmethod
    def get_pcap_result(self, pcap_id: str) -> PcapResult: ...

    # --- Logs & console ---
    @abstractmethod
    def tail_logs(self, lines: int = 200) -> LogsResponse: ...

    @abstractmethod
    def run_console(self, command: str) -> ConsoleResult: ...
