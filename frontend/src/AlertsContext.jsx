import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, alertsWsUrl } from "./api.js";

// Contexte global : un seul WebSocket alimente à la fois la page Alertes
// et les notifications navigateur (déclenchées depuis n'importe quelle page).
const AlertsContext = createContext(null);
export const useAlerts = () => useContext(AlertsContext);

const NOTIF_KEY = "ids_notif_enabled";
const NOTIF_SUPPORTED = typeof window !== "undefined" && "Notification" in window;

export function AlertsProvider({ children }) {
  const [alerts, setAlerts] = useState([]);
  const [connected, setConnected] = useState(false);
  const [notifEnabled, setNotifEnabledState] = useState(localStorage.getItem(NOTIF_KEY) === "1");
  const [permission, setPermission] = useState(NOTIF_SUPPORTED ? Notification.permission : "unsupported");
  const pendingRef = useRef([]); // alertes reçues depuis le dernier envoi de notif
  const navigate = useNavigate();

  // Historique initial
  useEffect(() => {
    api.listAlerts(200).then(setAlerts).catch(() => {});
  }, []);

  // WebSocket temps réel (avec reconnexion automatique)
  useEffect(() => {
    let stopped = false;
    let ws;
    const connect = () => {
      ws = new WebSocket(alertsWsUrl());
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!stopped) setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (ev) => {
        try {
          const a = JSON.parse(ev.data);
          setAlerts((prev) => [a, ...prev].slice(0, 500));
          pendingRef.current.push(a);
        } catch {
          /* ignore */
        }
      };
    };
    connect();
    return () => { stopped = true; ws?.close(); };
  }, []);

  // Notifications navigateur, regroupées toutes les 4 s (anti-spam)
  useEffect(() => {
    const timer = setInterval(() => {
      const batch = pendingRef.current;
      pendingRef.current = [];
      if (!batch.length || !notifEnabled) return;
      if (!NOTIF_SUPPORTED || Notification.permission !== "granted") return;

      // priorité 1 = la plus grave
      const worst = batch.reduce((m, a) => (a.priority < m.priority ? a : m), batch[0]);
      const title = batch.length === 1 ? "🛡️ Alerte Snort" : `🛡️ ${batch.length} nouvelles alertes Snort`;
      const body = `${worst.msg} (P${worst.priority})\n${worst.src_addr} → ${worst.dst_addr}`;
      try {
        const n = new Notification(title, { body, tag: "ids-alert", renotify: true });
        n.onclick = () => { window.focus(); navigate("/alerts"); n.close(); };
      } catch {
        /* ignore */
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [notifEnabled, navigate]);

  const setNotifEnabled = useCallback((v) => {
    if (v && NOTIF_SUPPORTED && Notification.permission !== "granted") {
      Notification.requestPermission().then((p) => {
        setPermission(p);
        const ok = p === "granted";
        setNotifEnabledState(ok);
        localStorage.setItem(NOTIF_KEY, ok ? "1" : "0");
      });
      return;
    }
    setNotifEnabledState(v);
    localStorage.setItem(NOTIF_KEY, v ? "1" : "0");
  }, []);

  const reload = useCallback(
    () => api.listAlerts(200).then(setAlerts).catch(() => {}),
    []
  );

  return (
    <AlertsContext.Provider
      value={{ alerts, connected, notifEnabled, setNotifEnabled, permission, supported: NOTIF_SUPPORTED, reload }}
    >
      {children}
    </AlertsContext.Provider>
  );
}
