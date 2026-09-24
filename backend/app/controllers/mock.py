"""Contrôleur Snort simulé pour le développement sous Windows.

Persiste les règles et la config dans des fichiers JSON locaux, et génère
des alertes réalistes à la volée. Aucune dépendance à une vraie instance Snort.
"""

from __future__ import annotations

import json
import random
import threading
import uuid
from collections import Counter
from datetime import datetime, timedelta

from ..config import MOCK_DATA_DIR
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

_RULES_FILE = MOCK_DATA_DIR / "rules.txt"
_CONFIG_FILE = MOCK_DATA_DIR / "config.json"
_STATE_FILE = MOCK_DATA_DIR / "state.json"
_LUA_FILE = MOCK_DATA_DIR / "snort.lua"

# Jeu de signatures pour générer des alertes crédibles
_SIGNATURES = [
    ("Tentative injection SQL dans URI", 1, "web-application-attack", "TCP", 80),
    ("Outil sqlmap détecté (User-Agent)", 1, "web-application-attack", "TCP", 443),
    ("Brute-force SSH possible", 2, "attempted-admin", "TCP", 22),
    ("ICMP Ping détecté", 3, "misc-activity", "ICMP", None),
    ("Scan de ports détecté", 2, "attempted-recon", "TCP", 0),
    ("Exploitation Log4Shell (JNDI)", 1, "attempted-admin", "TCP", 8080),
    ("POST volumineux sortant - exfiltration possible", 2, "policy-violation", "TCP", 443),
    ("Requête DNS vers domaine suspect", 2, "trojan-activity", "UDP", 53),
]
_SEED_RULES = [
    'alert icmp $EXTERNAL_NET any -> $HOME_NET any ( msg:"ICMP Ping détecté"; itype:8; sid:1000001; rev:1; )',
    'alert http $EXTERNAL_NET any -> $HOME_NET any ( msg:"Tentative injection SQL dans URI"; flow:to_server,established; http_uri; content:"union",nocase; content:"select",nocase,distance:0; classtype:web-application-attack; sid:1000010; rev:1; )',
    'alert http $EXTERNAL_NET any -> $HOME_NET any ( msg:"Outil sqlmap détecté (User-Agent)"; flow:to_server,established; http_header:field user-agent; content:"sqlmap",nocase; classtype:web-application-attack; sid:1000003; rev:1; )',
    'alert tcp $EXTERNAL_NET any -> $HOME_NET 22 ( msg:"Brute-force SSH possible"; flow:to_server,established; content:"Failed password"; detection_filter:track by_src,count 5,seconds 60; classtype:attempted-admin; sid:1000030; rev:1; )',
    '# alert tcp $EXTERNAL_NET any -> $HOME_NET 8080 ( msg:"Exploitation Log4Shell (JNDI)"; flow:to_server,established; http_header; content:"${jndi:",nocase; classtype:attempted-admin; sid:1000005; rev:1; )',
]


