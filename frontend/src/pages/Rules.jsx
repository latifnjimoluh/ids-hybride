import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useToast } from "../useToast.jsx";

const EMPTY = {
  action: "alert",
  proto: "tcp",
  source: "$EXTERNAL_NET",
  sport: "any",
  direction: "->",
  dest: "$HOME_NET",
  dport: "any",
  msg: "",
  raw: "",
};

export default function Rules() {
  const [rules, setRules] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [useRaw, setUseRaw] = useState(false);
  const [editSid, setEditSid] = useState(null);
  const [editRaw, setEditRaw] = useState("");
  const [filter, setFilter] = useState("");
  const [categories, setCategories] = useState([]);
  const { show, node } = useToast();

  const load = () => {
    api.listRules().then(setRules).catch((e) => show(e.message, "err"));
    api.ruleCategories().then(setCategories).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const doImport = async (name) => {
    try {
      const res = await api.importRuleset(name);
      show(res.message);
      load();
    } catch (e) { show(e.message, "err"); }
  };

  const submit = async () => {
    try {
      const payload = useRaw
        ? { raw: form.raw, enabled: true }
        : { ...form, enabled: true };
      await api.createRule(payload);
      show("Règle créée ✓");
      setForm(EMPTY);
      setShowForm(false);
      load();
    } catch (e) {
      show(e.message, "err");
    }
  };

  const toggle = async (r) => {
    try {
      await api.toggleRule(r.sid, !r.enabled);
      load();
    } catch (e) { show(e.message, "err"); }
  };

  const remove = async (sid) => {
    if (!confirm(`Supprimer la règle sid=${sid} ?`)) return;
    try { await api.deleteRule(sid); show("Règle supprimée"); load(); }
    catch (e) { show(e.message, "err"); }
  };

  const saveEdit = async () => {
    try {
      await api.updateRule(editSid, editRaw);
      show("Règle modifiée ✓");
      setEditSid(null);
      load();
    } catch (e) { show(e.message, "err"); }
  };

  const validate = async () => {
    try {
      const res = await api.validateRules();
      show(res.ok ? "Configuration valide ✓" : "Erreurs détectées ✗", res.ok ? "ok" : "err");
    } catch (e) { show(e.message, "err"); }
  };

  const filtered = rules.filter(
    (r) =>
      !filter ||
      r.msg.toLowerCase().includes(filter.toLowerCase()) ||
      String(r.sid).includes(filter)
  );

  return (
    <div>
      <h1 className="page-title">Gestion des règles</h1>
      <p className="page-sub">Créer, activer/désactiver, éditer et valider les règles Snort (local.rules).</p>

      {categories.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Catégories (classtype)</h3>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            {categories.map((c) => (
              <span key={c.name} className="badge on" style={{ background: "var(--bg-elev2)", color: "var(--text)" }}>
                {c.name} : <b>{c.enabled}</b>/{c.total}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="toolbar">
        <input
          placeholder="🔍 Filtrer par message ou SID…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        <div className="spacer" />
        <button onClick={() => doImport("community")} title="Importer le ruleset Community">＋ Community</button>
        <button onClick={() => doImport("emerging-threats")} title="Importer Emerging Threats">＋ ET Open</button>
        <button onClick={validate}>Valider la config</button>
        <button className="primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Annuler" : "+ Nouvelle règle"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="row" style={{ marginBottom: 14 }}>
            <label style={{ margin: 0 }}>
              <input
                type="checkbox"
                checked={useRaw}
                onChange={(e) => setUseRaw(e.target.checked)}
                style={{ width: "auto", marginRight: 6 }}
              />
              Saisie manuelle (règle brute)
            </label>
          </div>
          {useRaw ? (
            <div className="field">
              <label>Règle Snort complète</label>
              <textarea
                className="mono"
                placeholder='alert tcp $EXTERNAL_NET any -> $HOME_NET 80 ( msg:"..."; sid:1000050; rev:1; )'
                value={form.raw}
                onChange={(e) => setForm({ ...form, raw: e.target.value })}
              />
              <small className="muted">Le SID est ajouté automatiquement s'il manque.</small>
            </div>
          ) : (
            <div className="grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
              {[
                ["action", "Action", ["alert", "log", "drop", "reject", "pass"]],
                ["proto", "Protocole", ["tcp", "udp", "icmp", "ip", "http"]],
              ].map(([k, label, opts]) => (
                <div className="field" key={k}>
                  <label>{label}</label>
                  <select value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })}>
                    {opts.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              {[
                ["source", "Source"],
                ["sport", "Port source"],
                ["dest", "Destination"],
                ["dport", "Port dest."],
              ].map(([k, label]) => (
                <div className="field" key={k}>
                  <label>{label}</label>
                  <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                </div>
              ))}
              <div className="field" style={{ gridColumn: "span 4" }}>
                <label>Message (msg)</label>
                <input value={form.msg} onChange={(e) => setForm({ ...form, msg: e.target.value })} />
              </div>
            </div>
          )}
          <button className="primary" onClick={submit}>Enregistrer la règle</button>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>État</th>
              <th>SID</th>
              <th>Action</th>
              <th>Proto</th>
              <th>Message</th>
              <th>Classe</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.sid}>
                <td>
                  <span className={`badge ${r.enabled ? "on" : "off"}`}>
                    {r.enabled ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="mono">{r.sid}</td>
                <td>{r.action}</td>
                <td>{r.proto}</td>
                <td>{r.msg || <span className="muted">—</span>}</td>
                <td className="muted">{r.classtype || "—"}</td>
                <td style={{ textAlign: "right" }}>
                  <div className="row" style={{ justifyContent: "flex-end" }}>
                    <button className="sm" onClick={() => toggle(r)}>
                      {r.enabled ? "Désactiver" : "Activer"}
                    </button>
                    <button className="sm" onClick={() => { setEditSid(r.sid); setEditRaw(r.raw); }}>
                      Éditer
                    </button>
                    <button className="sm danger" onClick={() => remove(r.sid)}>Suppr.</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan="7" className="muted" style={{ textAlign: "center", padding: 30 }}>
                Aucune règle.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editSid && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Éditer la règle {editSid}</h3>
          <textarea className="mono" value={editRaw} onChange={(e) => setEditRaw(e.target.value)} />
          <div className="row" style={{ marginTop: 12 }}>
            <button className="primary" onClick={saveEdit}>Enregistrer</button>
            <button onClick={() => setEditSid(null)}>Annuler</button>
          </div>
        </div>
      )}
      {node}
    </div>
  );
}
