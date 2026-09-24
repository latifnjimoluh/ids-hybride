import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useToast } from "../useToast.jsx";

function fmtUptime(s) {
  if (s == null) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

export default function Service() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [opts, setOpts] = useState(null);
  const [interfaces, setInterfaces] = useState([]);
  const [runCfg, setRunCfg] = useState({ mode: "ids", interface: "eth0", daq: "pcap", alert_mode: "alert_json", tweak: "balanced" });
  const { show, node } = useToast();

  const load = () => api.serviceStatus().then(setStatus).catch((e) => show(e.message, "err"));
  useEffect(() => {
    load();
    api.runOptions().then(setOpts).catch(() => {});
    api.interfaces().then(setInterfaces).catch(() => {});
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  const act = async (action) => {
    setBusy(true);
    try {
      // On envoie les options d'exécution au démarrage/redémarrage.
      const res = await api.serviceAction(action, action === "stop" ? {} : runCfg);
      setStatus(res);
      show(`Service : ${action} ✓`);
    } catch (e) {
      show(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  const setCfg = (k, v) => setRunCfg({ ...runCfg, [k]: v });

  const running = status?.running;

  return (
    <div>
      <h1 className="page-title">Contrôle du service</h1>
      <p className="page-sub">Démarrer, arrêter et surveiller le moteur Snort.</p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="row">
            <span className={`dot ${running ? "on" : "off"}`} style={{ height: 14, width: 14 }} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: running ? "var(--green)" : "var(--red)" }}>
                {running ? "Snort en cours d'exécution" : "Snort arrêté"}
              </div>
              <div className="muted">{status?.version} · backend « {status?.backend} »</div>
            </div>
          </div>
          <div className="row">
            <button className="success" disabled={busy || running} onClick={() => act("start")}>▶ Démarrer</button>
            <button disabled={busy || !running} onClick={() => act("restart")}>⟳ Redémarrer</button>
            <button className="danger" disabled={busy || !running} onClick={() => act("stop")}>■ Arrêter</button>
          </div>
        </div>
      </div>

      <div className="grid cols-4">
        <div className="card">
          <div className="stat">{fmtUptime(status?.uptime_seconds)}</div>
          <div className="stat-label">Uptime</div>
        </div>
        <div className="card">
          <div className="stat">{status?.pid ?? "—"}</div>
          <div className="stat-label">PID</div>
        </div>
        <div className="card">
          <div className="stat">{status?.packets_analyzed?.toLocaleString("fr-FR") ?? "—"}</div>
          <div className="stat-label">Paquets analysés</div>
        </div>
        <div className="card">
          <div className="stat" style={{ color: status?.packets_dropped ? "var(--orange)" : "inherit" }}>
            {status?.packets_dropped ?? "—"}
          </div>
          <div className="stat-label">Paquets perdus</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Options d'exécution</h3>
        <p className="muted" style={{ marginTop: -6 }}>Appliquées au (re)démarrage, équivalent des flags CLI de Snort.</p>
        <div className="grid cols-4">
          <div className="field">
            <label>Mode</label>
            <select value={runCfg.mode} onChange={(e) => setCfg("mode", e.target.value)}>
              {(opts?.modes || ["ids", "ips", "sniffer"]).map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Interface</label>
            <select value={runCfg.interface} onChange={(e) => setCfg("interface", e.target.value)}>
              {(interfaces.length ? interfaces.map((i) => i.name) : ["eth0"]).map((n) => <option key={n}>{n}</option>)}
            </select>
          </div>
          <div className="field">
            <label>DAQ</label>
            <select value={runCfg.daq} onChange={(e) => setCfg("daq", e.target.value)}>
              {(opts?.daqs || ["pcap"]).map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Mode d'alerte</label>
            <select value={runCfg.alert_mode} onChange={(e) => setCfg("alert_mode", e.target.value)}>
              {(opts?.alert_modes || ["alert_json"]).map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Profil (--tweaks)</label>
            <select value={runCfg.tweak} onChange={(e) => setCfg("tweak", e.target.value)}>
              {(opts?.tweaks || ["balanced"]).map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div className="mono muted" style={{ fontSize: 12 }}>
          snort -c snort.lua -i {runCfg.interface} --daq {runCfg.daq} -A {runCfg.alert_mode}
          {runCfg.tweak !== "none" ? ` --tweaks ${runCfg.tweak}` : ""}
          {runCfg.mode === "ips" ? "  (mode inline/IPS)" : ""}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Interface active</h3>
        <div className="mono">{status?.interface || "—"}</div>
      </div>
      {node}
    </div>
  );
}
