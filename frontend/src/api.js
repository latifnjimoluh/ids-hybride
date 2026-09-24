// Couche d'accès à l'API backend (fetch natif, avec authentification JWT).

import { auth } from "./auth.js";

const BASE = "/api";

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (auth.token) headers["Authorization"] = `Bearer ${auth.token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    auth.logout(); // token expiré/invalide → retour au login
    throw new Error("Session expirée");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

// Upload multipart (pour les PCAP).
async function upload(path, file, fields = {}) {
  const fd = new FormData();
  fd.append("file", file);
  Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
  const headers = {};
  if (auth.token) headers["Authorization"] = `Bearer ${auth.token}`;
  const res = await fetch(`${BASE}${path}`, { method: "POST", body: fd, headers });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(b.detail || "Échec de l'envoi");
  }
  return res.json();
}

export const api = {
  health: () => request("/health"),

  // Auth
  me: () => request("/auth/me"),
  changePassword: (new_password) =>
    request("/auth/change-password", { method: "POST", body: JSON.stringify({ new_password }) }),

  // Règles
  listRules: () => request("/rules"),
  createRule: (payload) => request("/rules", { method: "POST", body: JSON.stringify(payload) }),
  updateRule: (sid, raw) => request(`/rules/${sid}`, { method: "PUT", body: JSON.stringify({ raw }) }),
  toggleRule: (sid, enabled) =>
    request(`/rules/${sid}/toggle`, { method: "PATCH", body: JSON.stringify({ enabled }) }),
  deleteRule: (sid) => request(`/rules/${sid}`, { method: "DELETE" }),
  validateRules: () => request("/rules/validate", { method: "POST" }),
  ruleCategories: () => request("/rules/categories"),
  importRuleset: (name) => request("/rules/import", { method: "POST", body: JSON.stringify({ name }) }),

  // Alertes
  listAlerts: (limit = 200) => request(`/alerts?limit=${limit}`),
  alertStats: () => request("/alerts/stats"),

  // Service
  serviceStatus: () => request("/service/status"),
  serviceAction: (action, options) =>
    request("/service/action", { method: "POST", body: JSON.stringify({ action, ...options }) }),
  runOptions: () => request("/service/run-options"),

  // Config
  getConfig: () => request("/config"),
  updateConfig: (cfg) => request("/config", { method: "PUT", body: JSON.stringify(cfg) }),
  getRawConfig: () => request("/config/raw"),
  updateRawConfig: (content) =>
    request("/config/raw", { method: "PUT", body: JSON.stringify({ content }) }),

  // Système
  systemInfo: () => request("/system/info"),
  interfaces: () => request("/system/interfaces"),
  daqs: () => request("/system/daqs"),
  plugins: (kind = "") => request(`/system/plugins${kind ? `?kind=${kind}` : ""}`),

  // PCAP
  listPcaps: () => request("/pcap"),
  analyzePcap: (file) => upload("/pcap/analyze", file),
  pcapResult: (id) => request(`/pcap/${id}`),

  // Logs
  logs: (lines = 200) => request(`/logs?lines=${lines}`),

  // Console
  consoleRun: (command) =>
    request("/console/run", { method: "POST", body: JSON.stringify({ command }) }),
  consoleCommands: () => request("/console/commands"),
};

// URL du WebSocket d'alertes (token en query param).
export function alertsWsUrl() {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/api/ws/alerts?token=${auth.token}`;
}
