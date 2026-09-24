import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api.js";

const PRIO_COLORS = { 1: "#f85149", 2: "#f0883e", 3: "#d29922" };

export default function Dashboard() {
  const [status, setStatus] = useState(null);
  const [stats, setStats] = useState(null);
  const [rules, setRules] = useState([]);

  const load = () => {
    api.serviceStatus().then(setStatus).catch(() => {});
    api.alertStats().then(setStats).catch(() => {});
    api.listRules().then(setRules).catch(() => {});
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const enabledRules = rules.filter((r) => r.enabled).length;
  const prioData = stats
    ? Object.entries(stats.by_priority).map(([p, c]) => ({ name: `Priorité ${p}`, value: c, p }))
    : [];

  return (
    <div>
      <h1 className="page-title">Tableau de bord</h1>
      <p className="page-sub">Vue d'ensemble de la sonde Snort et de l'activité de détection.</p>

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="stat" style={{ color: status?.running ? "var(--green)" : "var(--red)" }}>
            {status?.running ? "ACTIF" : "ARRÊTÉ"}
          </div>
          <div className="stat-label">
            <span className={`dot ${status?.running ? "on" : "off"}`} />
            État du service
          </div>
        </div>
        <div className="card">
          <div className="stat">{stats?.total ?? "—"}</div>
          <div className="stat-label">Alertes récentes</div>
        </div>
        <div className="card">
          <div className="stat">
            {enabledRules}
            <span className="muted" style={{ fontSize: 16 }}> / {rules.length}</span>
          </div>
          <div className="stat-label">Règles actives</div>
        </div>
        <div className="card">
          <div className="stat" style={{ color: "var(--red)" }}>
            {stats?.by_priority?.["1"] ?? 0}
          </div>
          <div className="stat-label">Alertes critiques (P1)</div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>Alertes dans le temps (2 h)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stats?.timeline ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#24304a" />
              <XAxis dataKey="bucket" stroke="#8b98ad" fontSize={11} />
              <YAxis stroke="#8b98ad" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#131a26", border: "1px solid #24304a" }} />
              <Bar dataKey="count" fill="#4f8cff" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3>Répartition par priorité</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={prioData} dataKey="value" nameKey="name" outerRadius={90} label>
                {prioData.map((d) => (
                  <Cell key={d.p} fill={PRIO_COLORS[d.p] || "#4f8cff"} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "#131a26", border: "1px solid #24304a" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Top signatures déclenchées</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Signature</th>
                <th>Occurrences</th>
              </tr>
            </thead>
            <tbody>
              {(stats?.by_signature ?? []).map((s) => (
                <tr key={s.msg}>
                  <td>{s.msg}</td>
                  <td className="mono">{s.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
