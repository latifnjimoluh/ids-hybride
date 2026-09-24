import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function System() {
  const [info, setInfo] = useState(null);
  const [interfaces, setInterfaces] = useState([]);
  const [daqs, setDaqs] = useState([]);
  const [plugins, setPlugins] = useState([]);
  const [kind, setKind] = useState("inspector");

  useEffect(() => {
    api.systemInfo().then(setInfo).catch(() => {});
    api.interfaces().then(setInterfaces).catch(() => {});
    api.daqs().then(setDaqs).catch(() => {});
  }, []);

  useEffect(() => {
    api.plugins(kind).then(setPlugins).catch(() => {});
  }, [kind]);

  const KINDS = ["inspector", "codec", "logger", "ips_action", "ips_option"];

  return (
    <div>
      <h1 className="page-title">Système</h1>
      <p className="page-sub">Introspection du moteur Snort : version, plugins, DAQ, interfaces (équiv. snort -V / --list-*).</p>

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="card"><div className="stat" style={{ fontSize: 18 }}>{info?.version || "—"}</div><div className="stat-label">Version</div></div>
        <div className="card"><div className="stat">{info?.total_plugins ?? "—"}</div><div className="stat-label">Plugins chargés</div></div>
        <div className="card"><div className="stat">{info?.daq_modules ?? "—"}</div><div className="stat-label">Modules DAQ</div></div>
        <div className="card">
          <div className="stat" style={{ color: info?.hyperscan ? "var(--green)" : "var(--text-dim)" }}>
            {info?.hyperscan ? "Oui" : "Non"}
          </div>
          <div className="stat-label">Hyperscan</div>
        </div>
      </div>

      {info && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Détails du moteur</h3>
          <div className="grid cols-4">
            <div><div className="stat-label">Inspecteurs</div><b>{info.inspectors}</b></div>
            <div><div className="stat-label">Codecs</div><b>{info.codecs}</b></div>
            <div><div className="stat-label">Loggers</div><b>{info.loggers}</b></div>
            <div><div className="stat-label">LuaJIT</div><b>{info.lua_version || "—"}</b></div>
          </div>
        </div>
      )}

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Interfaces réseau</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Interface</th><th>État</th><th>Adresses</th></tr></thead>
              <tbody>
                {interfaces.map((i) => (
                  <tr key={i.name}>
                    <td className="mono">{i.name}</td>
                    <td><span className={`badge ${i.up ? "on" : "off"}`}>{i.up ? "UP" : "DOWN"}</span></td>
                    <td className="mono">{i.addresses.join(", ") || <span className="muted">{i.description || "—"}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3>Modules DAQ</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Module</th><th>Mode</th><th>Description</th></tr></thead>
              <tbody>
                {daqs.map((d) => (
                  <tr key={d.name}>
                    <td className="mono">{d.name}</td>
                    <td className="muted">{d.mode}</td>
                    <td>{d.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <h3 style={{ margin: 0 }}>Plugins</h3>
          <div className="spacer" />
          <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ maxWidth: 200 }}>
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nom</th><th>Type</th><th>Description</th></tr></thead>
            <tbody>
              {plugins.map((p) => (
                <tr key={p.name}><td className="mono">{p.name}</td><td className="muted">{p.type}</td><td>{p.help}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
