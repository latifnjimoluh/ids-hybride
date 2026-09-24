import { useState } from "react";
import { auth } from "../auth.js";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await auth.login(username, password);
      onLogin();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      <form onSubmit={submit} className="card" style={{ width: 340 }}>
        <div className="brand" style={{ justifyContent: "center", paddingTop: 0 }}>
          🛡️ IDS-Hybride
        </div>
        <p className="muted" style={{ textAlign: "center", marginTop: 0 }}>
          Dashboard de pilotage Snort
        </p>
        <div className="field">
          <label>Utilisateur</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Mot de passe</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="admin (par défaut)"
          />
        </div>
        {error && (
          <div className="badge prio-1" style={{ display: "block", marginBottom: 12, padding: 8 }}>
            {error}
          </div>
        )}
        <button className="primary" style={{ width: "100%" }} disabled={busy}>
          {busy ? "Connexion…" : "Se connecter"}
        </button>
        <p className="muted" style={{ fontSize: 11, textAlign: "center", marginBottom: 0 }}>
          Identifiants par défaut : admin / admin
        </p>
      </form>
    </div>
  );
}