class MockSnortController(SnortController):
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._pcaps: dict[str, PcapResult] = {}
        self._run_opts: dict = {}
        MOCK_DATA_DIR.mkdir(parents=True, exist_ok=True)
        self._ensure_seed()

    # ------------------------------------------------------------------ #
    # Helpers de persistance
    # ------------------------------------------------------------------ #
    def _ensure_seed(self) -> None:
        if not _RULES_FILE.exists():
            _RULES_FILE.write_text("\n".join(_SEED_RULES) + "\n", encoding="utf-8")
        if not _CONFIG_FILE.exists():
            _CONFIG_FILE.write_text(SnortConfig().model_dump_json(indent=2), encoding="utf-8")
        if not _STATE_FILE.exists():
            self._write_state({"running": False, "started_at": None})
        if not _LUA_FILE.exists():
            _LUA_FILE.write_text(fixtures.SNORT_LUA, encoding="utf-8")

    def _read_lines(self) -> list[str]:
        return _RULES_FILE.read_text(encoding="utf-8").splitlines()

    def _write_lines(self, lines: list[str]) -> None:
        _RULES_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")

    def _read_state(self) -> dict:
        return json.loads(_STATE_FILE.read_text(encoding="utf-8"))

    def _write_state(self, state: dict) -> None:
        _STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")

    # ------------------------------------------------------------------ #
    # Règles
    # ------------------------------------------------------------------ #
    def list_rules(self) -> list[Rule]:
        with self._lock:
            rules = [r for line in self._read_lines() if (r := parse_rule(line))]
        return rules

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
                raise ValueError("Règle invalide : impossible de la parser (sid/action manquant ?)")
            lines.append(line)
            self._write_lines(lines)
            return rule

    def update_rule(self, sid: int, raw: str) -> Rule:
        with self._lock:
            lines = self._read_lines()
            for i, line in enumerate(lines):
                parsed = parse_rule(line)
                if parsed and parsed.sid == sid:
                    keep_enabled = parsed.enabled
                    new_line = raw.strip() if keep_enabled else f"# {raw.strip().lstrip('#').strip()}"
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
            kept = [ln for ln in lines if not (parse_rule(ln) and parse_rule(ln).sid == sid)]  # type: ignore[union-attr]
            if len(kept) == len(lines):
                raise KeyError(f"Règle sid={sid} introuvable")
            self._write_lines(kept)

    def validate_rules(self) -> ValidationResult:
        # En mock : on re-parse chaque règle activée pour détecter les erreurs
        errors = []
        for line in self._read_lines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            if parse_rule(line) is None:
                errors.append(f"Ligne non valide : {stripped[:60]}")
        if errors:
            return ValidationResult(ok=False, output="\n".join(errors))
        n = len(self.list_rules())
        return ValidationResult(ok=True, output=f"[mock] Configuration valide, {n} règle(s) chargée(s).")

    # ------------------------------------------------------------------ #
    # Alertes (générées à la volée)
    # ------------------------------------------------------------------ #
    def list_alerts(self, limit: int = 200) -> list[Alert]:
        rng = random.Random(42)  # déterministe pour une UI stable
        now = datetime.now()
        alerts: list[Alert] = []
        for i in range(limit):
            msg, prio, ctype, proto, port = rng.choice(_SIGNATURES)
            ts = now - timedelta(seconds=i * rng.randint(3, 90))
            alerts.append(
                Alert(
                    timestamp=ts, msg=msg, priority=prio, proto=proto,
                    src_addr=f"{rng.randint(11,223)}.{rng.randint(0,255)}.{rng.randint(0,255)}.{rng.randint(1,254)}",
                    src_port=rng.randint(1024, 65535),
                    dst_addr=f"192.168.1.{rng.randint(2,50)}",
                    dst_port=port if port else None,
                    sid=1000000 + rng.randint(1, 40),
                    classtype=ctype, action="allow",
                )
            )
        return alerts

    def new_alerts(self) -> list[Alert]:
        """Génère 0 à 2 nouvelles alertes « live » à chaque appel, mais
        seulement si le service simulé est démarré."""
        if not self._read_state().get("running", False):
            return []
        rng = random.Random()
        out: list[Alert] = []
        for _ in range(rng.randint(0, 2)):
            msg, prio, ctype, proto, port = rng.choice(_SIGNATURES)
            out.append(
                Alert(
                    timestamp=datetime.now(), msg=msg, priority=prio, proto=proto,
                    src_addr=f"{rng.randint(11,223)}.{rng.randint(0,255)}.{rng.randint(0,255)}.{rng.randint(1,254)}",
                    src_port=rng.randint(1024, 65535),
                    dst_addr=f"192.168.1.{rng.randint(2,50)}",
                    dst_port=port if port else None,
                    sid=1000000 + rng.randint(1, 40), classtype=ctype, action="allow",
                )
            )
        return out

    def alert_stats(self) -> AlertStats:
        alerts = self.list_alerts(200)
        by_prio = Counter(a.priority for a in alerts)
        by_sig = Counter(a.msg for a in alerts)
        by_src = Counter(a.src_addr for a in alerts)
        # Timeline : nombre d'alertes par tranche de 10 minutes (12 tranches)
        buckets: Counter = Counter()
        now = datetime.now()
        for a in alerts:
            bucket = int((now - a.timestamp).total_seconds() // 600)
            if bucket < 12:
                buckets[bucket] += 1
        timeline = [{"bucket": f"-{b*10}min", "count": buckets.get(b, 0)} for b in range(11, -1, -1)]
        return AlertStats(
            total=len(alerts),
            by_priority={int(k): v for k, v in sorted(by_prio.items())},
            by_signature=[{"msg": m, "count": c} for m, c in by_sig.most_common(8)],
            by_src=[{"src_addr": s, "count": c} for s, c in by_src.most_common(8)],
            timeline=timeline,
        )

    # ------------------------------------------------------------------ #
    # Service
    # ------------------------------------------------------------------ #
    def service_status(self) -> ServiceStatus:
        state = self._read_state()
        running = state.get("running", False)
        uptime = None
        if running and state.get("started_at"):
            started = datetime.fromisoformat(state["started_at"])
            uptime = int((datetime.now() - started).total_seconds())
        opts = state.get("run_opts", {})
        iface = opts.get("interface", "eth0")
        mode = opts.get("mode", "ids")
        return ServiceStatus(
            running=running, backend="mock", version=f"Snort++ {fixtures.SNORT_VERSION} (simulé)",
            interface=f"{iface}, mode {mode}, DAQ {opts.get('daq', 'pcap')}", uptime_seconds=uptime,
            pid=4242 if running else None,
            packets_analyzed=random.randint(50_000, 500_000) if running else 0,
            packets_dropped=random.randint(0, 200) if running else 0,
        )

    def service_action(self, action: str, options: dict | None = None) -> ServiceStatus:
        state = self._read_state()
        if options:
            # On mémorise les options d'exécution (mode/interface/DAQ/alert/tweak)
            self._run_opts = {k: v for k, v in options.items() if v}
            state["run_opts"] = self._run_opts
        if action in ("start", "restart"):
            state["running"] = True
            state["started_at"] = datetime.now().isoformat()
        elif action == "stop":
            state["running"] = False
            state["started_at"] = None
        self._write_state(state)
        return self.service_status()

    # ------------------------------------------------------------------ #
    # Configuration
    # ------------------------------------------------------------------ #
    def get_config(self) -> SnortConfig:
        return SnortConfig.model_validate_json(_CONFIG_FILE.read_text(encoding="utf-8"))

    def update_config(self, cfg: SnortConfig) -> SnortConfig:
        _CONFIG_FILE.write_text(cfg.model_dump_json(indent=2), encoding="utf-8")
        return cfg

    def read_raw_config(self) -> tuple[str, str]:
        return _LUA_FILE.read_text(encoding="utf-8"), str(_LUA_FILE)

    def write_raw_config(self, content: str) -> None:
        _LUA_FILE.write_text(content, encoding="utf-8")

    # ------------------------------------------------------------------ #
    # Catégories de règles & import
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
        return [
            RuleCategory(name=c, total=totals[c], enabled=enabled[c])
            for c in sorted(totals)
        ]

    def import_ruleset(self, name: str) -> ImportResult:
        rules = fixtures.RULESETS.get(name)
        if rules is None:
            raise ValueError(f"Ruleset inconnu : {name}")
        with self._lock:
            lines = self._read_lines()
            existing = {r.sid for line in lines if (r := parse_rule(line))}
            added = 0
            for raw in rules:
                parsed = parse_rule(raw)
                if parsed and parsed.sid not in existing:
                    lines.append(raw)
                    added += 1
            self._write_lines(lines)
        return ImportResult(imported=added, message=f"{added} règle(s) importée(s) depuis « {name} ».")

    # ------------------------------------------------------------------ #
    # Système / introspection
    # ------------------------------------------------------------------ #
    def system_info(self) -> SystemInfo:
        p = fixtures.PLUGINS
        return SystemInfo(
            version=f"Snort++ {fixtures.SNORT_VERSION}",
            build="mock build (simulé)",
            backend="mock",
            inspectors=len(p["inspector"]),
            codecs=len(p["codec"]),
            loggers=len(p["logger"]),
            total_plugins=sum(len(v) for v in p.values()),
            daq_modules=len(fixtures.DAQS),
            lua_version="LuaJIT 2.1.0",
            pcre_version="8.39",
            hyperscan=True,
        )

    def list_interfaces(self) -> list[NetworkInterface]:
        return [NetworkInterface(**i) for i in fixtures.INTERFACES]

    def list_daqs(self) -> list[DaqModule]:
        return [DaqModule(**d) for d in fixtures.DAQS]

    def list_plugins(self, kind: str = "") -> list[Plugin]:
        out: list[Plugin] = []
        for ptype, items in fixtures.PLUGINS.items():
            if kind and kind != ptype:
                continue
            out += [Plugin(name=n, type=ptype, help=h) for n, h in items]
        return out

    # ------------------------------------------------------------------ #
    # Analyse PCAP (simulée)
    # ------------------------------------------------------------------ #
    def analyze_pcap(self, filename: str, data: bytes) -> PcapResult:
        rng = random.Random(len(data) or 1)
        n = rng.randint(3, 25)
        base = datetime.now()
        alerts: list[Alert] = []
        for i in range(n):
            msg, prio, ctype, proto, port = rng.choice(_SIGNATURES)
            alerts.append(
                Alert(
                    timestamp=base - timedelta(seconds=i * rng.randint(1, 10)),
                    msg=msg, priority=prio, proto=proto,
                    src_addr=f"{rng.randint(11,223)}.{rng.randint(0,255)}.{rng.randint(0,255)}.{rng.randint(1,254)}",
                    src_port=rng.randint(1024, 65535),
                    dst_addr=f"192.168.1.{rng.randint(2,50)}",
                    dst_port=port or None, sid=1000000 + rng.randint(1, 40),
                    classtype=ctype, action="allow",
                )
            )
        pkts = rng.randint(500, 50000)
        result = PcapResult(
            id=uuid.uuid4().hex[:12], filename=filename, size_bytes=len(data),
            analyzed_at=datetime.now(), alerts=alerts,
            stats={
                "packets": pkts, "analyzed": pkts, "alerts": n,
                "tcp": int(pkts * 0.7), "udp": int(pkts * 0.2), "icmp": int(pkts * 0.05),
                "duration_s": round(rng.uniform(0.2, 5.0), 2),
            },
            output=(
                f"[mock] Analyse de {filename} ({len(data)} octets)\n"
                f"snort -c snort.lua -r {filename} -A alert_json\n"
                f"--------------------------------------------------\n"
                f"Paquets traités : {pkts}\nAlertes générées : {n}\n"
                f"Terminé sans erreur.\n"
            ),
        )
        self._pcaps[result.id] = result
        return result

    def list_pcaps(self) -> list[PcapSummary]:
        return [
            PcapSummary(
                id=r.id, filename=r.filename, size_bytes=r.size_bytes,
                analyzed_at=r.analyzed_at, alert_count=len(r.alerts),
            )
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
        running = self._read_state().get("running", False)
        out = []
        now = datetime.now()
        events = [
            "Snort++ démarré",
            "Chargement de la configuration snort.lua",
            "Compilation des règles : 5 règles chargées",
            "DAQ pcap initialisé sur eth0",
            "Inspecteur http_inspect activé",
            "commencing packet processing",
        ]
        if running:
            for i in range(min(lines, 40)):
                ts = (now - timedelta(seconds=i * 5)).strftime("%Y-%m-%d %H:%M:%S")
                msg = events[i] if i < len(events) else random.choice(
                    ["packet stats: analyzed 12043", "alert: SQL injection", "reload: no changes"]
                )
                out.append(f"{ts}  snort[4242]: {msg}")
        else:
            out.append(f"{now:%Y-%m-%d %H:%M:%S}  snort: service arrêté, aucun log récent.")
        return LogsResponse(lines=out, source="[mock] /var/log/snort/snort.log")

    _CONSOLE_OUTPUTS = None  # rempli à la première utilisation

    def run_console(self, command: str) -> ConsoleResult:
        cmd = command.strip()
        low = cmd.lower()

        def result(out: str, rc: int = 0) -> ConsoleResult:
            return ConsoleResult(command=cmd, output=out, returncode=rc, ok=rc == 0)

        if not low.startswith("snort"):
            return result("Erreur : seules les commandes 'snort ...' sont autorisées.", 1)
        args = low.replace("snort", "", 1).strip()

        if args in ("-v", "--version"):
            return result(fixtures.version_banner())
        if args == "--daq-list":
            lines = ["Available DAQ modules:"] + [
                f"  {d['name']:10s} (v{d['version']}), {d['description']} [{d['mode']}]"
                for d in fixtures.DAQS
            ]
            return result("\n".join(lines))
        if args == "--list-interfaces":
            lines = ["Interfaces réseau :"] + [
                f"  {i['name']:8s} {'UP  ' if i['up'] else 'DOWN'} {', '.join(i['addresses']) or '-'}"
                for i in fixtures.INTERFACES
            ]
            return result("\n".join(lines))
        if args in ("--list-plugins", "--show-plugins"):
            lines = []
            for ptype, items in fixtures.PLUGINS.items():
                lines.append(f"--- {ptype} ({len(items)}) ---")
                lines += [f"  {n:16s} {h}" for n, h in items]
            return result("\n".join(lines))
        if args == "--list-gids":
            return result("GID 1    : text rules\nGID 116  : decoder\nGID 119  : http_inspect\nGID 137  : stream_tcp")
        if args == "--list-builtin":
            return result("116:1  (ipv4) BAD-TRAFFIC ip options\n119:2 (http_inspect) URI has been double-decoded")
        if args.startswith("--help-module"):
            mod = args.replace("--help-module", "").strip() or "http_inspect"
            return result(f"Module « {mod} » : inspecteur simulé.\nOptions : request_depth, response_depth, unzip, normalize_utf...")
        if args in ("--help", "--help-config", "-?", "-h") or args.startswith("--help"):
            return result(fixtures.console_help())
        if "-t" in args.split() and "-c" in args:
            v = self.validate_rules()
            return result(v.output + ("\n\nSnort successfully validated the configuration!" if v.ok else ""), 0 if v.ok else 1)
        return result(
            f"Commande non reconnue ou non autorisée : « {cmd} »\n\n{fixtures.console_help()}", 1
        )
