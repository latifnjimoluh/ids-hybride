import React, { useEffect, useState, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine
} from "recharts";
import {
  BrainCircuit,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCw,
  Sparkles,
  Layers,
  Database,
  BarChart3
} from "lucide-react";
import { api } from "../api.js";
import { useToast } from "../useToast.jsx";
import PageHeader from "../components/layout/PageHeader.jsx";
import StatCard from "../components/ui/StatCard.jsx";
import DataTable from "../components/ui/DataTable.jsx";
import Badge from "../components/ui/Badge.jsx";
import Button from "../components/ui/Button.jsx";

const PRIO_LABEL = { 1: "Critique", 2: "Moyenne", 3: "Basse" };

function CustomMlTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0].payload;

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
        Score d'anomalie : {item.bucket}
      </div>
      <div style={{ color: item.anomaly ? "#ef4444" : "#3b82f6", fontWeight: 700, fontSize: 13 }}>
        {item.count} événement(s)
      </div>
      <div style={{ fontSize: 11, color: "var(--soc-text-muted)", marginTop: 2 }}>
        {item.anomaly ? "Zone d'anomalie statistique avérée" : "Distribution nominale"}
      </div>
    </div>
  );
}

export default function ML() {
  const [status, setStatus] = useState(null);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadingAnomalies, setLoadingAnomalies] = useState(false);
  const { show, node } = useToast();

  const loadStatus = () => {
    api.mlStatus()
      .then(setStatus)
      .catch((e) => show(e.message, "err"));
  };

  const loadAnomalies = async () => {
    setLoadingAnomalies(true);
    try {
      const res = await api.mlAnomalies(300);
      setData(res);
    } catch (e) {
      show(e.message, "err");
    } finally {
      setLoadingAnomalies(false);
    }
  };

  useEffect(() => {
    loadStatus();
    loadAnomalies();
  }, []);

  const train = async () => {
    setBusy(true);
    try {
      const s = await api.mlTrain();
      setStatus(s);
      show(`Modèle Isolation Forest ré-entraîné sur ${s.n_samples} événements ✓`);
      await loadAnomalies();
    } catch (e) {
      show(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  // Histogram generation with dynamic threshold reference
  const { histogramData, thresholdBucket } = useMemo(() => {
    if (!data?.items?.length) return { histogramData: [], thresholdBucket: null };
    const scores = data.items.map((i) => i.anomaly_score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const span = max - min || 1;

    const bins = Array.from({ length: 12 }, (_, i) => ({
      bucket: (min + (span * i) / 12).toFixed(2),
      count: 0,
      anomaly: false,
    }));

    let foundThreshold = null;

    for (const it of data.items) {
      let idx = Math.floor(((it.anomaly_score - min) / span) * 12);
      if (idx >= 12) idx = 11;
      if (idx < 0) idx = 0;
      bins[idx].count += 1;
      if (it.is_anomaly) {
        bins[idx].anomaly = true;
        if (!foundThreshold || Number(bins[idx].bucket) < Number(foundThreshold)) {
          foundThreshold = bins[idx].bucket;
        }
      }
    }

    return { histogramData: bins, thresholdBucket: foundThreshold };
  }, [data]);

  const installed = Boolean(status?.installed);
  const trained = Boolean(status?.trained);

  const anomalyColumns = [
    {
      key: "anomaly_score",
      label: "Score",
      width: 100,
      render: (val) => (
        <span className="mono" style={{ fontWeight: 700, color: val > 0.5 ? "var(--soc-prio-1)" : "var(--soc-accent)" }}>
          {typeof val === "number" ? val.toFixed(3) : val}
        </span>
      )
    },
    {
      key: "is_anomaly",
      label: "Statut",
      width: 110,
      render: (val) => (
        <Badge variant={val ? "prio-1" : "neutral"} dot={val}>
          {val ? "Anomalie" : "Normal"}
        </Badge>
      )
    },
    {
      key: "msg",
      label: "Signature / Événement",
      render: (val) => <span style={{ fontWeight: 500 }}>{val || "—"}</span>
    },
    {
      key: "priority",
      label: "Sévérité",
      width: 90,
      render: (val) => <Badge variant={val}>P{val}</Badge>
    },
    {
      key: "proto",
      label: "Proto",
      width: 80,
      render: (val) => <span className="mono text-muted">{val || "TCP"}</span>
    },
    {
      key: "src_addr",
      label: "Source",
      width: 160,
      render: (_, row) => (
        <span className="mono">
          {row.src_addr}{row.src_port ? `:${row.src_port}` : ""}
        </span>
      )
    },
    {
      key: "dst_addr",
      label: "Destination",
      width: 160,
      render: (_, row) => (
        <span className="mono">
          {row.dst_addr}{row.dst_port ? `:${row.dst_port}` : ""}
        </span>
      )
    }
  ];

  return (
    <div>
      <PageHeader
        title="Détection d'anomalies ML (Isolation Forest)"
        subtitle="Analyse comportementale non supervisée via scikit-learn pour détecter les menaces zero-day sans signature."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<RotateCw size={14} className={loadingAnomalies ? "spin" : ""} />}
              onClick={loadAnomalies}
              disabled={!trained}
            >
              Recalculer les anomalies
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<BrainCircuit size={14} />}
              onClick={train}
              loading={busy}
              disabled={!installed}
            >
              {trained ? "Ré-entraîner le modèle" : "Entraîner le modèle"}
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid cols-4" style={{ marginBottom: 20 }}>
        <StatCard
          label="Moteur d'inférence"
          value={installed ? "scikit-learn" : "Non installé"}
          sub={installed ? "IsolationForest(n_estimators=200)" : "pip install scikit-learn"}
          icon={<Cpu size={20} />}
          color={installed ? "success" : "danger"}
        />

        <StatCard
          label="État du modèle"
          value={trained ? "Entraîné" : "Non entraîné"}
          sub={
            status?.trained_at
              ? `Entraîné : ${new Date(status.trained_at).toLocaleTimeString()}`
              : "Apprentissage requis"
          }
          icon={<BrainCircuit size={20} />}
          color={trained ? "info" : "warning"}
        />

        <StatCard
          label="Événements appris"
          value={status?.n_samples ?? 0}
          sub="Fenêtre d'entraînement historique"
          icon={<Database size={20} />}
          color="accent"
        />

        <StatCard
          label="Anomalies détectées"
          value={data?.anomalies ?? 0}
          sub={`Taux de contamination configuré : ${(status?.contamination ? status.contamination * 100 : 5)}%`}
          icon={<AlertTriangle size={20} />}
          color={data?.anomalies ? "danger" : "success"}
        />
      </div>

      {/* Anomaly Histogram with Decision Threshold */}
      {histogramData.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <h3 className="card-title">
              <BarChart3 size={16} color="var(--soc-accent)" />
              <span>Histogramme de distribution des scores d'anomalies</span>
            </h3>
            <div className="flex items-center gap-3" style={{ fontSize: 11.5 }}>
              <span className="flex items-center gap-1">
                <span style={{ width: 10, height: 10, background: "#3b82f6", borderRadius: 2 }} />
                Événements nominaux
              </span>
              <span className="flex items-center gap-1">
                <span style={{ width: 10, height: 10, background: "#ef4444", borderRadius: 2 }} />
                Anomalies critiques
              </span>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={histogramData} margin={{ top: 15, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2d45" />
              <XAxis dataKey="bucket" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} tickLine={false} />
              <RechartsTooltip content={<CustomMlTooltip />} />
              {thresholdBucket && (
                <ReferenceLine
                  x={thresholdBucket}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  label={{
                    value: "Seuil critique d'anomalie",
                    fill: "#ef4444",
                    fontSize: 11,
                    position: "top"
                  }}
                />
              )}
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {histogramData.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={entry.anomaly ? "#ef4444" : "#3b82f6"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--soc-text-muted)" }}>
            L'algorithme calcule un score d'isolation pour chaque paquet. Les points dépassant le seuil critique (en rouge) représentent des anomalies comportementales hautement divergentes.
          </p>
        </div>
      )}

      {/* Anomalies DataTable */}
      {data?.items && (
        <div style={{ marginTop: 20 }}>
          <div style={{ marginBottom: 10, fontSize: 15, fontWeight: 700, color: "var(--soc-text-primary)" }}>
            Événements analysés & anomalies comportementales
          </div>
          <DataTable
            columns={anomalyColumns}
            data={data.items}
            searchKeys={["msg", "src_addr", "dst_addr", "proto"]}
            exportFilename="snort_ml_anomalies"
            defaultSort={{ key: "anomaly_score", direction: "desc" }}
            emptyMessage="Aucun événement anormal détecté."
          />
        </div>
      )}

      {node}
    </div>
  );
}
