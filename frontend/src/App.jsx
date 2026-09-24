import { useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { auth } from "./auth.js";
import Dashboard from "./pages/Dashboard.jsx";
import Rules from "./pages/Rules.jsx";
import Alerts from "./pages/Alerts.jsx";
import Service from "./pages/Service.jsx";
import Config from "./pages/Config.jsx";
import System from "./pages/System.jsx";
import Pcap from "./pages/Pcap.jsx";
import Logs from "./pages/Logs.jsx";
import Console from "./pages/Console.jsx";
import Login from "./pages/Login.jsx";

const NAV = [
  { to: "/", label: "Tableau de bord", icon: "▦", end: true },
  { to: "/rules", label: "Règles", icon: "❭_" },
  { to: "/alerts", label: "Alertes", icon: "⚠" },
  { to: "/pcap", label: "Analyse PCAP", icon: "⇪" },
  { to: "/service", label: "Service", icon: "⚙" },
  { to: "/config", label: "Configuration", icon: "☰" },
  { to: "/system", label: "Système", icon: "🖥" },
  { to: "/logs", label: "Logs", icon: "📄" },
  { to: "/console", label: "Console", icon: "❯" },
];

export default function App() {
  const [authed, setAuthed] = useState(auth.isAuthenticated());

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          🛡️ IDS-Hybride
          <small>Dashboard Snort</small>
        </div>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            <span style={{ width: 18, display: "inline-block" }}>{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
        <div className="spacer" style={{ flex: 1 }} />
        <div className="nav-item" style={{ cursor: "default", fontSize: 12 }}>
          👤 {auth.username}
        </div>
        <button onClick={() => auth.logout()} style={{ width: "100%" }}>
          Se déconnecter
        </button>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/pcap" element={<Pcap />} />
          <Route path="/service" element={<Service />} />
          <Route path="/config" element={<Config />} />
          <Route path="/system" element={<System />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/console" element={<Console />} />
        </Routes>
      </main>
    </div>
  );
}
