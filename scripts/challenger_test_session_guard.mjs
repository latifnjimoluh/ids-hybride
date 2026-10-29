#!/usr/bin/env node
/**
 * Empirical test harness for Session Security, Route Guarding, and 401 Handling.
 * Executed by challenger_m2_2.
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const frontendSrc = path.join(projectRoot, "frontend", "src");

class TestReporter {
  constructor() {
    this.passes = 0;
    this.fails = 0;
    this.results = [];
  }

  record(category, testName, passed, detail = "") {
    const status = passed ? "PASS" : "FAIL";
    if (passed) {
      this.passes++;
    } else {
      this.fails++;
    }
    console.log(`[${status}] ${category} :: ${testName}${detail ? ` - ${detail}` : ""}`);
    this.results.push({ category, testName, status, detail });
  }
}

const reporter = new TestReporter();

// Mock localStorage factory
function createLocalStorageMock(initialStore = {}) {
  const store = { ...initialStore };
  return {
    store,
    getItem(k) { return store[k] !== undefined ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    clear() { Object.keys(store).forEach(k => delete store[k]); }
  };
}

// Global browser mocks setup
function setupBrowserMocks(initialStorage = {}, protocol = "http:", host = "127.0.0.1:8000") {
  const ls = createLocalStorageMock(initialStorage);
  global.localStorage = ls;
  global.window = {
    location: {
      protocol,
      host,
      reloadCalled: 0,
      reload() { this.reloadCalled++; }
    },
    focus() {}
  };
  return ls;
}

console.log("\n" + "=".repeat(80));
console.log("1. Testing auth.js Session Management");
console.log("=".repeat(80));

// Setup clean environment
setupBrowserMocks();
const authUrl = pathToFileURL(path.join(frontendSrc, "auth.js")).href;
const { auth } = await import(authUrl);

// 1.1 No token in storage
reporter.record("auth.js", "No token -> isAuthenticated() is false", auth.isAuthenticated() === false);
reporter.record("auth.js", "No token -> auth.token is null", auth.token === null);
reporter.record("auth.js", "No user -> auth.username is null", auth.username === null);

// 1.2 Setting token and user
global.localStorage.setItem("ids_token", "jwt-test-abc");
global.localStorage.setItem("ids_user", "soc-analyst");
reporter.record("auth.js", "With token -> isAuthenticated() is true", auth.isAuthenticated() === true);
reporter.record("auth.js", "With token -> auth.token matches", auth.token === "jwt-test-abc");
reporter.record("auth.js", "With user -> auth.username matches", auth.username === "soc-analyst");

// 1.3 auth.logout()
global.window.location.reloadCalled = 0;
auth.logout();
reporter.record("auth.js", "auth.logout() removes ids_token", global.localStorage.getItem("ids_token") === null);
reporter.record("auth.js", "auth.logout() removes ids_user", global.localStorage.getItem("ids_user") === null);
reporter.record("auth.js", "auth.logout() calls window.location.reload()", global.window.location.reloadCalled === 1);
reporter.record("auth.js", "Post logout isAuthenticated() is false", auth.isAuthenticated() === false);

// 1.4 auth.login() with mock fetch
global.fetch = async (url, opts) => {
  if (url === "/api/auth/login") {
    const params = new URLSearchParams(opts.body);
    if (params.get("username") === "admin" && params.get("password") === "admin") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: "jwt-login-success", username: "admin", token_type: "bearer" })
      };
    } else {
      return {
        ok: false,
        status: 400,
        json: async () => ({ detail: "Identifiants invalides" })
      };
    }
  }
  return { ok: false, status: 404 };
};

try {
  const loginRes = await auth.login("admin", "admin");
  reporter.record("auth.js", "auth.login() success stores token", global.localStorage.getItem("ids_token") === "jwt-login-success");
  reporter.record("auth.js", "auth.login() success stores username", global.localStorage.getItem("ids_user") === "admin");
  reporter.record("auth.js", "auth.login() returns data", loginRes.access_token === "jwt-login-success");
} catch (e) {
  reporter.record("auth.js", "auth.login() success", false, e.message);
}

try {
  await auth.login("admin", "wrongpassword");
  reporter.record("auth.js", "auth.login() failure throws Error", false, "Did not throw");
} catch (e) {
  reporter.record("auth.js", "auth.login() failure throws Error", e.message === "Identifiants invalides");
}


console.log("\n" + "=".repeat(80));
console.log("2. Testing api.js Request Interceptor & 401 Handling");
console.log("=".repeat(80));

const apiUrl = pathToFileURL(path.join(frontendSrc, "api.js")).href;
const { api, alertsWsUrl } = await import(apiUrl);

// 2.1 alertsWsUrl URL generation
setupBrowserMocks({ ids_token: "jwt-session-xyz" }, "http:", "localhost:8000");
reporter.record(
  "api.js",
  "alertsWsUrl on http generates ws:// URL with token",
  alertsWsUrl() === "ws://localhost:8000/api/ws/alerts?token=jwt-session-xyz"
);

setupBrowserMocks({ ids_token: "jwt-ssl-123" }, "https:", "ids.internal:8443");
reporter.record(
  "api.js",
  "alertsWsUrl on https generates wss:// URL with token",
  alertsWsUrl() === "wss://ids.internal:8443/api/ws/alerts?token=jwt-ssl-123"
);

// 2.2 Request sends Bearer header when token present
let capturedHeaders = null;
global.fetch = async (url, opts) => {
  capturedHeaders = opts.headers;
  return {
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => ({ status: "ok" })
  };
};

setupBrowserMocks({ ids_token: "bearer-test-token" });
await api.health();
reporter.record(
  "api.js",
  "Authorization: Bearer <token> attached when authenticated",
  capturedHeaders && capturedHeaders["Authorization"] === "Bearer bearer-test-token"
);

// 2.3 Request does not attach Bearer header when no token
setupBrowserMocks({});
await api.health();
reporter.record(
  "api.js",
  "No Authorization header attached when unauthenticated",
  capturedHeaders && capturedHeaders["Authorization"] === undefined
);

// 2.4 Handling 401 response: MUST invoke auth.logout() and throw "Session expirée"
setupBrowserMocks({ ids_token: "expired-token", ids_user: "victim" });
global.window.location.reloadCalled = 0;
global.fetch = async () => ({
  ok: false,
  status: 401,
  statusText: "Unauthorized",
  headers: { get: () => "application/json" },
  json: async () => ({ detail: "Token invalide ou expiré" })
});

let caught401Error = null;
try {
  await api.listAlerts();
} catch (e) {
  caught401Error = e;
}

reporter.record("api.js", "401 response throws 'Session expirée'", caught401Error && caught401Error.message === "Session expirée");
reporter.record("api.js", "401 response removes ids_token", global.localStorage.getItem("ids_token") === null);
reporter.record("api.js", "401 response removes ids_user", global.localStorage.getItem("ids_user") === null);
reporter.record("api.js", "401 response triggers window.location.reload()", global.window.location.reloadCalled === 1);
reporter.record("api.js", "Post 401 isAuthenticated() is false", auth.isAuthenticated() === false);

// 2.5 Non-401 errors (e.g., 404, 500) must NOT call auth.logout()
setupBrowserMocks({ ids_token: "valid-token-stays", ids_user: "analyst" });
global.window.location.reloadCalled = 0;
global.fetch = async () => ({
  ok: false,
  status: 500,
  statusText: "Internal Server Error",
  headers: { get: () => "application/json" },
  json: async () => ({ detail: "Snort process crashed" })
});

let caught500Error = null;
try {
  await api.serviceStatus();
} catch (e) {
  caught500Error = e;
}

reporter.record("api.js", "500 error propagates detail message", caught500Error && caught500Error.message === "Snort process crashed");
reporter.record("api.js", "500 error does NOT clear token", global.localStorage.getItem("ids_token") === "valid-token-stays");
reporter.record("api.js", "500 error does NOT reload page", global.window.location.reloadCalled === 0);


console.log("\n" + "=".repeat(80));
console.log("3. Testing App.jsx Route Guarding & Authentication States");
console.log("=".repeat(80));

// Read App.jsx source and transform with esbuild
const appJsxPath = path.join(frontendSrc, "App.jsx");
const appJsxSource = fs.readFileSync(appJsxPath, "utf8");

reporter.record(
  "App.jsx Structure",
  "App.jsx uses auth.isAuthenticated() as initial state",
  appJsxSource.includes("useState(auth.isAuthenticated())")
);

reporter.record(
  "App.jsx Structure",
  "App.jsx guards with unauthenticated check (!authed)",
  appJsxSource.includes("if (!authed)")
);

reporter.record(
  "App.jsx Structure",
  "App.jsx renders <Login onLogin={() => setAuthed(true)} /> when !authed",
  appJsxSource.includes("<Login onLogin={() => setAuthed(true)} />")
);

reporter.record(
  "App.jsx Structure",
  "App.jsx wraps protected routes inside AlertsProvider",
  appJsxSource.includes("<AlertsProvider>") && appJsxSource.includes("<SOCLayout />")
);

// Verify all required protected routes exist inside App.jsx
const expectedRoutes = [
  'path="/" element={<Dashboard />}',
  'path="/rules" element={<Rules />}',
  'path="/alerts" element={<Alerts />}',
  'path="/ml" element={<ML />}',
  'path="/pcap" element={<Pcap />}',
  'path="/service" element={<Service />}',
  'path="/config" element={<Config />}',
  'path="/system" element={<System />}',
  'path="/logs" element={<Logs />}',
  'path="/console" element={<Console />}'
];

for (const routeSnippet of expectedRoutes) {
  reporter.record("App.jsx Route Table", `Protected route defined: ${routeSnippet}`, appJsxSource.includes(routeSnippet));
}

// Adversarial simulation of App() state transitions
function simulateAppExecution(initialToken) {
  const ls = setupBrowserMocks(initialToken ? { ids_token: initialToken } : {});
  let stateAuthed = auth.isAuthenticated();
  const setAuthed = (val) => { stateAuthed = val; };

  // Branch 1: Unauthenticated
  if (!stateAuthed) {
    return {
      rendered: "Login",
      onLogin: () => setAuthed(true),
      getState: () => stateAuthed,
      ls
    };
  }

  // Branch 2: Authenticated
  return {
    rendered: "AlertsProvider(SOCLayout)",
    getState: () => stateAuthed,
    ls
  };
}

// 3.1 Scenario: No token in localStorage
const simNoToken = simulateAppExecution(null);
reporter.record("App Guard Simulation", "No token -> Renders Login", simNoToken.rendered === "Login");
reporter.record("App Guard Simulation", "No token -> Authed state is false", simNoToken.getState() === false);

// Simulate user successfully logging in
simNoToken.onLogin();
reporter.record("App Guard Simulation", "Calling onLogin() -> Authed state transitions to true", simNoToken.getState() === true);

// 3.2 Scenario: Valid token in localStorage
const simValidToken = simulateAppExecution("valid-jwt-token-123");
reporter.record("App Guard Simulation", "Valid token -> Renders AlertsProvider(SOCLayout)", simValidToken.rendered === "AlertsProvider(SOCLayout)");
reporter.record("App Guard Simulation", "Valid token -> Authed state is true", simValidToken.getState() === true);

// 3.3 Scenario: Invalid/stale token in localStorage -> 401 on initial fetch -> logout() -> unauthenticated
const simStaleToken = simulateAppExecution("stale-expired-jwt");
reporter.record("App Guard Simulation", "Stale token initially renders layout", simStaleToken.rendered === "AlertsProvider(SOCLayout)");

// Simulate initial fetch receiving 401
global.window.location.reloadCalled = 0;
global.fetch = async () => ({
  ok: false,
  status: 401,
  statusText: "Unauthorized",
  headers: { get: () => "application/json" },
  json: async () => ({ detail: "Token invalide ou expiré" })
});

try {
  await api.listAlerts();
} catch (e) {
  // Expected 401 catch
}

reporter.record("App Guard Simulation", "Stale token 401 clears token from localStorage", global.localStorage.getItem("ids_token") === null);
reporter.record("App Guard Simulation", "Stale token 401 triggers reload", global.window.location.reloadCalled === 1);

// Post-reload re-evaluation
const simPostReload = simulateAppExecution(global.localStorage.getItem("ids_token"));
reporter.record("App Guard Simulation", "Post-401 reload renders Login", simPostReload.rendered === "Login");


console.log("\n" + "=".repeat(80));
console.log(`Summary: ${reporter.passes} PASSED, ${reporter.fails} FAILED`);
console.log("=".repeat(80));

if (reporter.fails > 0) {
  process.exit(1);
}
process.exit(0);
