import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldAlert,
  Pause,
  Play,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Layers,
  ArrowRight,
  Sliders,
  Filter
} from "lucide-react";
import { useAlerts } from "../AlertsContext.jsx";
import PageHeader from "../components/layout/PageHeader.jsx";
import DataTable from "../components/ui/DataTable.jsx";
import Drawer from "../components/ui/Drawer.jsx";
import Badge from "../components/ui/Badge.jsx";
import Button from "../components/ui/Button.jsx";
import Tooltip from "../components/ui/Tooltip.jsx";

const PRIO_LABEL = { 1: "Critique (P1)", 2: "Moyenne (P2)", 3: "Basse (P3)" };

export default function Alerts() {
  const navigate = useNavigate();
  const { alerts, connected, reload } = useAlerts() || { alerts: [], connected: false, reload: () => {} };

  const [prioFilter, setPrioFilter] = useState("all");
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [frozenAlerts, setFrozenAlerts] = useState([]);
  const [copied, setCopied] = useState(false);

  // Toggle freeze/pause of real-time stream
  const togglePause = () => {
    if (!isPaused) {
      setFrozenAlerts([...alerts]);
      setIsPaused(true);
    } else {
      setIsPaused(false);
      setFrozenAlerts([]);
    }
  };

  const displayAlerts = isPaused ? frozenAlerts : alerts;

  // Filter by priority
  const filteredAlerts = useMemo(() => {
    if (prioFilter === "all") return displayAlerts;
    return displayAlerts.filter(a => String(a.priority) === prioFilter);
  }, [displayAlerts, prioFilter]);

  const copyJson = (data) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fmtDate = (ts) => {
    if (!ts) return "—";
    try {
      const d = new Date(ts);
      return d.toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    } catch {
      return String(ts);
    }
  };

  const columns = [
    {
      key: "timestamp",
      label: "Horodatage",
      width: 170,
      render: (val) => <span className="mono">{fmtDate(val)}</span>
    },
    {
      key: "priority",
      label: "Sévérité",
      width: 90,
      render: (val) => (
        <Badge variant={val}>
          P{val}
        </Badge>
      )
    },
    {
      key: "msg",
      label: "Signature Snort / Message",
      render: (val) => (
        <span style={{ fontWeight: 600, color: "var(--soc-text-primary)" }}>
          {val}
        </span>
      )
    },
    {
      key: "proto",
      label: "Proto",
      width: 80,
      render: (val) => <span className="badge neutral mono" style={{ fontSize: 11 }}>{val || "—"}</span>
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
    },
    {
      key: "sid",
      label: "SID",
      width: 90,
      render: (val) => <span className="mono text-muted">{val ?? "—"}</span>
    }
  ];

  return (
    <div>
      <PageHeader
        title="Journal des alertes de détection"
        subtitle={`Flux temps réel des détections de la sonde Snort 3 • ${filteredAlerts.length} événement(s) répertorié(s)`}
        actions={
          <div className="flex items-center gap-2">
            {/* Real-time Pause toggle */}
            <Button
              variant={isPaused ? "primary" : "secondary"}
              size="sm"
              icon={isPaused ? <Play size={14} /> : <Pause size={14} />}
              onClick={togglePause}
            >
              {isPaused ? "Reprendre le flux direct" : "Figer l'affichage (Pause)"}
            </Button>

            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={14} />}
              onClick={reload}
            >
              Actualiser
            </Button>
          </div>
        }
      />

      {/* Priority Filter Bar */}
      <div className="flex items-center gap-2" style={{ marginBottom: 16 }}>
        <Filter size={14} color="var(--soc-text-muted)" />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--soc-text-secondary)" }}>
          Filtrer par sévérité :
        </span>
        <div className="flex gap-1">
          {[
            { id: "all", label: "Toutes" },
            { id: "1", label: "Critique (P1)", variant: "prio-1" },
            { id: "2", label: "Moyenne (P2)", variant: "prio-2" },
            { id: "3", label: "Basse (P3)", variant: "prio-3" },
          ].map(btn => (
            <button
              key={btn.id}
              className={`btn sm ${prioFilter === btn.id ? "primary" : "ghost"}`}
              style={{ fontSize: 11.5, padding: "3px 10px" }}
              onClick={() => setPrioFilter(btn.id)}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {isPaused && (
          <Badge variant="warning" dot={true} style={{ marginLeft: "auto" }}>
            FLUX TEMPS RÉEL FIGÉ POUR INVESTIGATION
          </Badge>
        )}
      </div>

      {/* Modern DataTable */}
      <DataTable
        columns={columns}
        data={filteredAlerts}
        searchKeys={["msg", "src_addr", "dst_addr", "proto", "sid"]}
        onRowClick={(row) => setSelectedAlert(row)}
        exportFilename="snort_alerts"
        defaultSort={{ key: "timestamp", direction: "desc" }}
        emptyMessage="Aucune alerte trouvée correspondant aux critères."
      />

      {/* Forensic Alert Inspection Drawer */}
      <Drawer
        isOpen={Boolean(selectedAlert)}
        onClose={() => setSelectedAlert(null)}
        title="Détails forensiques de l'alerte"
        subtitle={selectedAlert?.msg}
        width={580}
        footer={
          <div className="flex items-center justify-between w-full">
            <Button
              variant="secondary"
              size="sm"
              icon={copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
              onClick={() => copyJson(selectedAlert)}
            >
              {copied ? "JSON Copié !" : "Copier le JSON brut"}
            </Button>
            {selectedAlert?.sid && (
              <Button
                variant="primary"
                size="sm"
                icon={<Sliders size={14} />}
                onClick={() => {
                  setSelectedAlert(null);
                  navigate(`/rules`);
                }}
              >
                Inspecter la règle (SID {selectedAlert.sid})
              </Button>
            )}
          </div>
        }
      >
        {selectedAlert && (
          <div className="flex flex-col gap-4">
            {/* Severity & Incident Banner */}
            <div
              style={{
                padding: "16px",
                borderRadius: 8,
                background: selectedAlert.priority === 1
                  ? "rgba(239, 68, 68, 0.12)"
                  : selectedAlert.priority === 2
                  ? "rgba(245, 158, 11, 0.12)"
                  : "rgba(56, 189, 248, 0.12)",
                border: `1px solid ${
                  selectedAlert.priority === 1
                    ? "rgba(239, 68, 68, 0.3)"
                    : selectedAlert.priority === 2
                    ? "rgba(245, 158, 11, 0.3)"
                    : "rgba(56, 189, 248, 0.3)"
                }`
              }}
            >
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <Badge variant={selectedAlert.priority} dot={true}>
                  {PRIO_LABEL[selectedAlert.priority] || `Priorité ${selectedAlert.priority}`}
                </Badge>
                <span className="mono text-muted" style={{ fontSize: 11.5 }}>
                  {fmtDate(selectedAlert.timestamp)}
                </span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--soc-text-primary)" }}>
                {selectedAlert.msg}
              </div>
            </div>

            {/* Network Vector Section */}
            <div className="card" style={{ padding: 16 }}>
              <h4 style={{ margin: "0 0 12px", fontSize: 12.5, textTransform: "uppercase", color: "var(--soc-text-secondary)" }}>
                Vecteur Réseau
              </h4>
              <div className="grid cols-2" style={{ gap: 12 }}>
                <div>
                  <label>Adresse Source</label>
                  <div className="mono" style={{ fontSize: 13, color: "var(--soc-text-primary)" }}>
                    {selectedAlert.src_addr || "—"}
                  </div>
                  <div className="mono text-muted" style={{ fontSize: 11.5 }}>
                    Port: {selectedAlert.src_port ?? "—"}
                  </div>
                </div>

                <div>
                  <label>Adresse Destination</label>
                  <div className="mono" style={{ fontSize: 13, color: "var(--soc-text-primary)" }}>
                    {selectedAlert.dst_addr || "—"}
                  </div>
                  <div className="mono text-muted" style={{ fontSize: 11.5 }}>
                    Port: {selectedAlert.dst_port ?? "—"}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--soc-border)" }}>
                <div className="flex items-center gap-4">
                  <div>
                    <label>Protocole</label>
                    <span className="badge neutral mono">{selectedAlert.proto || "TCP"}</span>
                  </div>
                  {selectedAlert.action && (
                    <div>
                      <label>Action Moteur</label>
                      <span className="badge neutral mono">{selectedAlert.action}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Snort Metadata Section */}
            <div className="card" style={{ padding: 16 }}>
              <h4 style={{ margin: "0 0 12px", fontSize: 12.5, textTransform: "uppercase", color: "var(--soc-text-secondary)" }}>
                Métadonnées Snort 3
              </h4>
              <div className="grid cols-2" style={{ gap: 12 }}>
                <div>
                  <label>Snort SID</label>
                  <span className="mono" style={{ fontWeight: 700, color: "var(--soc-accent)" }}>
                    {selectedAlert.sid ?? "—"}
                  </span>
                </div>
                <div>
                  <label>Classification</label>
                  <span style={{ fontSize: 12.5, color: "var(--soc-text-primary)" }}>
                    {selectedAlert.classtype || "Non classifié"}
                  </span>
                </div>
              </div>
            </div>

            {/* Raw JSON Dump */}
            <div className="card" style={{ padding: 16 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <h4 style={{ margin: 0, fontSize: 12.5, textTransform: "uppercase", color: "var(--soc-text-secondary)" }}>
                  Payload JSON brut
                </h4>
              </div>
              <pre
                className="mono"
                style={{
                  background: "#080c14",
                  padding: 12,
                  borderRadius: 6,
                  border: "1px solid var(--soc-border)",
                  fontSize: 11.5,
                  overflowX: "auto",
                  margin: 0
                }}
              >
                {JSON.stringify(selectedAlert, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
