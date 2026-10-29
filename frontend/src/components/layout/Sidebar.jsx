import React from "react";
import { NavLink } from "react-router-dom";
import {
  Shield,
  LayoutDashboard,
  ShieldAlert,
  BrainCircuit,
  FileSearch,
  Sliders,
  Activity,
  Terminal,
  Settings,
  Server,
  FileText,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { useAlerts } from "../../AlertsContext";
import Badge from "../ui/Badge";
import Tooltip from "../ui/Tooltip";

export default function Sidebar({ collapsed, onToggleCollapse }) {
  const { alerts } = useAlerts() || { alerts: [] };
  const p1AlertsCount = alerts.filter(a => a.priority === 1).length;

  const navGroups = [
    {
      title: "Surveillance",
      items: [
        { to: "/", label: "Tableau de bord", icon: <LayoutDashboard size={18} />, end: true },
        {
          to: "/alerts",
          label: "Alertes",
          icon: <ShieldAlert size={18} />,
          badge: p1AlertsCount > 0 ? (
            <Badge variant="prio-1" style={{ fontSize: 10, padding: "1px 6px" }}>
              {p1AlertsCount}
            </Badge>
          ) : null
        },
        { to: "/ml", label: "Détection ML", icon: <BrainCircuit size={18} /> },
        { to: "/pcap", label: "Analyse PCAP", icon: <FileSearch size={18} /> },
      ]
    },
    {
      title: "Moteur & Règles",
      items: [
        { to: "/rules", label: "Règles Snort", icon: <Sliders size={18} /> },
        { to: "/service", label: "Contrôle Service", icon: <Activity size={18} /> },
        { to: "/console", label: "Console CLI", icon: <Terminal size={18} /> },
      ]
    },
    {
      title: "Administration",
      items: [
        { to: "/config", label: "Configuration", icon: <Settings size={18} /> },
        { to: "/system", label: "Système & DAQ", icon: <Server size={18} /> },
        { to: "/logs", label: "Journaux Snort", icon: <FileText size={18} /> },
      ]
    }
  ];

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      {/* Brand Header */}
      <div
        className="flex items-center gap-3"
        style={{
          padding: "6px 4px 16px",
          borderBottom: "1px solid var(--soc-border)",
          justifyContent: collapsed ? "center" : "flex-start"
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            boxShadow: "0 0 12px rgba(59, 130, 246, 0.4)",
            flexShrink: 0
          }}
        >
          <Shield size={20} />
        </div>
        {!collapsed && (
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "0.5px", color: "var(--soc-text-primary)" }}>
              IDS-HYBRIDE
            </div>
            <div style={{ fontSize: 11, color: "var(--soc-text-muted)" }}>
              Snort 3 SOC Console
            </div>
          </div>
        )}
      </div>

      {/* Navigation Groups */}
      <div className="flex flex-col gap-4" style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {navGroups.map((group, gIdx) => (
          <div key={gIdx} className="sidebar-section">
            {!collapsed && (
              <div className="sidebar-section-title">
                {group.title}
              </div>
            )}
            {group.items.map((item) => {
              const navLinkContent = (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                  style={{
                    justifyContent: collapsed ? "center" : "flex-start",
                    padding: collapsed ? "10px" : "9px 12px"
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center" }}>{item.icon}</span>
                  {!collapsed && (
                    <span style={{ flex: 1, whiteSpace: "nowrap" }}>
                      {item.label}
                    </span>
                  )}
                  {!collapsed && item.badge}
                </NavLink>
              );

              return collapsed ? (
                <Tooltip key={item.to} text={item.label} position="right">
                  {navLinkContent}
                </Tooltip>
              ) : (
                navLinkContent
              );
            })}
          </div>
        ))}
      </div>

      {/* Collapse Toggle Footer */}
      <div style={{ paddingTop: 12, borderTop: "1px solid var(--soc-border)" }}>
        <button
          className="btn ghost sm w-full"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Déplier le menu" : "Replier le menu"}
          style={{
            justifyContent: collapsed ? "center" : "space-between",
            padding: "8px 10px",
            color: "var(--soc-text-muted)"
          }}
        >
          {!collapsed && <span style={{ fontSize: 12 }}>Replier le menu</span>}
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </aside>
  );
}
