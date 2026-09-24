"""Contrôleur Snort réel pour une sonde Linux.

Pilote une vraie instance Snort 3 :
- règles : lecture/écriture de local.rules
- validation : `snort -c snort.lua -T`
- alertes : lecture de alert_json.txt (une ligne JSON par alerte)
- service : systemctl start/stop/restart/status
- config : édition simple des variables HOME_NET/EXTERNAL_NET dans snort.lua

Activé via SNORT_BACKEND=linux. Non utilisé sous Windows.
"""

from __future__ import annotations

import json
import re
import shlex
import subprocess
import tempfile
import threading
import uuid
from collections import Counter
from datetime import datetime
from pathlib import Path

from ..config import settings
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
from ..rule_parser import build_rule, parse_rule, set_enabled
from . import fixtures
from .base import SnortController

# Flags autorisés dans la console (introspection en lecture seule).
_CONSOLE_ALLOWED = {
    "-V", "--version", "--daq-list", "--list-interfaces", "--list-plugins",
    "--show-plugins", "--list-gids", "--list-builtin", "--help", "--help-config",
    "-?", "-h", "--help-module", "-T", "-c", "--list-buffers", "--list-modules",
}


class LinuxSnortController(SnortController):
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._rules = Path(settings.rules_path)
        self._config = Path(settings.config_path)
        self._alerts = Path(settings.alert_json_path)
        # Offset de lecture pour le flux temps réel (tail du fichier)
        self._alert_offset = self._alerts.stat().st_size if self._alerts.exists() else 0
        self._pcaps: dict[str, PcapResult] = {}
        self._run_opts: dict = {}

    # ------------------------------------------------------------------ #
    def _read_lines(self) -> list[str]:
        if not self._rules.exists():
            return []
        return self._rules.read_text(encoding="utf-8").splitlines()

    def _write_lines(self, lines: list[str]) -> None:
        self._rules.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # ------------------------------------------------------------------ #
    # Règles
    # ------------------------------------------------------------------ #
    def list_rules(self) -> list[Rule]:
        with self._lock:
            return [r for line in self._read_lines() if (r := parse_rule(line))]

    def _next_sid(self, lines: list[str]) -> int:
        sids = [r.sid for line in lines if (r := parse_rule(line))]
        return max(sids, default=1000000) + 1

    def create_rule(self, payload: RuleCreate) -> Rule:
        with self._lock:
            lines = self._read_lines()
            sid = payload.sid or self._next_sid(lines)
            if payload.raw:
                raw = payload.raw.strip()
                if "sid:" not in raw:
                    raw = raw.rstrip(") ") + f" sid:{sid}; rev:1; )"
            else:
                raw = build_rule(
                    action=payload.action, proto=payload.proto, source=payload.source,
                    sport=payload.sport, direction=payload.direction, dest=payload.dest,
                    dport=payload.dport, msg=payload.msg, sid=sid,
                )
            line = raw if payload.enabled else f"# {raw}"
            rule = parse_rule(line)
            if rule is None:
                raise ValueError("Règle invalide")
            lines.append(line)
            self._write_lines(lines)
            return rule

    def update_rule(self, sid: int, raw: str) -> Rule:
        with self._lock:
            lines = self._read_lines()
            for i, line in enumerate(lines):
                parsed = parse_rule(line)
                if parsed and parsed.sid == sid:
                    new_line = raw.strip() if parsed.enabled else f"# {raw.strip().lstrip('#').strip()}"
                    updated = parse_rule(new_line)
                    if updated is None:
                        raise ValueError("Règle modifiée invalide")
                    lines[i] = new_line
                    self._write_lines(lines)
                    return updated
        raise KeyError(f"Règle sid={sid} introuvable")

    def toggle_rule(self, sid: int, enabled: bool) -> Rule:
        with self._lock:
            lines = self._read_lines()
            for i, line in enumerate(lines):
                parsed = parse_rule(line)
                if parsed and parsed.sid == sid:
                    lines[i] = set_enabled(parsed.raw, enabled)
                    self._write_lines(lines)
                    return parse_rule(lines[i])  # type: ignore[return-value]
        raise KeyError(f"Règle sid={sid} introuvable")

    def delete_rule(self, sid: int) -> None:
        with self._lock:
            lines = self._read_lines()
            kept = [ln for ln in lines if not ((p := parse_rule(ln)) and p.sid == sid)]
            if len(kept) == len(lines):
                raise KeyError(f"Règle sid={sid} introuvable")
            self._write_lines(kept)

    def validate_rules(self) -> ValidationResult:
        # Test de config Snort : snort -c snort.lua -T
        try:
            proc = subprocess.run(
                [settings.snort_binary, "-c", settings.config_path, "-T"],
                capture_output=True, text=True, timeout=60,
            )
            ok = proc.returncode == 0
            return ValidationResult(ok=ok, output=(proc.stdout + proc.stderr)[-4000:])
        except (subprocess.SubprocessError, FileNotFoundError) as exc:
            return ValidationResult(ok=False, output=f"Erreur d'exécution de Snort : {exc}")

    # ------------------------------------------------------------------ #
    # Alertes
    # ------------------------------------------------------------------ #
    def list_alerts(self, limit: int = 200) -> list[Alert]:
        if not self._alerts.exists():
            return []
        alerts: list[Alert] = []
        # On lit la fin du fichier (les alertes les plus récentes)
        lines = self._alerts.read_text(encoding="utf-8", errors="ignore").splitlines()
        for line in reversed(lines):
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                continue
            alerts.append(self._to_alert(data))
            if len(alerts) >= limit:
                break
        return alerts

    @staticmethod
    def _to_alert(d: dict) -> Alert:
        # Snort peut émettre "seconds" (epoch) ou "timestamp" (MM/dd-HH:mm:ss...)
        ts = datetime.now()
        if "seconds" in d:
            try:
                ts = datetime.fromtimestamp(float(d["seconds"]))
            except (ValueError, OSError):
                pass
        return Alert(
            timestamp=ts, msg=d.get("msg", ""), priority=int(d.get("priority", 3) or 3),
            proto=d.get("proto", ""), src_addr=d.get("src_addr", ""),
            src_port=_int_or_none(d.get("src_port")), dst_addr=d.get("dst_addr", ""),
            dst_port=_int_or_none(d.get("dst_port")), sid=_int_or_none(d.get("sid")),
            classtype=d.get("class", ""), action=d.get("action", ""),
        )

    def new_alerts(self) -> list[Alert]:
        """Lit les lignes ajoutées à alert_json.txt depuis le dernier appel."""
        if not self._alerts.exists():
            return []
        size = self._alerts.stat().st_size
        # Fichier tronqué (rotation) => on repart de zéro
        if size < self._alert_offset:
            self._alert_offset = 0
        if size == self._alert_offset:
            return []
        out: list[Alert] = []
        with self._alerts.open("r", encoding="utf-8", errors="ignore") as fh:
            fh.seek(self._alert_offset)
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    out.append(self._to_alert(json.loads(line)))
                except json.JSONDecodeError:
                    continue
            self._alert_offset = fh.tell()
        return out

    def alert_stats(self) -> AlertStats:
        alerts = self.list_alerts(1000)
        by_prio = Counter(a.priority for a in alerts)
        by_sig = Counter(a.msg for a in alerts)
        by_src = Counter(a.src_addr for a in alerts)
        buckets: Counter = Counter()
        now = datetime.now()
        for a in alerts:
            b = int((now - a.timestamp).total_seconds() // 600)
            if 0 <= b < 12:
                buckets[b] += 1
        timeline = [{"bucket": f"-{b*10}min", "count": buckets.get(b, 0)} for b in range(11, -1, -1)]
        return AlertStats(
            total=len(alerts),
            by_priority={int(k): v for k, v in sorted(by_prio.items())},
            by_signature=[{"msg": m, "count": c} for m, c in by_sig.most_common(8)],
            by_src=[{"src_addr": s, "count": c} for s, c in by_src.most_common(8)],
            timeline=timeline,
        )

    # ------------------------------------------------------------------ #
    # Service (systemctl)
    # ------------------------------------------------------------------ #
    def service_status(self) -> ServiceStatus:
        running = self._systemctl("is-active").strip() == "active"
        version = ""
        try:
            v = subprocess.run([settings.snort_binary, "-V"], capture_output=True, text=True, timeout=10)
            m = re.search(r"Version\s+([\d.]+)", v.stdout + v.stderr)
            version = f"Snort {m.group(1)}" if m else "Snort 3"
        except (subprocess.SubprocessError, FileNotFoundError):
            pass
        return ServiceStatus(
            running=running, backend="linux", version=version, interface=settings.interface,
        )

    def service_action(self, action: str, options: dict | None = None) -> ServiceStatus:
        if action not in ("start", "stop", "restart"):
            raise ValueError("Action invalide")
        if options:
            # Les options d'exécution (mode/DAQ/interface…) sont mémorisées ;
            # leur application effective se fait via le fichier de service systemd
            # ou une surcharge (drop-in), à brancher selon le déploiement.
            self._run_opts = {k: v for k, v in options.items() if v}
        self._systemctl(action)
        return self.service_status()

    @staticmethod
    def _systemctl(cmd: str) -> str:
        try:
            proc = subprocess.run(
                ["systemctl", cmd, settings.service_name],
                capture_output=True, text=True, timeout=30,
            )
            return proc.stdout or proc.stderr
        except (subprocess.SubprocessError, FileNotFoundError) as exc:
            return f"error: {exc}"

    # ------------------------------------------------------------------ #
    # Configuration (édition des variables dans snort.lua)
    # ------------------------------------------------------------------ #
    def get_config(self) -> SnortConfig:
        cfg = SnortConfig(interface=settings.interface, rules_path=settings.rules_path)
        if self._config.exists():
            text = self._config.read_text(encoding="utf-8", errors="ignore")
            if m := re.search(r"HOME_NET\s*=\s*['\"]([^'\"]+)['\"]", text):
                cfg.home_net = m.group(1)
            if m := re.search(r"EXTERNAL_NET\s*=\s*['\"]([^'\"]+)['\"]", text):
                cfg.external_net = m.group(1)
        return cfg

    def update_config(self, cfg: SnortConfig) -> SnortConfig:
        if not self._config.exists():
            raise FileNotFoundError(f"snort.lua introuvable : {settings.config_path}")
        text = self._config.read_text(encoding="utf-8")
        text = re.sub(r"HOME_NET\s*=\s*['\"][^'\"]*['\"]", f"HOME_NET = '{cfg.home_net}'", text)
        text = re.sub(r"EXTERNAL_NET\s*=\s*['\"][^'\"]*['\"]", f"EXTERNAL_NET = '{cfg.external_net}'", text)
        self._config.write_text(text, encoding="utf-8")
        return self.get_config()

    def read_raw_config(self) -> tuple[str, str]:
        if not self._config.exists():
            return "", str(self._config)
        return self._config.read_text(encoding="utf-8", errors="ignore"), str(self._config)

    def write_raw_config(self, content: str) -> None:
        self._config.write_text(content, encoding="utf-8")

    # ------------------------------------------------------------------ #
    # Catégories & import
    # ------------------------------------------------------------------ #
    def rule_categories(self) -> list[RuleCategory]:
        rules = self.list_rules()
        totals: Counter = Counter()
        enabled: Counter = Counter()
        for r in rules:
            cat = r.classtype or "non-classé"
            totals[cat] += 1
            if r.enabled:
                enabled[cat] += 1
        return [RuleCategory(name=c, total=totals[c], enabled=enabled[c]) for c in sorted(totals)]

    def import_ruleset(self, name: str) -> ImportResult:
        rules = fixtures.RULESETS.get(name)
        if rules is None:
            raise ValueError(f"Ruleset inconnu : {name}")
        with self._lock:
            lines = self._read_lines()
            existing = {r.sid for line in lines if (r := parse_rule(line))}
            added = 0
            for raw in rules:
                p = parse_rule(raw)
                if p and p.sid not in existing:
                    lines.append(raw)
                    added += 1
            self._write_lines(lines)
        return ImportResult(imported=added, message=f"{added} règle(s) importée(s) depuis « {name} ».")

    # ------------------------------------------------------------------ #
    # Système / introspection
    # ------------------------------------------------------------------ #
    def system_info(self) -> SystemInfo:
        out = self._snort("-V")
        version = ""
        if m := re.search(r"Version\s+([\d.]+)", out):
            version = f"Snort++ {m.group(1)}"
        return SystemInfo(
            version=version or "Snort 3",
            build=out.strip().splitlines()[0].strip() if out else "",
            backend="linux",
            inspectors=len(self.list_plugins("inspector")),
            codecs=len(self.list_plugins("codec")),
            loggers=len(self.list_plugins("logger")),
            total_plugins=len(self.list_plugins()),
            daq_modules=len(self.list_daqs()),
            lua_version=(re.search(r"LuaJIT version ([\d.]+)", out) or [None, ""])[1] if out else "",
            pcre_version=(re.search(r"PCRE version ([\d.]+)", out) or [None, ""])[1] if out else "",
            hyperscan="Hyperscan" in out,
        )

    def list_interfaces(self) -> list[NetworkInterface]:
        # Lecture depuis /sys/class/net (fiable, sans dépendance)
        net = Path("/sys/class/net")
        out: list[NetworkInterface] = []
        if net.exists():
            for iface in sorted(net.iterdir()):
                try:
                    operstate = (iface / "operstate").read_text().strip()
                except OSError:
                    operstate = "unknown"
                out.append(NetworkInterface(name=iface.name, up=operstate == "up", description=operstate))
        return out

    def list_daqs(self) -> list[DaqModule]:
        out = self._snort("--daq-list")
        daqs: list[DaqModule] = []
        for line in out.splitlines():
            line = line.strip()
            # Format approx : "Module: pcap Version: 1 Type: ..."
            if m := re.match(r"Module:\s*(\S+).*?Version:\s*(\S+)?.*?Type:\s*(.+)?", line):
                daqs.append(DaqModule(name=m.group(1), version=m.group(2) or "", mode=(m.group(3) or "").strip()))
            elif m := re.match(r"(\w+)\s*\(v?([\d.]+)\)", line):
                daqs.append(DaqModule(name=m.group(1), version=m.group(2)))
        return daqs

    def list_plugins(self, kind: str = "") -> list[Plugin]:
        out = self._snort("--list-plugins")
        plugins: list[Plugin] = []
        current = ""
        for line in out.splitlines():
            s = line.strip()
            if s.endswith(":") and " " not in s:
                current = s.rstrip(":").lower()
                continue
            if m := re.match(r"([\w:]+)\s+v?[\d.]*\s*(.*)", s):
                ptype = current or "plugin"
                if kind and kind != ptype:
                    continue
                plugins.append(Plugin(name=m.group(1), type=ptype, help=m.group(2)))
        return plugins

    # ------------------------------------------------------------------ #
    # Analyse PCAP réelle : snort -c snort.lua -r file -A alert_json
    # ------------------------------------------------------------------ #
    def analyze_pcap(self, filename: str, data: bytes) -> PcapResult:
        tmp = Path(tempfile.mkdtemp(prefix="snort_pcap_"))
        pcap_path = tmp / filename
        pcap_path.write_bytes(data)
        alert_file = tmp / "alert_json.txt"
        cmd = [
            settings.snort_binary, "-c", settings.config_path,
            "-r", str(pcap_path), "-A", "alert_json",
            "-l", str(tmp), "-q", "-k", "none",
        ]
        output, rc = "", 0
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            output, rc = (proc.stdout + proc.stderr), proc.returncode
        except (subprocess.SubprocessError, FileNotFoundError) as exc:
            output = f"Erreur d'exécution : {exc}"
            rc = 1
        alerts: list[Alert] = []
        if alert_file.exists():
            for line in alert_file.read_text(encoding="utf-8", errors="ignore").splitlines():
                line = line.strip()
                if line:
                    try:
                        alerts.append(self._to_alert(json.loads(line)))
                    except json.JSONDecodeError:
                        pass
        result = PcapResult(
            id=uuid.uuid4().hex[:12], filename=filename, size_bytes=len(data),
            analyzed_at=datetime.now(), alerts=alerts,
            stats={"alerts": len(alerts), "returncode": rc}, output=output[-4000:],
        )
        self._pcaps[result.id] = result
        return result

    def list_pcaps(self) -> list[PcapSummary]:
        return [
            PcapSummary(id=r.id, filename=r.filename, size_bytes=r.size_bytes,
                        analyzed_at=r.analyzed_at, alert_count=len(r.alerts))
            for r in sorted(self._pcaps.values(), key=lambda x: x.analyzed_at, reverse=True)
        ]

    def get_pcap_result(self, pcap_id: str) -> PcapResult:
        if pcap_id not in self._pcaps:
            raise KeyError(pcap_id)
        return self._pcaps[pcap_id]

    # ------------------------------------------------------------------ #
    # Logs & console
    # ------------------------------------------------------------------ #
    def tail_logs(self, lines: int = 200) -> LogsResponse:
        # Journal systemd du service
        try:
            proc = subprocess.run(
                ["journalctl", "-u", settings.service_name, "-n", str(lines), "--no-pager"],
                capture_output=True, text=True, timeout=20,
            )
            content = proc.stdout.strip()
            if content:
                return LogsResponse(lines=content.splitlines(), source=f"journalctl -u {settings.service_name}")
        except (subprocess.SubprocessError, FileNotFoundError):
            pass
        return LogsResponse(lines=["Aucun log disponible."], source="")

    def run_console(self, command: str) -> ConsoleResult:
        cmd = command.strip()
        try:
            tokens = shlex.split(cmd)
        except ValueError:
            return ConsoleResult(command=cmd, output="Commande mal formée.", returncode=1, ok=False)
        if not tokens or tokens[0] != "snort":
            return ConsoleResult(command=cmd, output="Seules les commandes 'snort ...' sont autorisées.", returncode=1, ok=False)
        # Vérifie que chaque flag est autorisé (introspection en lecture seule)
        for tok in tokens[1:]:
            if tok.startswith("-") and tok not in _CONSOLE_ALLOWED:
                return ConsoleResult(
                    command=cmd, returncode=1, ok=False,
                    output=f"Flag non autorisé : {tok}\n\n{fixtures.console_help()}",
                )
        try:
            proc = subprocess.run([settings.snort_binary, *tokens[1:]], capture_output=True, text=True, timeout=60)
            return ConsoleResult(command=cmd, output=(proc.stdout + proc.stderr)[-8000:],
                                 returncode=proc.returncode, ok=proc.returncode == 0)
        except (subprocess.SubprocessError, FileNotFoundError) as exc:
            return ConsoleResult(command=cmd, output=f"Erreur : {exc}", returncode=1, ok=False)

    # ------------------------------------------------------------------ #
    def _snort(self, *args: str) -> str:
        try:
            proc = subprocess.run([settings.snort_binary, *args], capture_output=True, text=True, timeout=30)
            return proc.stdout + proc.stderr
        except (subprocess.SubprocessError, FileNotFoundError):
            return ""


def _int_or_none(v) -> int | None:
    try:
        return int(v)
    except (TypeError, ValueError):
        return None
