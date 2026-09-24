import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useToast } from "../useToast.jsx";

const PROFILES = [
  ["none", "Aucun (config brute)"],
  ["connectivity", "Connectivity, performance/uptime"],
  ["balanced", "Balanced, compromis (recommandé)"],
  ["security", "Security, orienté sécurité"],
  ["max_detect", "Max Detect, sécurité maximale"],
];

export default function Config() {
  const [cfg, setCfg] = useState(null);
  const [tab, setTab] = useState("simple");
  const [raw, setRaw] = useState(null);
  const { show, node } = useToast();

  useEffect(() => {
    api.getConfig().then(setCfg).catch((e) => show(e.message, "err"));
  }, []);

  useEffect(() => {
    if (tab === "raw" && raw === null) {
      api.getRawConfig().then(setRaw).catch((e) => show(e.message, "err"));
    }
  }, [tab]);

  const save = async () => {
    try {
      const res = await api.updateConfig(cfg);
      setCfg(res);
      show("Configuration enregistrée ✓");
    } catch (e) { show(e.message, "err"); }
  };

  const saveRaw = async () => {
    try {
      const res = await api.updateRawConfig(raw.content);
      setRaw(res);
      show("snort.lua enregistré ✓");
    } catch (e) { show(e.message, "err"); }
  };

  if (!cfg) return <p className="muted">Chargement…</p>;

  const set = (k, v) => setCfg({ ...cfg, [k]: v });

  return (
    <div>
      <h1 className="page-title">Configuration</h1>
      <p className="page-sub">Variables réseau, profil de détection, et édition directe de snort.lua.</p>

      <div className="toolbar">
        <button className={tab === "simple" ? "primary" : ""} onClick={() => setTab("simple")}>Assistée</button>
        <button className={tab === "raw" ? "primary" : ""} onClick={() => setTab("raw")}>Éditeur snort.lua</button>
      </div>

      {tab === "raw" ? (
        <div className="card">
          <h3>Édition brute : <span className="mono" style={{ textTransform: "none" }}>{raw?.path || "snort.lua"}</span></h3>
          {raw === null ? (
            <p className="muted">Chargement…</p>
          ) : (
            <>
              <textarea
                className="mono"
                style={{ minHeight: "55vh", fontSize: 12.5 }}
                value={raw.content}
                onChange={(e) => setRaw({ ...raw, content: e.target.value })}
              />
              <div className="row" style={{ marginTop: 12 }}>
                <button className="primary" onClick={saveRaw}>Enregistrer snort.lua</button>
                <span className="muted" style={{ fontSize: 12 }}>Pensez à valider la config (page Règles) après modification.</span>
              </div>
            </>
          )}
          {node}
        </div>
      ) : (
      <div className="card" style={{ maxWidth: 640 }}>
        <div className="grid cols-2">
          <div className="field">
            <label>HOME_NET (réseau à protéger)</label>
            <input value={cfg.home_net} onChange={(e) => set("home_net", e.target.value)} />
          </div>
          <div className="field">
            <label>EXTERNAL_NET</label>
            <input value={cfg.external_net} onChange={(e) => set("external_net", e.target.value)} />
          </div>
          <div className="field">
            <label>Interface d'écoute</label>
            <input value={cfg.interface} onChange={(e) => set("interface", e.target.value)} />
          </div>
          <div className="field">
            <label>Profil de tuning (--tweaks)</label>
            <select value={cfg.tweak_profile} onChange={(e) => set("tweak_profile", e.target.value)}>
              {PROFILES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>

        <div className="field">
          <label>Chemin des règles</label>
          <input
            className="mono"
            value={cfg.rules_path}
            placeholder="/usr/local/etc/snort/rules/local.rules"
            onChange={(e) => set("rules_path", e.target.value)}
          />
        </div>

        <div className="field">
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={cfg.alert_json_enabled}
              onChange={(e) => set("alert_json_enabled", e.target.checked)}
              style={{ width: "auto" }}
            />
            Sortie JSON activée (alert_json), nécessaire pour l'intégration SIEM
          </label>
        </div>

        <button className="primary" onClick={save}>Enregistrer</button>
        {node}
      </div>
      )}
    </div>
  );
}
