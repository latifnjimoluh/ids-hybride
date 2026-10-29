import React, { useEffect, useRef, useState } from "react";
import {
  Terminal,
  Send,
  Trash2,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  Sparkles
} from "lucide-react";
import { api } from "../api.js";
import PageHeader from "../components/layout/PageHeader.jsx";
import Button from "../components/ui/Button.jsx";
import Badge from "../components/ui/Badge.jsx";

export default function Console() {
  const [command, setCommand] = useState("snort -V");
  const [history, setHistory] = useState([]);
  const [cmdList, setCmdList] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    api.consoleCommands()
      .then(setSuggestions)
      .catch(() => {});
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const run = async (cmd) => {
    const c = (cmd ?? command).trim();
    if (!c) return;
    setBusy(true);

    const startTs = Date.now();
    try {
      const res = await api.consoleRun(c);
      const duration = Date.now() - startTs;
      setHistory(prev => [...prev, { ...res, duration, ts: new Date().toLocaleTimeString() }]);
      setCmdList(prev => [...prev, c]);
      setHistoryIndex(-1);
    } catch (e) {
      const duration = Date.now() - startTs;
      setHistory(prev => [...prev, { command: c, output: e.message, ok: false, returncode: 1, duration, ts: new Date().toLocaleTimeString() }]);
      setCmdList(prev => [...prev, c]);
      setHistoryIndex(-1);
    } finally {
      setBusy(false);
    }
  };

  // Keyboard navigation for command history
  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      if (!busy) run();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!cmdList.length) return;
      const nextIndex = historyIndex === -1 ? cmdList.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setCommand(cmdList[nextIndex]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex === -1) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex >= cmdList.length) {
        setHistoryIndex(-1);
        setCommand("");
      } else {
        setHistoryIndex(nextIndex);
        setCommand(cmdList[nextIndex]);
      }
    }
  };

  const handleClear = () => {
    setHistory([]);
    setHistoryIndex(-1);
    inputRef.current?.focus();
  };

  const handleCopy = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div>
      <PageHeader
        title="Console Interactive CLI"
        subtitle="Exécution de commandes d'introspection Snort 3 en lecture seule et diagnostic réseau appliance."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Trash2 size={14} />}
              onClick={handleClear}
              disabled={history.length === 0}
            >
              Effacer la console
            </Button>
          </div>
        }
      />

      {/* Quick suggestions shortcuts */}
      {suggestions.length > 0 && (
        <div className="card" style={{ padding: 12, marginBottom: 16 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
            <Sparkles size={14} color="var(--soc-accent)" />
            <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", color: "var(--soc-text-secondary)" }}>
              Commandes d'introspection usuelles
            </span>
          </div>
          <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
            {suggestions.map((s) => (
              <Button
                key={s.cmd}
                variant="ghost"
                size="sm"
                title={s.desc}
                style={{ fontSize: 12, background: "var(--soc-bg-elevated)", border: "1px solid var(--soc-border)" }}
                onClick={() => {
                  setCommand(s.cmd);
                  run(s.cmd);
                }}
              >
                <span className="mono">{s.cmd}</span>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Terminal Display */}
      <div className="terminal-window" style={{ marginBottom: 16 }}>
        <div className="terminal-header">
          <div className="flex items-center gap-2">
            <Terminal size={14} color="var(--soc-accent)" />
            <span>snort3-cli • session interactive</span>
          </div>
          <span style={{ fontSize: 11, color: "var(--soc-text-muted)" }}>
            Utilisez les flèches Haut / Bas pour l'historique
          </span>
        </div>

        <div
          className="terminal-body mono"
          style={{
            maxHeight: "55vh",
            minHeight: "340px",
            overflowY: "auto",
            padding: "16px 20px"
          }}
        >
          {history.length === 0 && (
            <div style={{ color: "var(--soc-text-muted)", padding: "40px 20px", textAlign: "center" }}>
              Prêt. Saisissez une commande ci-dessous (ex: <span className="mono" style={{ color: "var(--soc-accent)" }}>snort -V</span>) ou cliquez sur un raccourci.
            </div>
          )}

          {history.map((h, i) => (
            <div
              key={i}
              style={{
                marginBottom: 16,
                paddingBottom: 14,
                borderBottom: "1px solid rgba(31, 45, 69, 0.4)"
              }}
            >
              {/* Command Prompt Line */}
              <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                <div className="flex items-center gap-2">
                  <span style={{ color: "var(--soc-accent)", fontWeight: 700 }}>ids-soc:~$</span>
                  <span style={{ color: "#ffffff", fontWeight: 600 }}>{h.command}</span>
                </div>

                <div className="flex items-center gap-3">
                  {h.ts && <span style={{ fontSize: 11, color: "var(--soc-text-muted)" }}>{h.ts}</span>}
                  {h.duration !== undefined && (
                    <span style={{ fontSize: 11, color: "var(--soc-text-muted)" }}>
                      {h.duration} ms
                    </span>
                  )}
                  {h.ok !== false ? (
                    <Badge variant="success" style={{ fontSize: 10, padding: "1px 6px" }}>
                      CODE 0
                    </Badge>
                  ) : (
                    <Badge variant="prio-1" style={{ fontSize: 10, padding: "1px 6px" }}>
                      ERREUR
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(h.output, i)}
                    title="Copier la sortie"
                    style={{ padding: 4 }}
                  >
                    {copiedIndex === i ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                  </Button>
                </div>
              </div>

              {/* Command Output Text */}
              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  color: h.ok === false ? "#ef4444" : "var(--soc-text-secondary)",
                  fontSize: 12,
                  lineHeight: 1.55
                }}
              >
                {h.output}
              </pre>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>

      {/* Terminal Input Line */}
      <div
        className="card"
        style={{
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "var(--soc-bg-surface)"
        }}
      >
        <span className="mono" style={{ color: "var(--soc-accent)", fontWeight: 700, fontSize: 14 }}>
          ids-soc:~$
        </span>
        <input
          ref={inputRef}
          type="text"
          className="mono"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Entrez une commande (ex: snort -V, ip a, snort --help)..."
          autoFocus
          disabled={busy}
          style={{
            flex: 1,
            border: "none",
            background: "transparent",
            padding: "6px 0",
            fontSize: 13
          }}
        />
        <Button
          variant="primary"
          size="sm"
          icon={<Send size={14} />}
          disabled={busy}
          loading={busy}
          onClick={() => run()}
        >
          Exécuter
        </Button>
      </div>
    </div>
  );
}
