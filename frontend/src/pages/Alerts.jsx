import { useEffect, useMemo, useRef, useState } from "react";
import { api, alertsWsUrl } from "../api.js";

const PRIO_LABEL = { 1: "Haute", 2: "Moyenne", 3: "Basse" };

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [prio, setPrio] = useState("all");
  const [search, setSearch] = useState("");
  const [live, setLive] = useState(true);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  // Chargement initial de l'historique
  useEffect(() => {
    api.listAlerts(200).then(setAlerts).catch(() => {});
  }, []);

  // Flux temps réel via WebSocket
  useEffect(() => {
    if (!live) {
      wsRef.current?.close();
      return;
    }
    const ws = new WebSocket(alertsWsUrl());
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (ev) => {
      try {
        const alert = JSON.parse(ev.data);
        setAlerts((prev) => [alert, ...prev].slice(0, 500));
      } catch {
        /* ignore */
      }
    };
    return () => ws.close();
  }, [live]);

  const load = () => api.listAlerts(200).then(setAlerts).catch(() => {});

  const filtered = useMemo(
    () =>
      alerts.filter(
        (a) =>
          (prio === "all" || String(a.priority) === prio) &&
          (!search ||
            a.msg.toLowerCase().includes(search.toLowerCase()) ||
            a.src_addr.includes(search) ||
            a.dst_addr.includes(search))
      ),
    [alerts, prio, search]
  );

  const fmt = (ts) => new Date(ts).toLocaleString("fr-FR");

  return (
    <div>
      <h1 className="page-title">Alertes</h1>
      <p className="page-sub">Flux des détections Snort (source : alert_json). {filtered.length} affichée(s).</p>

      <div className="toolbar">
        <input
          placeholder="🔍 Message, IP source ou destination…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 300 }}
        />
        <select value={prio} onChange={(e) => setPrio(e.target.value)} style={{ maxWidth: 160 }}>
          <option value="all">Toutes priorités</option>
          <option value="1">Haute (P1)</option>
          <option value="2">Moyenne (P2)</option>
          <option value="3">Basse (P3)</option>
        </select>
        <div className="spacer" />
        <span className="row" style={{ fontSize: 12 }}>
          <span className={`dot ${connected ? "on" : "off"}`} />
          {connected ? "Temps réel actif" : "Hors ligne"}
        </span>
        <label style={{ margin: 0 }}>
          <input
            type="checkbox"
            checked={live}
            onChange={(e) => setLive(e.target.checked)}
            style={{ width: "auto", marginRight: 6 }}
          />
          Flux live (WebSocket)
        </label>
        <button onClick={load}>Recharger l'historique</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Horodatage</th>
              <th>Prio</th>
              <th>Signature</th>
              <th>Proto</th>
              <th>Source</th>
              <th>Destination</th>
              <th>SID</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a, i) => (
              <tr key={i}>
                <td className="mono">{fmt(a.timestamp)}</td>
                <td><span className={`badge prio-${a.priority}`}>{PRIO_LABEL[a.priority] || a.priority}</span></td>
                <td>{a.msg}</td>
                <td>{a.proto}</td>
                <td className="mono">{a.src_addr}{a.src_port ? `:${a.src_port}` : ""}</td>
                <td className="mono">{a.dst_addr}{a.dst_port ? `:${a.dst_port}` : ""}</td>
                <td className="mono">{a.sid ?? "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan="7" className="muted" style={{ textAlign: "center", padding: 30 }}>
                Aucune alerte.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
