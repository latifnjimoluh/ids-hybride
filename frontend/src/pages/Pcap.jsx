import React, { useEffect, useRef, useState } from "react";
import {
  FileSearch,
  UploadCloud,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Terminal,
  FileSpreadsheet,
  FileJson
} from "lucide-react";
import { api } from "../api.js";
import { useToast } from "../useToast.jsx";
import PageHeader from "../components/layout/PageHeader.jsx";
import DataTable from "../components/ui/DataTable.jsx";
import Badge from "../components/ui/Badge.jsx";
import Button from "../components/ui/Button.jsx";
import LoadingSpinner from "../components/ui/LoadingSpinner.jsx";

const PRIO_LABEL = { 1: "Critique", 2: "Moyenne", 3: "Basse" };

export default function Pcap() {
  const [history, setHistory] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0); // 0: Idle, 1: Upload, 2: Snort 3 Inspection, 3: Completed
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [showRawOutput, setShowRawOutput] = useState(false);
  const fileRef = useRef(null);
  const { show, node } = useToast();

  const loadHistory = () => {
    api.listPcaps()
      .then(setHistory)
      .catch(() => {});
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const analyze = async (file) => {
    if (!file) return;
    setSelectedFile(file);
    setBusy(true);
    setStep(1);

    try {
      // Step 1: Uploading
      setTimeout(() => { if (setStep) setStep(2); }, 600);

      const res = await api.analyzePcap(file);
      setStep(3);
      setResult(res);
      show(`Analyse de ${file.name} terminée : ${res.alerts?.length || 0} alerte(s) détectée(s) ✓`);
      loadHistory();
    } catch (e) {
      show(e.message || "Erreur lors de l'analyse PCAP", "err");
      setStep(0);
    } finally {
      setBusy(false);
    }
  };

  const openResult = async (id) => {
    try {
      const res = await api.pcapResult(id);
      setResult(res);
      show(`Rapport d'analyse ${res.filename} chargé.`);
    } catch (e) {
      show(e.message, "err");
    }
  };

  const fmtSize = (b) => {
    if (!b) return "0 Ko";
    return b > 1e6 ? `${(b / 1e6).toFixed(1)} Mo` : `${(b / 1024).toFixed(0)} Ko`;
  };

  const alertColumns = [
    {
      key: "priority",
      label: "Sévérité",
      width: 90,
      render: (val) => <Badge variant={val}>P{val}</Badge>
    },
    {
      key: "msg",
      label: "Signature déclenchée",
      render: (val) => <span style={{ fontWeight: 600 }}>{val}</span>
    },
    {
      key: "src_addr",
      label: "IP Source",
      width: 160,
      render: (val, row) => (
        <span className="mono">{val}{row.src_port ? `:${row.src_port}` : ""}</span>
      )
    },
    {
      key: "dst_addr",
      label: "IP Destination",
      width: 160,
      render: (val, row) => (
        <span className="mono">{val}{row.dst_port ? `:${row.dst_port}` : ""}</span>
      )
    },
    {
      key: "sid",
      label: "SID",
      width: 90,
      render: (val) => <span className="mono text-muted">{val ?? "—"}</span>
    }
  ];

  const historyColumns = [
    {
      key: "filename",
      label: "Fichier de capture",
      render: (val) => (
        <div className="flex items-center gap-2">
          <FileCode size={15} color="var(--soc-accent)" />
          <span style={{ fontWeight: 600 }}>{val}</span>
        </div>
      )
    },
    {
      key: "size_bytes",
      label: "Taille",
      width: 110,
      render: (val) => <span className="mono">{fmtSize(val)}</span>
    },
    {
      key: "analyzed_at",
      label: "Date d'analyse",
      width: 170,
      render: (val) => (
        <span className="mono">
          {new Date(val).toLocaleString("fr-FR")}
        </span>
      )
    },
    {
      key: "alert_count",
      label: "Alertes",
      width: 100,
      render: (val) => (
        <Badge variant={val > 0 ? "prio-1" : "success"}>
          {val} {val > 1 ? "alertes" : "alerte"}
        </Badge>
      )
    },
    {
      key: "action",
      label: "Rapport",
      sortable: false,
      width: 100,
      render: (_, row) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => openResult(row.id)}
        >
          Consulter
        </Button>
      )
    }
  ];

  return (
    <div>
      <PageHeader
        title="Analyse forensique PCAP"
        subtitle="Téléversement et inspection approfondie de fichiers de paquets réseaux via Snort 3 (snort -r <file> -c snort.lua)."
      />

      {/* Modern Dropzone */}
      <div
        className={`dropzone ${dragActive ? "active" : ""}`}
        style={{ marginBottom: 20 }}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            analyze(e.dataTransfer.files[0]);
          }
        }}
        onClick={() => !busy && fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pcap,.pcapng,.cap"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              analyze(e.target.files[0]);
            }
          }}
        />

        <div className="flex flex-col items-center gap-3">
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "rgba(59, 130, 246, 0.12)",
              color: "var(--soc-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <UploadCloud size={28} />
          </div>

          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--soc-text-primary)", marginBottom: 4 }}>
              Glissez-déposez une capture réseau (.pcap, .pcapng, .cap)
            </div>
            <div style={{ fontSize: 12.5, color: "var(--soc-text-secondary)" }}>
              ou cliquez pour parcourir les fichiers de votre poste (taille maximale : 100 Mo)
            </div>
          </div>

          <Button
            variant="primary"
            disabled={busy}
            loading={busy}
            onClick={(e) => {
              e.stopPropagation();
              fileRef.current?.click();
            }}
            style={{ marginTop: 6 }}
          >
            {busy ? "Analyse en cours..." : "Sélectionner un fichier PCAP"}
          </Button>
        </div>
      </div>

      {/* Stepped Progress Indicator during analysis */}
      {busy && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: "var(--soc-text-primary)" }}>
            Progression de l'analyse : <span className="mono">{selectedFile?.name}</span>
          </div>

          <div className="flex items-center justify-between" style={{ position: "relative", gap: 12 }}>
            <div className="flex items-center gap-2">
              <Badge variant={step >= 1 ? "success" : "neutral"} dot={step === 1}>
                1. Téléversement
              </Badge>
            </div>
            <ArrowRight size={14} color="var(--soc-text-muted)" />
            <div className="flex items-center gap-2">
              <Badge variant={step >= 2 ? "success" : "neutral"} dot={step === 2}>
                2. Décodage Snort 3
              </Badge>
            </div>
            <ArrowRight size={14} color="var(--soc-text-muted)" />
            <div className="flex items-center gap-2">
              <Badge variant={step >= 3 ? "success" : "neutral"} dot={step === 3}>
                3. Corrélation des alertes
              </Badge>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <LoadingSpinner size={18} message="Traitement par le moteur d'inspection Snort..." />
          </div>
        </div>
      )}

      {/* Active PCAP Result Section */}
      {result && (
        <div className="card" style={{ marginBottom: 24, border: "1px solid #2a3c5a" }}>
          <div className="card-header">
            <h3 className="card-title">
              <FileCode size={16} color="var(--soc-accent)" />
              <span>Rapport d'inspection : {result.filename}</span>
            </h3>
            <span className="mono text-muted" style={{ fontSize: 12 }}>
              Taille : {fmtSize(result.size_bytes)}
            </span>
          </div>

          {/* Stats Grid */}
          {result.stats && (
            <div className="grid cols-4" style={{ gap: 12, marginBottom: 18 }}>
              {Object.entries(result.stats).map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    padding: 12,
                    background: "var(--soc-bg-elevated)",
                    borderRadius: 6,
                    border: "1px solid var(--soc-border)"
                  }}
                >
                  <div style={{ fontSize: 11, textTransform: "uppercase", color: "var(--soc-text-secondary)", marginBottom: 4 }}>
                    {k}
                  </div>
                  <div className="mono tabular" style={{ fontSize: 16, fontWeight: 700, color: "var(--soc-text-primary)" }}>
                    {String(v)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Raw Snort Terminal Toggle */}
          {result.output && (
            <div style={{ marginBottom: 18 }}>
              <button
                className="btn ghost sm"
                onClick={() => setShowRawOutput(!showRawOutput)}
                style={{ fontSize: 12, color: "var(--soc-text-secondary)", padding: 0 }}
              >
                <Terminal size={13} />
                <span>{showRawOutput ? "Masquer la sortie brute Snort" : "Afficher les logs d'exécution Snort"}</span>
                {showRawOutput ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>

              {showRawOutput && (
                <pre
                  className="mono"
                  style={{
                    background: "#05080e",
                    padding: 14,
                    borderRadius: 6,
                    border: "1px solid var(--soc-border)",
                    marginTop: 8,
                    fontSize: 12,
                    maxHeight: 260,
                    overflowY: "auto"
                  }}
                >
                  {result.output}
                </pre>
              )}
            </div>
          )}

          {/* Extracted Alerts DataTable */}
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: "var(--soc-text-primary)" }}>
              Alertes de sécurité extraites ({result.alerts?.length || 0})
            </div>
            <DataTable
              columns={alertColumns}
              data={result.alerts || []}
              searchKeys={["msg", "src_addr", "dst_addr", "proto", "sid"]}
              exportFilename={`pcap_${result.filename}_alerts`}
              emptyMessage="Aucune alerte générée par ce fichier PCAP."
            />
          </div>
        </div>
      )}

      {/* Previous PCAP Analyses History */}
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: "var(--soc-text-primary)" }}>
          Historique des captures analysées
        </div>
        <DataTable
          columns={historyColumns}
          data={history}
          searchKeys={["filename"]}
          exportFilename="pcap_history"
          defaultSort={{ key: "analyzed_at", direction: "desc" }}
          emptyMessage="Aucune analyse PCAP précédente enregistrée."
        />
      </div>

      {node}
    </div>
  );
}
