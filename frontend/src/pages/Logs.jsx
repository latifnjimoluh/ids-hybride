import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

export default function Logs() {
  const [data, setData] = useState({ lines: [], source: "" });
  const [auto, setAuto] = useState(true);
  const [count, setCount] = useState(200);
  const preRef = useRef(null);

  const load = () => api.logs(count).then(setData).catch(() => {});
  useEffect(() => {
    load();
    if (!auto) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [auto, count]);

  return (
    <div>
      <h1 className="page-title">Logs</h1>
      <p className="page-sub">Journal du moteur Snort. Source : <span className="mono">{data.source || "—"}</span></p>

      <div className="toolbar">
        <select value={count} onChange={(e) => setCount(Number(e.target.value))} style={{ maxWidth: 160 }}>
          {[50, 200, 500, 1000].map((n) => <option key={n} value={n}>{n} lignes</option>)}
        </select>
        <div className="spacer" />
        <label style={{ margin: 0 }}>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} style={{ width: "auto", marginRight: 6 }} />
          Suivi auto (3 s)
        </label>
        <button onClick={load}>Actualiser</button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <pre
          ref={preRef}
          className="mono"
          style={{ margin: 0, padding: 16, maxHeight: "65vh", overflow: "auto", fontSize: 12, lineHeight: 1.6 }}
        >
          {data.lines.length ? data.lines.join("\n") : "Aucun log."}
        </pre>
      </div>
    </div>
  );
}
