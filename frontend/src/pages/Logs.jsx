import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  FileText,
  Search,
  Download,
  Pause,
  Play,
  RotateCw,
  Filter,
  CheckCircle2,
  AlertTriangle,
  ArrowDown
} from "lucide-react";
import { api } from "../api.js";
import PageHeader from "../components/layout/PageHeader.jsx";
import Button from "../components/ui/Button.jsx";
import Badge from "../components/ui/Badge.jsx";

export default function Logs() {
  const [data, setData] = useState({ lines: [], source: "" });
  const [auto, setAuto] = useState(true);
  const [count, setCount] = useState(200);
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all"); // "all" | "error" | "warn" | "info"
  const [stickBottom, setStickBottom] = useState(true);
  const [loading, setLoading] = useState(false);
  const logContainerRef = useRef(null);

  const load = () => {
    setLoading(true);
    api.logs(count)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    load();
    if (!auto) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [auto, count]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (stickBottom && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [data.lines, stickBottom]);

  // Filter lines by search and severity
  const filteredLines = useMemo(() => {
    if (!data.lines) return [];
    return data.lines.filter(line => {
      const lower = line.toLowerCase();
      // Severity filter
      if (severityFilter === "error" && !lower.includes("error") && !lower.includes("fatal")) {
        return false;
      }
      if (severityFilter === "warn" && !lower.includes("warn")) {
        return false;
      }
      if (severityFilter === "info" && (lower.includes("error") || lower.includes("warn") || lower.includes("fatal"))) {
        return false;
      }
      // Text search
      if (search && !lower.includes(search.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [data.lines, severityFilter, search]);

  const handleExportLogs = () => {
    const content = filteredLines.join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 10);
    const link = document.createElement("a");
    link.href = url;
    link.download = `snort_system_${dateStr}.log`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getLineClass = (line) => {
    const l = line.toLowerCase();
    if (l.includes("error") || l.includes("fatal")) return "text-danger";
    if (l.includes("warn")) return "text-warning";
    return "";
  };

  return (
    <div>
      <PageHeader
        title="Journaux d'événements & Logs Snort"
        subtitle={`Flux console du démon Snort 3 • Source : ${data.source || "/var/log/snort/snort.log"}`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Download size={14} />}
              onClick={handleExportLogs}
              title="Télécharger les logs au format .log"
            >
              Exporter les logs
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<RotateCw size={14} className={loading ? "spin" : ""} />}
              onClick={load}
            >
              Actualiser
            </Button>
          </div>
        }
      />

      {/* Toolbar: Search + Severity Filters + Auto-scroll toggle */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Search bar */}
          <div style={{ position: "relative", minWidth: 260, flex: 1, maxWidth: 360 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--soc-text-muted)" }} />
            <input
              type="text"
              placeholder="Rechercher dans les lignes de log..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 32, height: 34, fontSize: 12.5 }}
            />
          </div>

          {/* Severity filter buttons */}
          <div className="flex items-center gap-1">
            {[
              { id: "all", label: "Tous" },
              { id: "error", label: "Erreurs", color: "#ef4444" },
              { id: "warn", label: "Avertissements", color: "#f59e0b" },
              { id: "info", label: "Infos", color: "#38bdf8" },
            ].map((btn) => (
              <button
                key={btn.id}
                className={`btn sm ${severityFilter === btn.id ? "primary" : "ghost"}`}
                style={{ fontSize: 11.5, padding: "3px 8px" }}
                onClick={() => setSeverityFilter(btn.id)}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* Controls: Lines + Auto-refresh + Stick bottom */}
          <div className="flex items-center gap-3">
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              style={{ width: "auto", height: 32, fontSize: 12 }}
            >
              {[50, 200, 500, 1000].map((n) => (
                <option key={n} value={n}>{n} lignes</option>
              ))}
            </select>

            <Button
              variant={auto ? "secondary" : "ghost"}
              size="sm"
              icon={auto ? <Pause size={13} /> : <Play size={13} />}
              onClick={() => setAuto(!auto)}
              title={auto ? "Suspendre le rafraîchissement auto" : "Activer le rafraîchissement auto"}
            >
              {auto ? "Auto (3s)" : "Manuel"}
            </Button>

            <Button
              variant={stickBottom ? "primary" : "ghost"}
              size="sm"
              icon={<ArrowDown size={13} />}
              onClick={() => setStickBottom(!stickBottom)}
              title="Figer le défilement en bas de page"
            >
              Auto-scroll
            </Button>
          </div>
        </div>
      </div>

      {/* Terminal View Container */}
      <div className="terminal-window">
        <div className="terminal-header">
          <div className="flex items-center gap-2">
            <FileText size={14} color="var(--soc-accent)" />
            <span style={{ fontWeight: 600 }}>snort.log • {filteredLines.length} ligne(s) affichée(s)</span>
          </div>
          <div className="flex items-center gap-2">
            {auto && <Badge variant="success" dot={true}>LIVE TAIL</Badge>}
          </div>
        </div>

        <div
          ref={logContainerRef}
          className="terminal-body mono"
          style={{ maxHeight: "65vh", overflowY: "auto", padding: "14px 18px", fontSize: 12, lineHeight: 1.7 }}
        >
          {filteredLines.length === 0 ? (
            <div style={{ color: "var(--soc-text-muted)", textAlign: "center", padding: 30 }}>
              Aucun journal ne correspond aux critères de recherche.
            </div>
          ) : (
            filteredLines.map((line, idx) => {
              const lineClass = getLineClass(line);
              return (
                <div
                  key={idx}
                  className={`log-line ${lineClass}`}
                  style={{
                    display: "flex",
                    gap: 12,
                    borderBottom: "1px solid rgba(31, 45, 69, 0.4)",
                    padding: "2px 0"
                  }}
                >
                  <span style={{ color: "var(--soc-text-muted)", width: 40, textAlign: "right", userSelect: "none", opacity: 0.6 }}>
                    {idx + 1}
                  </span>
                  <span style={{ flex: 1, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                    {line}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
