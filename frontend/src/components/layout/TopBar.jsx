import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  ShieldAlert,
  Wifi,
  WifiOff,
  Bell,
  BellOff,
  Clock,
  User,
  LogOut,
  Activity,
  Menu
} from "lucide-react";
import { useAlerts } from "../../AlertsContext";
import { auth } from "../../auth";
import { api } from "../../api";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Tooltip from "../ui/Tooltip";

export default function TopBar({ onToggleSidebar, sidebarCollapsed }) {
  const navigate = useNavigate();
  const { alerts, connected, notifEnabled, setNotifEnabled } = useAlerts() || {
    alerts: [],
    connected: false,
    notifEnabled: false,
    setNotifEnabled: () => {}
  };

  const [snortStatus, setSnortStatus] = useState({ running: false, pid: null });
  const [timeUtc, setTimeUtc] = useState("");

  // Snort Service Polling
  useEffect(() => {
    let mounted = true;
    const fetchStatus = () => {
      api.serviceStatus()
        .then(res => {
          if (mounted && res) {
            setSnortStatus({ running: Boolean(res.running), pid: res.pid });
          }
        })
        .catch(() => {
          if (mounted) setSnortStatus({ running: false, pid: null });
        });
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Real-time UTC clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setTimeUtc(now.toUTCString().slice(17, 25) + " UTC");
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // Alert priority counts
  const p1Count = alerts.filter(a => a.priority === 1).length;
  const p2Count = alerts.filter(a => a.priority === 2).length;
  const p3Count = alerts.filter(a => a.priority === 3).length;

  const handleLogout = () => {
    auth.logout();
    window.location.reload();
  };

  return (
    <header className="topbar">
      {/* Left: Hamburger & Snort Status */}
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleSidebar}
            aria-label="Basculer le menu"
            style={{ padding: "6px" }}
          >
            <Menu size={18} />
          </Button>
        )}

        <Tooltip
          text={snortStatus.running ? "Moteur Snort 3 actif et capture en cours" : "Moteur Snort 3 arrêté"}
          position="bottom"
        >
          <div className="flex items-center gap-2">
            {snortStatus.running ? (
              <Badge variant="success" dot={true}>
                <span className="mono" style={{ fontWeight: 700 }}>SNORT 3 EN LIGNE</span>
                {snortStatus.pid && (
                  <span style={{ opacity: 0.8, fontSize: 11 }}>PID:{snortStatus.pid}</span>
                )}
              </Badge>
            ) : (
              <Badge variant="prio-1">
                <span className="mono" style={{ fontWeight: 700 }}>SNORT 3 ARRÊTÉ</span>
              </Badge>
            )}
          </div>
        </Tooltip>

        {/* WebSocket Indicator */}
        <Tooltip
          text={connected ? "Flux WebSocket temps réel actif" : "Connexion WebSocket interrompue, reconnexion..."}
          position="bottom"
        >
          <div
            className="flex items-center gap-1"
            style={{
              padding: "4px 8px",
              borderRadius: 4,
              background: connected ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
              color: connected ? "#10b981" : "#ef4444",
              fontSize: 11.5,
              fontWeight: 600
            }}
          >
            {connected ? (
              <>
                <Wifi size={13} />
                <span>WS LIVE</span>
              </>
            ) : (
              <>
                <WifiOff size={13} />
                <span>WS HORS-LIGNE</span>
              </>
            )}
          </div>
        </Tooltip>
      </div>

      {/* Center: Quick Alert Badges */}
      <div className="flex items-center gap-2">
        <Tooltip text="Alertes critiques P1" position="bottom">
          <button
            className="btn ghost sm"
            onClick={() => navigate("/alerts")}
            style={{ padding: "3px 8px" }}
          >
            <Badge variant="prio-1">
              <span style={{ fontWeight: 700 }}>P1</span> {p1Count}
            </Badge>
          </button>
        </Tooltip>

        <Tooltip text="Alertes d'avertissement P2" position="bottom">
          <button
            className="btn ghost sm"
            onClick={() => navigate("/alerts")}
            style={{ padding: "3px 8px" }}
          >
            <Badge variant="prio-2">
              <span style={{ fontWeight: 700 }}>P2</span> {p2Count}
            </Badge>
          </button>
        </Tooltip>

        <Tooltip text="Alertes informatives P3" position="bottom">
          <button
            className="btn ghost sm"
            onClick={() => navigate("/alerts")}
            style={{ padding: "3px 8px" }}
          >
            <Badge variant="prio-3">
              <span style={{ fontWeight: 700 }}>P3</span> {p3Count}
            </Badge>
          </button>
        </Tooltip>
      </div>

      {/* Right: Clock + Notification Bell + User Profile + Logout */}
      <div className="flex items-center gap-3">
        {/* UTC Clock */}
        <Tooltip text="Horloge universelle synchronisée" position="bottom">
          <div
            className="flex items-center gap-1 mono text-muted"
            style={{ fontSize: 12, paddingRight: 6 }}
          >
            <Clock size={13} />
            <span>{timeUtc}</span>
          </div>
        </Tooltip>

        {/* Browser Notifications Toggle */}
        <Tooltip
          text={notifEnabled ? "Désactiver les alertes navigateur" : "Activer les alertes navigateur"}
          position="bottom"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setNotifEnabled(!notifEnabled)}
            style={{ padding: "5px 8px", color: notifEnabled ? "var(--soc-accent)" : "var(--soc-text-muted)" }}
          >
            {notifEnabled ? <Bell size={16} /> : <BellOff size={16} />}
          </Button>
        </Tooltip>

        {/* User Badge */}
        <Tooltip text={`Connecté en tant que ${auth.user || "admin"}`} position="bottom">
          <div
            className="flex items-center gap-2"
            style={{
              background: "var(--soc-bg-elevated)",
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid var(--soc-border)"
            }}
          >
            <User size={14} color="var(--soc-accent)" />
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>{auth.user || "admin"}</span>
          </div>
        </Tooltip>

        {/* Logout */}
        <Tooltip text="Déconnexion de l'appliance" position="bottom-left">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            style={{ padding: "5px 8px", color: "var(--soc-prio-1)" }}
            aria-label="Se déconnecter"
          >
            <LogOut size={16} />
          </Button>
        </Tooltip>
      </div>
    </header>
  );
}
