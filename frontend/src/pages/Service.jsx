import React, { useEffect, useState } from "react";
import {
  Activity,
  ShieldCheck,
  ShieldAlert,
  Server,
  Play,
  Square,
  RotateCw,
  Clock,
  Cpu,
  Radio,
  Sliders,
  CheckCircle2,
  TerminalSquare
} from "lucide-react";
import { api } from "../api.js";
import { useToast } from "../useToast.jsx";
import PageHeader from "../components/layout/PageHeader.jsx";
import StatCard from "../components/ui/StatCard.jsx";
import Button from "../components/ui/Button.jsx";
import Badge from "../components/ui/Badge.jsx";
import ConfirmDialog from "../components/ui/ConfirmDialog.jsx";

function fmtUptime(s) {
  if (s == null) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

export default function Service() {
  const [status, setStatus] = useState(null);
  const [health, setHealth] = useState(null);
  const [busy, setBusy] = useState(false);
  const [opts, setOpts] = useState(null);
  const [interfaces, setInterfaces] = useState([]);
  const [runCfg, setRunCfg] = useState({
    mode: "ids",
    interface: "eth0",
    daq: "pcap",
    alert_mode: "alert_json",
    tweak: "balanced"
  });

  // Confirm dialog state: "stop" | "restart" | null
  const [confirmAction, setConfirmAction] = useState(null);

  const { show, node } = useToast();

  const load = () => {
    api.serviceStatus().then(setStatus).catch((e) => show(e.message, "err"));
    api.health().then(setHealth).catch(() => {});
  };

  useEffect(() => {
    load();
    api.runOptions().then(setOpts).catch(() => {});
    api.interfaces().then(setInterfaces).catch(() => {});
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (action) => {
    setBusy(true);
    try {
      const res = await api.serviceAction(action, action === "stop" ? {} : runCfg);
      setStatus(res);
      show(`Commande envoyée avec succès : ${action.toUpperCase()} ✓`);
    } catch (e) {
      show(e.message || `Erreur lors de l'action ${action}`, "err");
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  };

  const setCfg = (k, v) => setRunCfg(prev => ({ ...prev, [k]: v }));

  const running = Boolean(status?.running);

  return (
    <div>
      <PageHeader
        title="Supervision & Contrôle des Services"
        subtitle="Pilotage du moteur d'inspection Snort 3 et surveillance de l'API Dashboard SOC."
      />

      {/* Dual Service Monitoring Grid */}
      <div className="grid cols-2" style={{ marginBottom: 20 }}>
        {/* Card 1: Snort 3 Engine Service */}
        <div className="card" style={{ border: `1px solid ${running ? "rgba(16, 185, 129, 0.4)" : "rgba(239, 68, 68, 0.4)"}` }}>
          <div className="card-header">
            <h3 className="card-title">
              <Activity size={16} color={running ? "#10b981" : "#ef4444"} />
              <span>Moteur Snort 3 (snort3.service)</span>
            </h3>
            <Badge variant={running ? "success" : "prio-1"} dot={running}>
              {running ? "EN SERVICE (ACTIF)" : "ARRÊTÉ"}
            </Badge>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "var(--soc-text-secondary)", marginBottom: 4 }}>
              Version & Backend :
            </div>
            <div className="mono" style={{ fontSize: 13.5, color: "var(--soc-text-primary)", fontWeight: 600 }}>
              {status?.version || "Snort 3"} • Backend « {status?.backend || "systemd"} »
            </div>
          </div>

          <div className="flex items-center gap-2" style={{ paddingTop: 10, borderTop: "1px solid var(--soc-border)" }}>
            <Button
              variant="success"
              size="sm"
              icon={<Play size={14} />}
              disabled={busy || running}
              loading={busy && !running}
              onClick={() => handleAction("start")}
            >
              Démarrer le moteur
            </Button>

            <Button
              variant="secondary"
              size="sm"
              icon={<RotateCw size={14} />}
              disabled={busy || !running}
              onClick={() => setConfirmAction("restart")}
            >
              Redémarrer
            </Button>

            <Button
              variant="danger"
              size="sm"
              icon={<Square size={14} />}
              disabled={busy || !running}
              onClick={() => setConfirmAction("stop")}
            >
              Arrêter
            </Button>
          </div>
        </div>

        {/* Card 2: Dashboard API Service */}
        <div className="card" style={{ border: "1px solid rgba(59, 130, 246, 0.4)" }}>
          <div className="card-header">
            <h3 className="card-title">
              <Server size={16} color="var(--soc-accent)" />
              <span>Serveur Web Dashboard (FastAPI)</span>
            </h3>
            <Badge variant="success" dot={true}>
              OPÉRATIONNEL (PORT 8000)
            </Badge>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "var(--soc-text-secondary)", marginBottom: 4 }}>
              Santé de l'Appliance :
            </div>
            <div className="mono" style={{ fontSize: 13.5, color: "var(--soc-text-primary)", fontWeight: 600 }}>
              Status: {health?.status || "ok"} • IDS-Hybride Appliance Engine
            </div>
          </div>

          <div className="flex items-center gap-2" style={{ paddingTop: 10, borderTop: "1px solid var(--soc-border)" }}>
            <span style={{ fontSize: 12, color: "var(--soc-text-muted)" }}>
              Endpoint de santé : <span className="mono">/api/health</span>
            </span>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid cols-4" style={{ marginBottom: 20 }}>
        <StatCard
          label="Temps de fonctionnement"
          value={fmtUptime(status?.uptime_seconds)}
          sub="Disponibilité continue"
          icon={<Clock size={20} />}
          color="accent"
        />

        <StatCard
          label="PID Processus Snort"
          value={status?.pid ?? "—"}
          sub={running ? "Processus actif" : "Inactif"}
          icon={<Cpu size={20} />}
          color={running ? "success" : "neutral"}
        />

        <StatCard
          label="Paquets analysés"
          value={status?.packets_analyzed?.toLocaleString("fr-FR") ?? "0"}
          sub="Trafic inspecté par le moteur"
          icon={<Radio size={20} />}
          color="info"
        />

        <StatCard
          label="Paquets perdus (Drops)"
          value={status?.packets_dropped ?? "0"}
          sub={status?.packets_dropped > 0 ? "Saturation DAQ détectée" : "Aucune perte de trames"}
          icon={<ShieldAlert size={20} />}
          color={status?.packets_dropped > 0 ? "warning" : "success"}
        />
      </div>

      {/* Execution Options */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3 className="card-title">
            <Sliders size={16} color="var(--soc-accent)" />
            <span>Options d'exécution & Profil d'inspection</span>
          </h3>
          <span style={{ fontSize: 12, color: "var(--soc-text-muted)" }}>
            Appliquées automatiquement au lancement
          </span>
        </div>

        <div className="grid cols-3" style={{ gap: 14, marginBottom: 16 }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Mode Opérationnel</label>
            <select value={runCfg.mode} onChange={(e) => setCfg("mode", e.target.value)}>
              {(opts?.modes || ["ids", "ips", "sniffer"]).map((m) => (
                <option key={m} value={m}>{m.toUpperCase()}</option>
              ))}
            </select>
          </div>

          <div className="field" style={{ margin: 0 }}>
            <label>Interface Réseau</label>
            <select value={runCfg.interface} onChange={(e) => setCfg("interface", e.target.value)}>
              {(interfaces.length ? interfaces.map((i) => i.name) : ["eth0"]).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div className="field" style={{ margin: 0 }}>
            <label>Module DAQ</label>
            <select value={runCfg.daq} onChange={(e) => setCfg("daq", e.target.value)}>
              {(opts?.daqs || ["pcap", "afpacket"]).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="field" style={{ margin: 0 }}>
            <label>Mode d'alerte</label>
            <select value={runCfg.alert_mode} onChange={(e) => setCfg("alert_mode", e.target.value)}>
              {(opts?.alert_modes || ["alert_json"]).map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <div className="field" style={{ margin: 0 }}>
            <label>Profil de Tuning (--tweaks)</label>
            <select value={runCfg.tweak} onChange={(e) => setCfg("tweak", e.target.value)}>
              {(opts?.tweaks || ["balanced", "security", "connectivity"]).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="field" style={{ margin: 0 }}>
            <label>Interface active détectée</label>
            <input type="text" readOnly value={status?.interface || runCfg.interface} className="mono" disabled />
          </div>
        </div>

        {/* CLI Preview */}
        <div
          style={{
            background: "#05080e",
            padding: "12px 16px",
            borderRadius: 6,
            border: "1px solid var(--soc-border)",
            display: "flex",
            alignItems: "center",
            gap: 10
          }}
        >
          <TerminalSquare size={16} color="var(--soc-accent)" />
          <span className="mono" style={{ fontSize: 12.5, color: "var(--soc-text-primary)" }}>
            snort -c snort.lua -i {runCfg.interface} --daq {runCfg.daq} -A {runCfg.alert_mode}
            {runCfg.tweak !== "none" ? ` --tweaks ${runCfg.tweak}` : ""}
            {runCfg.mode === "ips" ? " (mode inline/IPS)" : ""}
          </span>
        </div>
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        isOpen={confirmAction === "stop"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => handleAction("stop")}
        title="Arrêter le moteur Snort 3"
        message="Attention : l'arrêt du moteur Snort 3 suspend immédiatement l'analyse en temps réel et la détection d'intrusions sur le réseau. Êtes-vous certain de vouloir continuer ?"
        confirmText="Arrêter le service"
        danger={true}
        loading={busy}
      />

      <ConfirmDialog
        isOpen={confirmAction === "restart"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => handleAction("restart")}
        title="Redémarrer le moteur Snort 3"
        message="Le redémarrage du moteur va recharger la configuration et les règles Snort. Une brève interruption de surveillance réseau aura lieu."
        confirmText="Redémarrer maintenant"
        danger={false}
        loading={busy}
      />

      {node}
    </div>
  );
}
