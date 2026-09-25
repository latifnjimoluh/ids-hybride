import { useEffect, useMemo, useState } from "react";
import { useAlerts } from "../AlertsContext.jsx";

const PRIO_LABEL = { 1: "Haute", 2: "Moyenne", 3: "Basse" };
const PER_PAGE = 15;

export default function Alerts() {
  const { alerts, connected, notifEnabled, setNotifEnabled, permission, supported, reload } = useAlerts();
  const [prio, setPrio] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

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

  // Revenir à la page 1 quand les filtres changent
  useEffect(() => { setPage(1); }, [prio, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PER_PAGE;
  const pageItems = filtered.slice(start, start + PER_PAGE);

  const fmt = (ts) => new Date(ts).toLocaleString("fr-FR");
  const denied = permission === "denied";

  return (
    <div>
      <h1 className="page-title">Alertes</h1>
      <p className="page-sub">
        Flux temps réel des détections Snort. {filtered.length} alerte(s) — page {currentPage}/{totalPages}.
      </p>

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
        <button
          className={notifEnabled ? "success" : ""}
          disabled={!supported || denied}
          onClick={() => setNotifEnabled(!notifEnabled)}
          title={denied ? "Autorisation refusée dans le navigateur" : "Notifications navigateur"}
        >
          {notifEnabled ? "🔔 Notifications ON" : "🔕 Notifications"}
        </button>
        <button onClick={reload}>Recharger</button>
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
            {pageItems.map((a, i) => (
              <tr key={start + i}>
                <td className="mono">{fmt(a.timestamp)}</td>
                <td><span className={`badge prio-${a.priority}`}>{PRIO_LABEL[a.priority] || a.priority}</span></td>
                <td>{a.msg}</td>
                <td>{a.proto}</td>
                <td className="mono">{a.src_addr}{a.src_port ? `:${a.src_port}` : ""}</td>
                <td className="mono">{a.dst_addr}{a.dst_port ? `:${a.dst_port}` : ""}</td>
                <td className="mono">{a.sid ?? "—"}</td>
              </tr>
            ))}
            {pageItems.length === 0 && (
              <tr><td colSpan="7" className="muted" style={{ textAlign: "center", padding: 30 }}>
                Aucune alerte.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="toolbar" style={{ marginTop: 14, justifyContent: "center" }}>
        <button className="sm" disabled={currentPage <= 1} onClick={() => setPage(1)}>« Début</button>
        <button className="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>‹ Précédent</button>
        <span className="mono" style={{ fontSize: 13 }}>{currentPage} / {totalPages}</span>
        <button className="sm" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Suivant ›</button>
        <button className="sm" disabled={currentPage >= totalPages} onClick={() => setPage(totalPages)}>Fin »</button>
      </div>
    </div>
  );
}
