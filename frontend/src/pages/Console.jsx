import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

export default function Console() {
  const [command, setCommand] = useState("snort -V");
  const [history, setHistory] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    api.consoleCommands().then(setSuggestions).catch(() => {});
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const run = async (cmd) => {
    const c = (cmd ?? command).trim();
    if (!c) return;
    setBusy(true);
    try {
      const res = await api.consoleRun(c);
      setHistory((h) => [...h, res]);
    } catch (e) {
      setHistory((h) => [...h, { command: c, output: e.message, ok: false }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Console Snort</h1>
      <p className="page-sub">
        Exécuter des commandes d'introspection Snort (lecture seule). Les actions de capture/modification
        passent par les pages Service et Configuration.
      </p>

      <div className="toolbar" style={{ flexWrap: "wrap" }}>
        {suggestions.map((s) => (
          <button key={s.cmd} className="sm" title={s.desc} onClick={() => { setCommand(s.cmd); run(s.cmd); }}>
            {s.cmd}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, marginBottom: 12 }}>
        <div
          className="mono"
          style={{ padding: 16, maxHeight: "50vh", overflow: "auto", fontSize: 12.5, lineHeight: 1.55 }}
        >
          {history.length === 0 && <div className="muted">Tapez une commande et appuyez sur Entrée…</div>}
          {history.map((h, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ color: "var(--accent)" }}>❯ {h.command}</div>
              <pre style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", color: h.ok === false ? "var(--red)" : "var(--text)" }}>
                {h.output}
              </pre>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>

      <div className="row">
        <span className="mono" style={{ color: "var(--accent)" }}>❯</span>
        <input
          className="mono"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !busy && run()}
          placeholder="snort -V"
          autoFocus
        />
        <button className="primary" disabled={busy} onClick={() => run()}>Exécuter</button>
      </div>
    </div>
  );
}
