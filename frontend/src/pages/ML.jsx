import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api.js";
import { useToast } from "../useToast.jsx";

const PRIO_LABEL = { 1: "Haute", 2: "Moyenne", 3: "Basse" };

export default function ML() {
  const [status, setStatus] = useState(null);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const { show, node } = useToast();

  const loadStatus = () => api.mlStatus().then(setStatus).catch((e) => show(e.message, "err"));
  useEffect(() => { loadStatus(); }, []);

  const train = async () => {
    setBusy(true);
    try {
      const s = await api.mlTrain();
      setStatus(s);
      show(`Modèle entraîné sur ${s.n_samples} événements ✓`);
      await loadAnomalies();
    } catch (e) {
      show(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  const loadAnomalies = async () => {
    try {
      setData(await api.mlAnomalies(300));
    } catch (e) {
      show(e.message, "err");
    }
  };

  // Histogramme de distribution des scores (10 tranches)
  const histogram = () => {
    if (!data?.items?.length) return [];
    const scores = data.items.map((i) => i.anomaly_score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const span = max - min || 1;
    const bins = Array.from({ length: 10 }, (_, i) => ({
      bucket: (min + (span * i) / 10).toFixed(2),
      count: 0,
      anomaly: false,
    }));
    for (const it of data.items) {
      let idx = Math.floor(((it.anomaly_score - min) / span) * 10);
      if (idx >= 10) idx = 9;
      if (idx < 0) idx = 0;
      bins[idx].count += 1;
      if (it.is_anomaly) bins[idx].anomaly = true;
    }
    return bins;
  };

  const installed = status?.installed;
  const trained = status?.trained;

  return (
    <div>
      <h1 className="page-title">ML / Anomalies</h1>
      <p className="page-sub">
        Détection d'anomalies par Isolation Forest (scikit-learn) sur les événements Snort.
        Complète la détection par signatures : repère les événements atypiques, même sans règle dédiée.
      </p>

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="stat" style={{ fontSize: 18, color: installed ? "var(--green)" : "var(--red)" }}>
            {installed ? "Disponible" : "Absent"}
          </div>
          <div className="stat-label">Moteur scikit-learn</div>
        </div>
        <div className="card">
          <div className="stat" style={{ fontSize: 18, color: trained ? "var(--green)" : "var(--text-dim)" }}>
            {trained ? "Entraîné" : "Non entraîné"}
          </div>
          <div className="stat-label">Modèle</div>
        </div>
        <div className="card">
          <div className="stat">{status?.n_samples ?? "—"}</div>
          <div className="stat-label">Événements d'entraînement</div>
        </div>
        <div className="card">
          <div className="stat" style={{ color: data?.anomalies ? "var(--red)" : "inherit" }}>
            {data?.anomalies ?? "—"}
          </div>
          <div className="stat-label">Anomalies détectées</div>
        </div>
      </div>

      <div className="toolbar">
        <button className="primary" disabled={busy || !installed} onClick={train}>
          {busy ? "Entraînement…" : trained ? "Ré-entraîner le modèle" : "Entraîner le modèle"}
        </button>
        <button disabled={!trained} onClick={loadAnomalies}>Recalculer les anomalies</button>
        <div className="spacer" />
        {status?.trained_at && (
          <span className="muted" style={{ fontSize: 12 }}>
            Entraîné : {new Date(status.trained_at).toLocaleString("fr-FR")} · contamination {status.contamination}
          </span>
        )}
      </div>

      {!installed && (
        <div className="card"><p className="muted">
          scikit-learn n'est pas installé dans l'environnement du backend.
          Installez-le : <span className="mono">pip install scikit-learn</span> puis redémarrez le service.
        </p></div>
      )}

      {installed && !trained && (
        <div className="card"><p className="muted">
          Le modèle n'est pas encore entraîné. Cliquez sur « Entraîner le modèle » : il apprendra le profil
          des événements Snort récents. Générez d'abord un peu de trafic pour disposer de données.
        </p></div>
      )}

      {data?.items?.length > 0 && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3>Distribution des scores d'anomalie</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={histogram()}>
                <CartesianGrid strokeDasharray="3 3" stroke="#24304a" />
                <XAxis dataKey="bucket" stroke="#8b98ad" fontSize={11} />
                <YAxis stroke="#8b98ad" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#131a26", border: "1px solid #24304a" }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {histogram().map((b, i) => (
                    <Cell key={i} fill={b.anomaly ? "#f85149" : "#4f8cff"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="muted" style={{ fontSize: 12 }}>
              Plus le score est élevé, plus l'événement est atypique. En rouge : tranches contenant des anomalies.
            </p>
          </div>

          <div className="card">
            <h3>Événements les plus anormaux</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Score</th>
                    <th>Anomalie</th>
                    <th>Signature</th>
                    <th>Prio</th>
                    <th>Proto</th>
                    <th>Source</th>
                    <th>Destination</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.slice(0, 30).map((a, i) => (
                    <tr key={i}>
                      <td className="mono">{a.anomaly_score.toFixed(3)}</td>
                      <td>
                        {a.is_anomaly
                          ? <span className="badge prio-1">Anomalie</span>
                          : <span className="badge off">Normal</span>}
                      </td>
                      <td>{a.msg}</td>
                      <td><span className={`badge prio-${a.priority}`}>{PRIO_LABEL[a.priority] || a.priority}</span></td>
                      <td>{a.proto}</td>
                      <td className="mono">{a.src_addr}</td>
                      <td className="mono">{a.dst_addr}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      {node}
    </div>
  );
}
