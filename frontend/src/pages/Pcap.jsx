import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useToast } from "../useToast.jsx";

const PRIO_LABEL = { 1: "Haute", 2: "Moyenne", 3: "Basse" };

export default function Pcap() {
  const [history, setHistory] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const { show, node } = useToast();

  const loadHistory = () => api.listPcaps().then(setHistory).catch(() => {});
  useEffect(() => { loadHistory(); }, []);

  const analyze = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const res = await api.analyzePcap(file);
      setResult(res);
      show(`Analyse terminée : ${res.alerts.length} alerte(s)`);
      loadHistory();
    } catch (e) {
      show(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  const openResult = async (id) => {
    try { setResult(await api.pcapResult(id)); } catch (e) { show(e.message, "err"); }
  };

  const fmtSize = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} Mo` : `${(b / 1024).toFixed(0)} Ko`);

  return (
    <div>
      <h1 className="page-title">Analyse PCAP</h1>
      <p className="page-sub">Téléverser une capture réseau et l'analyser avec Snort (équiv. snort -r capture.pcap -c snort.lua).</p>

      <div
        className="card"
        style={{ marginBottom: 16, border: "1px dashed var(--border)", textAlign: "center", padding: 32 }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); analyze(e.dataTransfer.files[0]); }}
      >
        <div style={{ fontSize: 40, marginBottom: 10 }}>⇪</div>
        <p className="muted">Glissez-déposez un fichier .pcap / .pcapng ici, ou</p>
        <input
          ref={fileRef}
          type="file"
          accept=".pcap,.pcapng,.cap"
          style={{ display: "none" }}
          onChange={(e) => analyze(e.target.files[0])}
        />
        <button className="primary" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? "Analyse en cours…" : "Choisir un fichier"}
        </button>
      </div>

      {result && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Résultat : {result.filename}</h3>
          <div className="grid cols-4" style={{ marginBottom: 14 }}>
            {Object.entries(result.stats).map(([k, v]) => (
              <div key={k}><div className="stat-label">{k}</div><b>{String(v)}</b></div>
            ))}
          </div>
          <details style={{ marginBottom: 14 }}>
            <summary className="muted" style={{ cursor: "pointer" }}>Sortie brute de Snort</summary>
            <pre className="mono" style={{ background: "var(--bg)", padding: 12, borderRadius: 8, overflow: "auto" }}>
              {result.output}
            </pre>
          </details>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Prio</th><th>Signature</th><th>Source</th><th>Destination</th><th>SID</th></tr></thead>
              <tbody>
                {result.alerts.map((a, i) => (
                  <tr key={i}>
                    <td><span className={`badge prio-${a.priority}`}>{PRIO_LABEL[a.priority] || a.priority}</span></td>
                    <td>{a.msg}</td>
                    <td className="mono">{a.src_addr}</td>
                    <td className="mono">{a.dst_addr}</td>
                    <td className="mono">{a.sid ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Analyses précédentes</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Fichier</th><th>Taille</th><th>Date</th><th>Alertes</th><th></th></tr></thead>
            <tbody>
              {history.map((p) => (
                <tr key={p.id}>
                  <td>{p.filename}</td>
                  <td className="mono">{fmtSize(p.size_bytes)}</td>
                  <td className="mono">{new Date(p.analyzed_at).toLocaleString("fr-FR")}</td>
                  <td>{p.alert_count}</td>
                  <td><button className="sm" onClick={() => openResult(p.id)}>Ouvrir</button></td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr><td colSpan="5" className="muted" style={{ textAlign: "center", padding: 20 }}>Aucune analyse.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {node}
    </div>
  );
}
