import React, { useState } from "react";
import { Shield, Lock, User, Eye, EyeOff, AlertCircle, KeyRound, Server } from "lucide-react";
import { auth } from "../auth.js";
import Button from "../components/ui/Button";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Veuillez renseigner le nom d'utilisateur et le mot de passe.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await auth.login(username.trim(), password);
      onLogin();
    } catch (err) {
      setError(err.message || "Identifiants invalides ou service injoignable.");
    } finally {
      setBusy(false);
    }
  };

  const handleFillDefault = () => {
    setUsername("admin");
    setPassword("admin");
    setError("");
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "radial-gradient(ellipse at center, #101c30 0%, #060910 100%)",
        padding: 20,
        position: "relative"
      }}
    >
      {/* Background Decorative Glow */}
      <div
        style={{
          position: "absolute",
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(59, 130, 246, 0.08) 0%, transparent 70%)",
          pointerEvents: "none"
        }}
      />

      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "rgba(15, 23, 38, 0.9)",
          border: "1px solid #233452",
          borderRadius: 14,
          padding: 32,
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.7), 0 0 25px rgba(59, 130, 246, 0.15)",
          backdropFilter: "blur(10px)",
          position: "relative",
          zIndex: 1
        }}
      >
        {/* Brand & Appliance Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              background: "linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              boxShadow: "0 0 20px rgba(59, 130, 246, 0.5)",
              marginBottom: 14
            }}
          >
            <Shield size={28} />
          </div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "0.5px", color: "var(--soc-text-primary)" }}>
            IDS-HYBRIDE
          </h2>
          <div style={{ fontSize: 12.5, color: "var(--soc-text-secondary)", marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Server size={13} color="var(--soc-accent)" />
            <span>Snort 3 Appliance Management Gateway</span>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderRadius: 8,
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              color: "#ef4444",
              fontSize: 12.5,
              marginBottom: 20
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={submit}>
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <User size={13} />
              <span>Nom d'utilisateur</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ex: admin"
              autoFocus
              required
              disabled={busy}
            />
          </div>

          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Lock size={13} />
              <span>Mot de passe</span>
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mot de passe"
                required
                disabled={busy}
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                style={{
                  position: "absolute",
                  right: 6,
                  top: "50%",
                  transform: "translateY(-50%)",
                  padding: 6,
                  border: "none",
                  background: "transparent",
                  color: "var(--soc-text-muted)"
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={busy}
            disabled={busy}
            className="w-full"
            style={{ marginTop: 8 }}
          >
            Se connecter à la console
          </Button>

          {/* Quick Default Fill */}
          <div style={{ marginTop: 20, textAlign: "center" }}>
            <button
              type="button"
              className="btn ghost sm"
              onClick={handleFillDefault}
              style={{ fontSize: 11.5, color: "var(--soc-text-secondary)" }}
            >
              <KeyRound size={12} color="var(--soc-accent)" />
              <span>Remplir les identifiants par défaut (admin / admin)</span>
            </button>
          </div>
        </form>

        <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--soc-border)", textAlign: "center", fontSize: 11, color: "var(--soc-text-muted)" }}>
          Accès restreint aux opérateurs de cybersécurité autorisés.
        </div>
      </div>
    </div>
  );
}
