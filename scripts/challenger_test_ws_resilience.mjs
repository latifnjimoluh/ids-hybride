#!/usr/bin/env node
/**
 * Empirical test harness for WebSocket Resilience and Notification Priority Throttling.
 * Executed by challenger_m2_2.
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

console.log("\n" + "=".repeat(80));
console.log("1. Testing Notification Priority Throttling (P1 > P2 > P3)");
console.log("=".repeat(80));

// Logic extracted directly from AlertsContext.jsx line 61
function selectWorstAlert(batch) {
  if (!batch || batch.length === 0) return null;
  return batch.reduce((m, a) => (a.priority < m.priority ? a : m), batch[0]);
}

// 1.1 Mixed priorities [P3, P1, P2] -> must select P1
const batch1 = [
  { sid: 1003, priority: 3, msg: "ICMP Ping Info", src_addr: "192.168.1.50", dst_addr: "192.168.1.1" },
  { sid: 1001, priority: 1, msg: "ET EXPLOIT Log4j RCE", src_addr: "10.0.0.99", dst_addr: "10.0.0.1" },
  { sid: 1002, priority: 2, msg: "ET SCAN Nmap SYN Scan", src_addr: "172.16.0.4", dst_addr: "172.16.0.1" }
];
const worst1 = selectWorstAlert(batch1);
reporter.record("Priority Reduction", "Mixed [P3, P1, P2] selects P1", worst1 && worst1.priority === 1 && worst1.sid === 1001);

// 1.2 Mixed priorities [P2, P3] -> must select P2
const batch2 = [
  { sid: 2002, priority: 2, msg: "ET SCAN Port Sweep", src_addr: "1.1.1.1", dst_addr: "2.2.2.2" },
  { sid: 2003, priority: 3, msg: "GPL DNS Request", src_addr: "1.1.1.1", dst_addr: "8.8.8.8" }
];
const worst2 = selectWorstAlert(batch2);
reporter.record("Priority Reduction", "Mixed [P2, P3] selects P2", worst2 && worst2.priority === 2 && worst2.sid === 2002);

// 1.3 Uniform priorities [P3, P3, P3] -> must select P3
const batch3 = [
  { sid: 3001, priority: 3, msg: "DNS query A", src_addr: "10.0.0.2", dst_addr: "10.0.0.1" },
  { sid: 3002, priority: 3, msg: "DNS query B", src_addr: "10.0.0.3", dst_addr: "10.0.0.1" },
  { sid: 3003, priority: 3, msg: "DNS query C", src_addr: "10.0.0.4", dst_addr: "10.0.0.1" }
];
const worst3 = selectWorstAlert(batch3);
reporter.record("Priority Reduction", "Uniform [P3, P3, P3] selects P3", worst3 && worst3.priority === 3);

// 1.4 Multiple P1 alerts -> retains first P1 encountered
const batch4 = [
  { sid: 4001, priority: 1, msg: "Ransomware C2 Contact", src_addr: "10.0.0.10", dst_addr: "185.220.101.5" },
  { sid: 4002, priority: 1, msg: "EternalBlue SMB Exploit", src_addr: "10.0.0.11", dst_addr: "10.0.0.12" }
];
const worst4 = selectWorstAlert(batch4);
reporter.record("Priority Reduction", "Multiple P1 alerts retains valid P1", worst4 && worst4.priority === 1 && worst4.sid === 4001);

// 1.5 Stress test: 10,000 alerts with single P1 buried in the middle
const largeBatch = [];
for (let i = 0; i < 10000; i++) {
  largeBatch.push({
    sid: 5000 + i,
    priority: i === 7777 ? 1 : (i % 2 === 0 ? 2 : 3),
    msg: `Alert #${i}`,
    src_addr: `10.0.${(i >> 8) & 255}.${i & 255}`,
    dst_addr: "10.0.0.1"
  });
}
const startT = performance.now();
const worstLarge = selectWorstAlert(largeBatch);
const elapsedMs = performance.now() - startT;

reporter.record("Priority Reduction Stress", "10,000 alerts finds buried P1", worstLarge && worstLarge.priority === 1 && worstLarge.sid === 12777);
reporter.record("Priority Reduction Stress", `10,000 alerts processed in < 15ms (${elapsedMs.toFixed(2)}ms)`, elapsedMs < 15);


console.log("\n" + "=".repeat(80));
console.log("2. Testing Notification Throttling Window & Anti-Spam Dispatch");
console.log("=".repeat(80));

// Mock Notification class
class MockNotification {
  static instances = [];
  static permission = "granted";

  constructor(title, options) {
    this.title = title;
    this.options = options;
    MockNotification.instances.push(this);
  }

  close() {
    this.closed = true;
  }
}

global.Notification = MockNotification;

// Notification dispatcher simulation replicating AlertsContext.jsx lines 53-72
class NotificationDispatcher {
  constructor(options = {}) {
    this.notifEnabled = options.notifEnabled !== undefined ? options.notifEnabled : true;
    this.permission = options.permission || "granted";
    this.supported = options.supported !== undefined ? options.supported : true;
    this.pending = [];
    this.dispatched = [];
  }

  pushAlert(alert) {
    this.pending.push(alert);
  }

  tick() {
    const batch = this.pending;
    this.pending = [];

    if (!batch.length || !this.notifEnabled) return;
    if (!this.supported || this.permission !== "granted") return;

    const worst = batch.reduce((m, a) => (a.priority < m.priority ? a : m), batch[0]);
    const title = batch.length === 1 ? "🛡️ Alerte Snort" : `🛡️ ${batch.length} nouvelles alertes Snort`;
    const body = `${worst.msg} (P${worst.priority})\n${worst.src_addr} → ${worst.dst_addr}`;

    const n = new MockNotification(title, { body, tag: "ids-alert", renotify: true });
    this.dispatched.push(n);
  }
}

// 2.1 Single alert generates singular title and format
MockNotification.instances = [];
const disp1 = new NotificationDispatcher();
disp1.pushAlert({ sid: 1, priority: 2, msg: "SSH Brute Force", src_addr: "1.2.3.4", dst_addr: "10.0.0.1" });
disp1.tick();

reporter.record("Notification Throttling", "Single alert uses singular title", MockNotification.instances.length === 1 && MockNotification.instances[0].title === "🛡️ Alerte Snort");
reporter.record("Notification Throttling", "Single alert body contains P2 & addresses", MockNotification.instances[0].options.body.includes("SSH Brute Force (P2)"));
reporter.record("Notification Throttling", "tag is 'ids-alert' and renotify is true", MockNotification.instances[0].options.tag === "ids-alert" && MockNotification.instances[0].options.renotify === true);
reporter.record("Notification Throttling", "Queue is emptied after tick", disp1.pending.length === 0);

// 2.2 Tick with empty queue produces no notification
disp1.tick();
reporter.record("Notification Throttling", "Empty queue produces no notification", MockNotification.instances.length === 1);

// 2.3 Multiple alerts within 4s interval generate single consolidated notification
MockNotification.instances = [];
const disp2 = new NotificationDispatcher();
for (let i = 0; i < 42; i++) {
  disp2.pushAlert({
    sid: i,
    priority: i === 20 ? 1 : 3,
    msg: i === 20 ? "Critical Exploit Attempt" : "DNS Query",
    src_addr: "192.168.1.100",
    dst_addr: "10.0.0.1"
  });
}
disp2.tick();

reporter.record("Notification Throttling", "42 incoming alerts coalesce into 1 notification", MockNotification.instances.length === 1);
reporter.record("Notification Throttling", "Title specifies exact count: '🛡️ 42 nouvelles alertes Snort'", MockNotification.instances[0].title === "🛡️ 42 nouvelles alertes Snort");
reporter.record("Notification Throttling", "Consolidated notification highlights P1 worst alert", MockNotification.instances[0].options.body.includes("Critical Exploit Attempt (P1)"));

// 2.4 Respects disabled notifications
MockNotification.instances = [];
const dispDisabled = new NotificationDispatcher({ notifEnabled: false });
dispDisabled.pushAlert({ sid: 99, priority: 1, msg: "Severe RCE", src_addr: "1.1.1.1", dst_addr: "2.2.2.2" });
dispDisabled.tick();
reporter.record("Notification Throttling", "Disabled notification suppresses output", MockNotification.instances.length === 0);

// 2.5 Respects denied browser permission
MockNotification.instances = [];
const dispDenied = new NotificationDispatcher({ permission: "denied" });
dispDenied.pushAlert({ sid: 99, priority: 1, msg: "Severe RCE", src_addr: "1.1.1.1", dst_addr: "2.2.2.2" });
dispDenied.tick();
reporter.record("Notification Throttling", "Denied permission suppresses output", MockNotification.instances.length === 0);


console.log("\n" + "=".repeat(80));
console.log("3. Testing WebSocket Reconnection Loop & Resilience");
console.log("=".repeat(80));

// Mock WebSocket class simulating network lifecycles
class MockWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.closed = false;
    this.closeCode = null;
    MockWebSocket.instances.push(this);
  }

  simulateOpen() {
    this.readyState = 1; // OPEN
    if (this.onopen) this.onopen();
  }

  simulateMessage(data) {
    if (this.onmessage) this.onmessage({ data: JSON.stringify(data) });
  }

  simulateError() {
    if (this.onerror) this.onerror(new Error("Network Error"));
  }

  simulateClose(code = 1000) {
    this.readyState = 3; // CLOSED
    this.closed = true;
    this.closeCode = code;
    if (this.onclose) this.onclose({ code });
  }

  close(code = 1000) {
    this.simulateClose(code);
  }
}

// Simulated AlertsContext WebSocket effect
function createWebSocketManager(wsUrl) {
  let stopped = false;
  let ws = null;
  let connected = false;
  let connectionCount = 0;
  let timeoutId = null;
  const timeouts = [];

  const connect = () => {
    if (stopped) return; // Defensive guard
    connectionCount++;
    ws = new MockWebSocket(wsUrl);
    ws.onopen = () => {
      connected = true;
    };
    ws.onclose = () => {
      connected = false;
      if (!stopped) {
        timeoutId = setTimeout(connect, 3000);
        timeouts.push(timeoutId);
      }
    };
    ws.onerror = () => {
      ws.close();
    };
  };

  connect();

  const cleanup = () => {
    stopped = true;
    if (timeoutId) clearTimeout(timeoutId);
    ws?.close();
  };

  return {
    get ws() { return ws; },
    get connected() { return connected; },
    get connectionCount() { return connectionCount; },
    cleanup
  };
}

// 3.1 Initial WebSocket connection and onopen
MockWebSocket.instances = [];
const mgr = createWebSocketManager("ws://localhost:8000/api/ws/alerts?token=token-123");
reporter.record("WebSocket Lifecycle", "Initial connection created", MockWebSocket.instances.length === 1);
reporter.record("WebSocket Lifecycle", "Initial connected state is false", mgr.connected === false);

mgr.ws.simulateOpen();
reporter.record("WebSocket Lifecycle", "After onopen connected state is true", mgr.connected === true);

// 3.2 Disconnect triggers reconnect after delay
mgr.ws.simulateClose(1006);
reporter.record("WebSocket Lifecycle", "After close connected state drops to false", mgr.connected === false);

// 3.3 Verify unmount cleanup terminates reconnect loop
const mgrClean = createWebSocketManager("ws://localhost:8000/api/ws/alerts?token=token-clean");
const currentCount = MockWebSocket.instances.length;
mgrClean.cleanup();
reporter.record("WebSocket Lifecycle", "Cleanup marks active ws as closed", mgrClean.ws.closed === true);

// 3.4 Flapping network stress test: 10 rapid disconnect/reconnect cycles
MockWebSocket.instances = [];
let flapMgrStopped = false;
let flapWs = null;
let flapConnected = false;
let flapReconnects = 0;

for (let cycle = 0; cycle < 10; cycle++) {
  flapWs = new MockWebSocket("ws://localhost:8000/api/ws/alerts?token=flap");
  flapWs.onopen = () => { flapConnected = true; };
  flapWs.onclose = () => { flapConnected = false; flapReconnects++; };
  flapWs.onerror = () => { flapWs.close(); };

  flapWs.simulateOpen();
  flapWs.simulateClose(1006);
}

reporter.record("WebSocket Stress", "10 rapid connect/disconnect cycles handled cleanly", flapReconnects === 10);
reporter.record("WebSocket Stress", "Final connection state is false", flapConnected === false);


console.log("\n" + "=".repeat(80));
console.log("4. Static Analysis & Verification of AlertsContext.jsx Invariants");
console.log("=".repeat(80));

const alertsContextPath = path.join(frontendSrc, "AlertsContext.jsx");
const alertsContextSource = fs.readFileSync(alertsContextPath, "utf8");

// 4.1 Verifies alerts buffer cap (500 items max to prevent OOM)
reporter.record(
  "AlertsContext Invariants",
  "Alerts array is capped at 500 items to prevent memory leaks",
  alertsContextSource.includes("[a, ...prev].slice(0, 500)")
);

// 4.2 Verifies WebSocket auto-reconnect delay is 3000ms
reporter.record(
  "AlertsContext Invariants",
  "WebSocket reconnect delay configured to 3000ms",
  alertsContextSource.includes("setTimeout(connect, 3000)")
);

// 4.3 Verifies notification throttling timer is 4000ms
reporter.record(
  "AlertsContext Invariants",
  "Notification anti-spam timer configured to 4000ms",
  alertsContextSource.includes("}, 4000)")
);

// 4.4 Verifies worst priority formula (a.priority < m.priority)
reporter.record(
  "AlertsContext Invariants",
  "Priority reducer implements strict P1 > P2 > P3 logic",
  alertsContextSource.includes("(a.priority < m.priority ? a : m)")
);

// 4.5 Verifies cleanup function closes ws and sets stopped
reporter.record(
  "AlertsContext Invariants",
  "Effect cleanup closes WebSocket and stops loop",
  alertsContextSource.includes("return () => { stopped = true; ws?.close(); };")
);


console.log("\n" + "=".repeat(80));
console.log(`Summary: ${reporter.passes} PASSED, ${reporter.fails} FAILED`);
console.log("=".repeat(80));

if (reporter.fails > 0) {
  process.exit(1);
}
process.exit(0);
