import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip
} from "recharts";
import {
  Activity,
  ShieldCheck,
  ShieldAlert,
  Sliders,
  FileSearch,
  Terminal,
  Clock,
  Flame,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  PlusCircle
} from "lucide-react";
import { api } from "../api.js";
import PageHeader from "../components/layout/PageHeader.jsx";
import StatCard from "../components/ui/StatCard.jsx";
import Button from "../components/ui/Button.jsx";
import Badge from "../components/ui/Badge.jsx";

const PRIO_COLORS = {
  1: "#ef4444",
  2: "#f59e0b",
  3: "#38bdf8"
};

// Custom SOC Dark Tooltip for Recharts
function CustomChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0];

  return (
    <div
      style={{
        background: "#0f1726",
        border: "1px solid #283a58",
        borderRadius: 8,
        padding: "10px 14px",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.6)",
        fontSize: 12
      }}
    >
      <div style={{ color: "var(--soc-text-secondary)", marginBottom: 4, fontWeight: 600 }}>
        {label || data.name}
      </div>
      <div style={{ color: "var(--soc-text-primary)", fontWeight: 700, fontSize: 14 }}>
        {data.value} {data.value > 1 ? "événements" : "événement"}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [stats, setStats] = useState(null);
  const [rules, setRules] = useState([]);
  const [timeRange, setTimeRange] = useState("2h"); // "1h", "2h", "6h", "24h"
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.serviceStatus().catch(() => null),
      api.alertStats().catch(() => null),
      api.listRules().catch(() => [])
    ]).then(([resStatus, resStats, resRules]) => {
      if (resStatus) setStatus(resStatus);
      if (resStats) setStats(resStats);
      if (resRules) setRules(resRules);
      setLoading(false);
    });
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  const enabledRules = rules.filter((r) => r.enabled).length;

  const prioData = useMemo(() => {
    if (!stats || !stats.by_priority) return [];
    return Object.entries(stats.by_priority).map(([p, count]) => ({
      name: `Priorité ${p}`,
      value: count,
      p
    }));
  }, [stats]);

  // Adjust timeline according to time range filter
  const timelineData = useMemo(() => {
    const raw = stats?.timeline ?? [];
    if (!raw.length) return [];
    if (timeRange === "1h") {
      return raw.slice(-6); // last 6 10-minute buckets = 1 hour
    }
    if (timeRange === "2h") {
      return raw; // full 12 buckets = 2 hours
    }
    return raw;
  }, [stats, timeRange]);

  const p1Count = stats?.by_priority?.["1"] ?? 0;

  return (
    <div>
      <PageHeader
        title="Tableau de bord SOC"
        subtitle="Vue d'ensemble de la sonde Snort 3, télémétrie en direct et détection d'intrusions."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={14} className={loading ? "spin" : ""} />}
              onClick={load}
            >
              Actualiser
            </Button>
          </div>
        }
      />

      {/* Quick Actions Bar */}
      <div
        className="card"
        style={{
          padding: "12px 18px",
          marginBottom: 20,
          background: "linear-gradient(90deg, #101a2c 0%, #0c1422 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12
        }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--soc-text-secondary)" }}>
          Raccourcis Opérationnels :
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            icon={<ShieldAlert size={14} color="#ef4444" />}
            onClick={() => navigate("/alerts")}
          >
            Voir alertes P1
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<PlusCircle size={14} color="#3b82f6" />}
            onClick={() => navigate("/rules")}
          >
            Nouvelle règle
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<FileSearch size={14} color="#10b981" />}
            onClick={() => navigate("/pcap")}
          >
            Analyser un PCAP
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Activity size={14} color="#f59e0b" />}
            onClick={() => navigate("/service")}
          >
            Pilotage Service
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Terminal size={14} />}
            onClick={() => navigate("/console")}
          >
            Console CLI
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid cols-4" style={{ marginBottom: 20 }}>
        <StatCard
          label="Moteur Snort 3"
          value={status?.running ? "ACTIF" : "ARRÊTÉ"}
          sub={
            status?.running ? (
              <span className="flex items-center gap-1 text-success">
                <span className="dot-live" />
                PID: {status.pid || "—"} • Mode {status.interface || "auto"}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-danger">
                <span className="dot-dead" />
                Service non démarré
              </span>
            )
          }
          icon={status?.running ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
          color={status?.running ? "success" : "danger"}
          onClick={() => navigate("/service")}
        />

        <StatCard
          label="Alertes récentes"
          value={stats?.total ?? "—"}
          sub="Fenêtre d'analyse glissante (2h)"
          icon={<ShieldAlert size={20} />}
          color="accent"
          onClick={() => navigate("/alerts")}
        />

        <StatCard
          label="Règles actives"
          value={`${enabledRules} / ${rules.length}`}
          sub={`${rules.length ? Math.round((enabledRules / rules.length) * 100) : 0}% des signatures activées`}
          icon={<Sliders size={20} />}
          color="info"
          onClick={() => navigate("/rules")}
        />

        <StatCard
          label="Menaces critiques (P1)"
          value={p1Count}
          sub={p1Count > 0 ? "Action immédiate requise" : "Aucune alerte critique en cours"}
          icon={<Flame size={20} />}
          color={p1Count > 0 ? "danger" : "warning"}
          onClick={() => navigate("/alerts")}
        />
      </div>

      {/* Charts Section */}
      <div className="grid cols-2" style={{ marginBottom: 20 }}>
        {/* Timeline Chart with Range Selector */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <Clock size={16} color="var(--soc-accent)" />
              <span>Volume des alertes dans le temps</span>
            </h3>

            {/* Time Filter Toggle */}
            <div className="flex gap-1">
              {["1h", "2h"].map((range) => (
                <button
                  key={range}
                  className={`btn sm ${timeRange === range ? "primary" : "ghost"}`}
                  style={{ padding: "3px 8px", fontSize: 11 }}
                  onClick={() => setTimeRange(range)}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2d45" />
              <XAxis dataKey="bucket" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} tickLine={false} />
              <RechartsTooltip content={<CustomChartTooltip />} />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Priority Distribution Pie */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <ShieldAlert size={16} color="var(--soc-prio-2)" />
              <span>Distribution par sévérité</span>
            </h3>
          </div>

          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={prioData}
                dataKey="value"
                nameKey="name"
                outerRadius={85}
                innerRadius={45}
                paddingAngle={4}
                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                labelLine={false}
              >
                {prioData.map((d) => (
                  <Cell key={d.p} fill={PRIO_COLORS[d.p] || "#3b82f6"} />
                ))}
              </Pie>
              <RechartsTooltip content={<CustomChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Signatures Table */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <TrendingUp size={16} color="var(--soc-success)" />
            <span>Top signatures déclenchées</span>
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/alerts")}
            style={{ fontSize: 12 }}
          >
            <span>Voir toutes les alertes</span>
            <ArrowRight size={14} />
          </Button>
        </div>

        <div className="table-wrap">
          <table className="datatable">
            <thead>
              <tr>
                <th>Signature Snort</th>
                <th style={{ width: 140, textAlign: "right" }}>Déclenchements</th>
                <th style={{ width: 100, textAlign: "center" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {(!stats?.by_signature || stats.by_signature.length === 0) ? (
                <tr>
                  <td colSpan={3} style={{ textAlign: "center", color: "var(--soc-text-muted)", padding: 24 }}>
                    Aucune signature enregistrée dans cette fenêtre temporelle.
                  </td>
                </tr>
              ) : (
                stats.by_signature.map((s, idx) => (
                  <tr
                    key={s.msg || idx}
                    className="clickable"
                    onClick={() => navigate("/alerts")}
                  >
                    <td style={{ fontWeight: 500 }}>
                      <div className="flex items-center gap-2">
                        <Badge variant="prio-2" style={{ fontSize: 10 }}>P2</Badge>
                        <span>{s.msg}</span>
                      </div>
                    </td>
                    <td className="mono tabular" style={{ textAlign: "right", fontWeight: 700 }}>
                      {s.count}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <Button variant="ghost" size="sm" style={{ padding: "2px 8px" }}>
                        Inspecter
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
