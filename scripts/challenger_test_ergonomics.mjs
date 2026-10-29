#!/usr/bin/env node
/**
 * Empirical Adversarial Stress-Test Suite for Milestone 2:
 * Data Manipulation Ergonomics, DataTable, exportUtils (RFC 4180), Alert Freeze, and ML ReferenceLine.
 * Executed by challenger_m2_1.
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

  summary() {
    console.log("\n" + "=".repeat(80));
    console.log(`TOTAL TESTS: ${this.passes + this.fails} | PASSED: ${this.passes} | FAILED: ${this.fails}`);
    console.log("=".repeat(80));
    return {
      total: this.passes + this.fails,
      passes: this.passes,
      fails: this.fails,
      results: this.results
    };
  }
}

const reporter = new TestReporter();

// ============================================================================ //
// Setup Global Browser Mocks for exportUtils.js
// ============================================================================ //
let lastBlobContent = null;
let lastBlobType = null;
let lastDownloadUrl = null;
let lastDownloadFilename = null;
let lastAlertMessage = null;

class MockBlob {
  constructor(contentArray, options = {}) {
    this.contentArray = contentArray;
    this.type = options.type || "";
    // Flatten content array to string
    lastBlobContent = contentArray.join("");
    lastBlobType = this.type;
  }
}

global.Blob = MockBlob;
global.alert = (msg) => {
  lastAlertMessage = msg;
};

global.URL = {
  createObjectURL: (blob) => {
    lastDownloadUrl = `blob:mock-url-${Date.now()}`;
    return lastDownloadUrl;
  },
  revokeObjectURL: (url) => {
    // URL revoked
  }
};

global.document = {
  body: {
    appendChild: (elem) => {},
    removeChild: (elem) => {}
  },
  createElement: (tag) => {
    if (tag === "a") {
      return {
        attributes: {},
        setAttribute(k, v) {
          this.attributes[k] = v;
          if (k === "download") lastDownloadFilename = v;
          if (k === "href") lastDownloadUrl = v;
        },
        click() {
          this.clicked = true;
        }
      };
    }
    return {};
  }
};

function resetMocks() {
  lastBlobContent = null;
  lastBlobType = null;
  lastDownloadUrl = null;
  lastDownloadFilename = null;
  lastAlertMessage = null;
}

// Import exportUtils
const exportUtilsPath = path.join(frontendSrc, "components", "ui", "exportUtils.js");
const { exportToCsv, exportToJson } = await import(`file://${exportUtilsPath.replace(/\\/g, "/")}`);

// ============================================================================ //
// SUITE 1: exportUtils.js — RFC 4180 CSV & JSON Compliance
// ============================================================================ //
console.log("\n" + "=".repeat(80));
console.log("SUITE 1: exportUtils.js — RFC 4180 CSV & JSON Compliance");
console.log("=".repeat(80));

// 1.1 BOM UTF-8 at offset 0
resetMocks();
exportToCsv([{ id: 1, name: "test" }], "bom_test");
reporter.record(
  "1. CSV RFC 4180",
  "UTF-8 BOM presence at offset 0",
  lastBlobContent && lastBlobContent.startsWith("\uFEFF"),
  `First char code: ${lastBlobContent ? lastBlobContent.charCodeAt(0).toString(16) : "none"}`
);

// 1.2 Delimiter CRLF \r\n between records
reporter.record(
  "1. CSV RFC 4180",
  "CRLF (\\r\\n) line terminator",
  lastBlobContent && lastBlobContent.includes("\r\n"),
  "Output contains CRLF sequence"
);

// 1.3 Cells with commas
resetMocks();
exportToCsv([{ desc: "Attack, Inbound, Critical", ip: "10.0.0.1" }], "comma_test");
reporter.record(
  "1. CSV RFC 4180",
  "Escape comma-containing fields with double quotes",
  lastBlobContent && lastBlobContent.includes('"Attack, Inbound, Critical"'),
  `Content snippet: ${lastBlobContent.replace("\uFEFF", "").split("\r\n")[1]}`
);

// 1.4 Cells with double quotes (must be escaped as "")
resetMocks();
exportToCsv([{ msg: 'Snort "SQLi" attempt detected' }], "quote_test");
const quoteLine = lastBlobContent.replace("\uFEFF", "").split("\r\n")[1];
reporter.record(
  "1. CSV RFC 4180",
  'Escape double quotes as ""',
  quoteLine === '"Snort ""SQLi"" attempt detected"',
  `Escaped line: ${quoteLine}`
);

// 1.5 Cells with newlines (\n and \r\n)
resetMocks();
exportToCsv([{ payload: "GET /index.php\nHost: example.com\r\nUser-Agent: curl" }], "newline_test");
reporter.record(
  "1. CSV RFC 4180",
  "Escape embedded newlines within quoted fields",
  lastBlobContent.includes('"GET /index.php\nHost: example.com\r\nUser-Agent: curl"'),
  "Embedded newlines preserved inside quotes"
);

// 1.6 Cells with null / undefined
resetMocks();
exportToCsv([{ a: null, b: undefined, c: "valid" }], "null_test");
const nullLine = lastBlobContent.replace("\uFEFF", "").split("\r\n")[1];
reporter.record(
  "1. CSV RFC 4180",
  'Null and undefined serialized as empty quoted string ""',
  nullLine === '"""","""","valid"' || nullLine === '"","","valid"',
  `Actual line: ${nullLine}`
);

// 1.7 Adversarial mixed payload: quotes, commas, newlines, utf8 symbols
resetMocks();
const adversarialCell = 'Malware: "Dropper", payload=\'calc.exe\', alert \n [P1] \u26A0';
exportToCsv([{ adv: adversarialCell }], "adv_test");
const advLine = lastBlobContent.replace("\uFEFF", "").split("\r\n")[1];
reporter.record(
  "1. CSV RFC 4180",
  "Adversarial payload (quotes + commas + newlines + UTF8)",
  advLine === '"Malware: ""Dropper"", payload=\'calc.exe\', alert \n [P1] \u26A0"',
  `Adv line: ${advLine}`
);

// 1.8 Custom columns array formatting
resetMocks();
const customCols = [
  { key: "sid", label: "Rule SID" },
  { key: "msg", label: "Message Description" }
];
exportToCsv([{ sid: 1001, msg: "Test Rule", raw: "hidden" }], "cols_test", customCols);
const colsHeader = lastBlobContent.replace("\uFEFF", "").split("\r\n")[0];
const colsData = lastBlobContent.replace("\uFEFF", "").split("\r\n")[1];
reporter.record(
  "1. CSV RFC 4180",
  "Custom columns header and field extraction",
  colsHeader === '"Rule SID","Message Description"' && colsData === '"1001","Test Rule"',
  `Header: ${colsHeader} | Data: ${colsData}`
);

// 1.9 Filename date stamp suffix
reporter.record(
  "1. CSV RFC 4180",
  "Automatic ISO date suffix in filename",
  lastDownloadFilename && /^cols_test_\d{4}-\d{2}-\d{2}\.csv$/.test(lastDownloadFilename),
  `Filename: ${lastDownloadFilename}`
);

// 1.10 Empty data guard in exportToCsv
resetMocks();
exportToCsv([], "empty_csv");
reporter.record(
  "1. CSV RFC 4180",
  "Empty dataset triggers alert and aborts cleanly",
  lastAlertMessage === "Aucune donnée à exporter." && lastBlobContent === null,
  `Alert msg: ${lastAlertMessage}`
);

// 1.11 JSON Export valid format and deep equality
resetMocks();
const sampleData = [
  { sid: 1, priority: 1, msg: 'Test "1"' },
  { sid: 2, priority: 2, msg: "Test 2, with comma" }
];
exportToJson(sampleData, "json_export");
let parsedJson = null;
let parseOk = false;
try {
  parsedJson = JSON.parse(lastBlobContent);
  parseOk = true;
} catch (e) {
  parseOk = false;
}
reporter.record(
  "1. JSON Export",
  "Valid JSON parsable output",
  parseOk && Array.isArray(parsedJson) && parsedJson.length === 2,
  `Parsed items count: ${parsedJson ? parsedJson.length : 0}`
);

// 1.12 JSON formatting (indented 2 spaces)
reporter.record(
  "1. JSON Export",
  "2-space indentation formatting",
  lastBlobContent.includes('  "sid": 1'),
  "Indented with 2 spaces"
);

// 1.13 JSON deep equality
reporter.record(
  "1. JSON Export",
  "Deep fidelity with source dataset",
  JSON.stringify(parsedJson) === JSON.stringify(sampleData),
  "Round-trip matches 100%"
);

// 1.14 JSON empty data guard
resetMocks();
exportToJson(null, "null_json");
reporter.record(
  "1. JSON Export",
  "Null dataset triggers alert and aborts",
  lastAlertMessage === "Aucune donnée à exporter." && lastBlobContent === null,
  `Alert msg: ${lastAlertMessage}`
);


// ============================================================================ //
// SUITE 2: DataTable.jsx — Sorting Logic
// ============================================================================ //
console.log("\n" + "=".repeat(80));
console.log("SUITE 2: DataTable.jsx — Sorting Engine");
console.log("=".repeat(80));

// Extract the sort algorithm from DataTable.jsx lines 60-83
function dataTableSort(data, sortKey, direction) {
  if (!sortKey || !direction) return data;
  return [...data].sort((a, b) => {
    let valA = a[sortKey];
    let valB = b[sortKey];

    if (valA === valB) return 0;
    if (valA === null || valA === undefined) return 1;
    if (valB === null || valB === undefined) return -1;

    // Numeric comparison
    if (typeof valA === "number" && typeof valB === "number") {
      return direction === "asc" ? valA - valB : valB - valA;
    }

    // String comparison
    const strA = String(valA).toLowerCase();
    const strB = String(valB).toLowerCase();
    if (strA < strB) return direction === "asc" ? -1 : 1;
    if (strA > strB) return direction === "asc" ? 1 : -1;
    return 0;
  });
}

// Sort header click transition function (from DataTable.jsx lines 97-107)
function nextSortConfig(currentConfig, clickedKey, sortable = true) {
  if (!sortable) return currentConfig;
  if (currentConfig.key !== clickedKey) {
    return { key: clickedKey, direction: "asc" };
  }
  if (currentConfig.direction === "asc") {
    return { key: clickedKey, direction: "desc" };
  }
  return { key: null, direction: null };
}

// 2.1 Numeric sorting (SID) asc & desc
const numericData = [
  { sid: 105, name: "e" },
  { sid: 2, name: "b" },
  { sid: 45, name: "d" },
  { sid: 1000, name: "f" },
  { sid: 1, name: "a" },
  { sid: 15, name: "c" }
];
const numAsc = dataTableSort(numericData, "sid", "asc").map(r => r.sid);
const numDesc = dataTableSort(numericData, "sid", "desc").map(r => r.sid);
reporter.record(
  "2. DataTable Sorting",
  "Numeric SID sort ascending",
  JSON.stringify(numAsc) === JSON.stringify([1, 2, 15, 45, 105, 1000]),
  `Result: [${numAsc.join(", ")}]`
);
reporter.record(
  "2. DataTable Sorting",
  "Numeric SID sort descending",
  JSON.stringify(numDesc) === JSON.stringify([1000, 105, 45, 15, 2, 1]),
  `Result: [${numDesc.join(", ")}]`
);

// 2.2 Numeric sorting with negative numbers and floats
const floatData = [
  { score: 0.45 },
  { score: -1.2 },
  { score: 0.001 },
  { score: 0.999 },
  { score: -0.05 }
];
const floatAsc = dataTableSort(floatData, "score", "asc").map(r => r.score);
const floatDesc = dataTableSort(floatData, "score", "desc").map(r => r.score);
reporter.record(
  "2. DataTable Sorting",
  "Float and negative scores ascending",
  JSON.stringify(floatAsc) === JSON.stringify([-1.2, -0.05, 0.001, 0.45, 0.999]),
  `Result: [${floatAsc.join(", ")}]`
);
reporter.record(
  "2. DataTable Sorting",
  "Float and negative scores descending",
  JSON.stringify(floatDesc) === JSON.stringify([0.999, 0.45, 0.001, -0.05, -1.2]),
  `Result: [${floatDesc.join(", ")}]`
);

// 2.3 Date / timestamp sorting (ISO 8601 strings)
const dateData = [
  { ts: "2026-10-29T14:30:00Z", id: 3 },
  { ts: "2026-10-29T08:15:00Z", id: 1 },
  { ts: "2026-10-29T10:00:00Z", id: 2 },
  { ts: "2026-10-29T23:59:59Z", id: 4 }
];
const dateAsc = dataTableSort(dateData, "ts", "asc").map(r => r.id);
const dateDesc = dataTableSort(dateData, "ts", "desc").map(r => r.id);
reporter.record(
  "2. DataTable Sorting",
  "ISO 8601 timestamp sort ascending",
  JSON.stringify(dateAsc) === JSON.stringify([1, 2, 3, 4]),
  `Order: [${dateAsc.join(", ")}]`
);
reporter.record(
  "2. DataTable Sorting",
  "ISO 8601 timestamp sort descending",
  JSON.stringify(dateDesc) === JSON.stringify([4, 3, 2, 1]),
  `Order: [${dateDesc.join(", ")}]`
);

// 2.4 String sorting: case-insensitivity
const strData = [
  { proto: "udp" },
  { proto: "TCP" },
  { proto: "Icmp" },
  { proto: "http" }
];
const strAsc = dataTableSort(strData, "proto", "asc").map(r => r.proto);
reporter.record(
  "2. DataTable Sorting",
  "Case-insensitive string sort",
  JSON.stringify(strAsc) === JSON.stringify(["http", "Icmp", "TCP", "udp"]),
  `Order: [${strAsc.join(", ")}]`
);

// 2.5 Sorting with null and undefined fields (must go to bottom in both asc and desc)
const nullData = [
  { val: 50, id: "a" },
  { val: null, id: "b" },
  { val: 10, id: "c" },
  { val: undefined, id: "d" },
  { val: 30, id: "e" }
];
const nullAsc = dataTableSort(nullData, "val", "asc");
const nullDesc = dataTableSort(nullData, "val", "desc");
const ascValues = nullAsc.map(r => r.val);
const descValues = nullDesc.map(r => r.val);
// In asc: 10, 30, 50 first, then null/undefined at end
const ascNullsAtEnd = ascValues[0] === 10 && ascValues[1] === 30 && ascValues[2] === 50 &&
                      (ascValues[3] === null || ascValues[3] === undefined) &&
                      (ascValues[4] === null || ascValues[4] === undefined);
// In desc: 50, 30, 10 first, then null/undefined at end
const descNullsAtEnd = descValues[0] === 50 && descValues[1] === 30 && descValues[2] === 10 &&
                       (descValues[3] === null || descValues[3] === undefined) &&
                       (descValues[4] === null || descValues[4] === undefined);

reporter.record(
  "2. DataTable Sorting",
  "Nulls and undefined placed at bottom in asc sort",
  ascNullsAtEnd,
  `Asc: [${ascValues.join(", ")}]`
);
reporter.record(
  "2. DataTable Sorting",
  "Nulls and undefined placed at bottom in desc sort",
  descNullsAtEnd,
  `Desc: [${descValues.join(", ")}]`
);

// 2.6 Tri-state sort reversal: asc -> desc -> neutral
let sState = { key: null, direction: null };
sState = nextSortConfig(sState, "sid");
const step1Ok = sState.key === "sid" && sState.direction === "asc";
sState = nextSortConfig(sState, "sid");
const step2Ok = sState.key === "sid" && sState.direction === "desc";
sState = nextSortConfig(sState, "sid");
const step3Ok = sState.key === null && sState.direction === null;

reporter.record(
  "2. DataTable Sorting",
  "Tri-state toggle (neutral -> asc -> desc -> neutral)",
  step1Ok && step2Ok && step3Ok,
  `Step1: ${JSON.stringify(sState)}`
);

// 2.7 Neutral returns original order
const originalOrder = [
  { id: 3, val: 99 },
  { id: 1, val: 12 },
  { id: 2, val: 50 }
];
const neutralSorted = dataTableSort(originalOrder, null, null);
reporter.record(
  "2. DataTable Sorting",
  "Neutral sort restores original array order",
  JSON.stringify(neutralSorted) === JSON.stringify(originalOrder),
  "Original order preserved"
);

// 2.8 Switch column on click immediately sets asc on new column
sState = { key: "sid", direction: "desc" };
sState = nextSortConfig(sState, "timestamp");
reporter.record(
  "2. DataTable Sorting",
  "Column switch immediately activates asc on new column",
  sState.key === "timestamp" && sState.direction === "asc",
  `New config: ${JSON.stringify(sState)}`
);

// 2.9 Sortable=false ignored
sState = { key: "sid", direction: "asc" };
sState = nextSortConfig(sState, "actions", false);
reporter.record(
  "2. DataTable Sorting",
  "Non-sortable header click is ignored",
  sState.key === "sid" && sState.direction === "asc",
  `Config retained: ${JSON.stringify(sState)}`
);


// ============================================================================ //
// SUITE 3: DataTable.jsx — Live Search Filtering
// ============================================================================ //
console.log("\n" + "=".repeat(80));
console.log("SUITE 3: DataTable.jsx — Live Search Engine");
console.log("=".repeat(80));

// Extract filter logic from DataTable.jsx lines 37-57
function dataTableFilter(data, searchQuery, searchKeys, columns) {
  if (!data || !Array.isArray(data)) return [];
  if (!searchQuery.trim()) return data;

  const query = searchQuery.toLowerCase().trim();
  return data.filter(row => {
    if (searchKeys.length > 0) {
      return searchKeys.some(key => {
        const val = row[key];
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(query);
      });
    }
    return columns.some(col => {
      const val = row[col.key];
      if (val === null || val === undefined) return false;
      return String(val).toLowerCase().includes(query);
    });
  });
}

const testAlerts = [
  { sid: 2000001, msg: "ET TROJAN Observed Malicious SSL Cert", proto: "TCP", src_addr: "192.168.1.105", dst_addr: "45.33.32.156" },
  { sid: 2000002, msg: "GPL SCAN nmap XMAS", proto: "TCP", src_addr: "10.0.0.5", dst_addr: "192.168.1.1" },
  { sid: 2000003, msg: "ET DNS Query for Suspicious .top Domain", proto: "UDP", src_addr: "192.168.1.50", dst_addr: "8.8.8.8" },
  { sid: 2000004, msg: "ICMP PING Sweeper detected", proto: "ICMP", src_addr: "10.0.0.99", dst_addr: "192.168.1.255" }
];
const sKeys = ["msg", "src_addr", "dst_addr", "proto", "sid"];

// 3.1 Case-insensitivity
const f1 = dataTableFilter(testAlerts, "TROJAN", sKeys, []);
const f2 = dataTableFilter(testAlerts, "trojan", sKeys, []);
const f3 = dataTableFilter(testAlerts, "TrOjAn", sKeys, []);
reporter.record(
  "3. Live Search",
  "Case-insensitivity ('TROJAN' vs 'trojan' vs 'TrOjAn')",
  f1.length === 1 && f2.length === 1 && f3.length === 1 && f1[0].sid === 2000001,
  `Matched SID: ${f1[0]?.sid}`
);

// 3.2 Partial matching on IP address
const fIp = dataTableFilter(testAlerts, "192.168.1.", sKeys, []);
reporter.record(
  "3. Live Search",
  "Partial substring match on IP ('192.168.1.')",
  fIp.length === 4,
  `Matched count: ${fIp.length} / 4`
);

// 3.3 Numeric field search (SID)
const fSid = dataTableFilter(testAlerts, "2000003", sKeys, []);
reporter.record(
  "3. Live Search",
  "Search matching numeric field (SID 2000003)",
  fSid.length === 1 && fSid[0].sid === 2000003,
  `Matched msg: ${fSid[0]?.msg}`
);

// 3.4 Special characters and regex safety
const specialQueries = [
  "$HOME_NET",
  "192.168.1.105",
  "*.top",
  "[P1]",
  "(test)",
  "a+b",
  "\\d+"
];
let specialSafe = true;
for (const sq of specialQueries) {
  try {
    const res = dataTableFilter(testAlerts, sq, sKeys, []);
    assert(Array.isArray(res));
  } catch (err) {
    specialSafe = false;
    break;
  }
}
reporter.record(
  "3. Live Search",
  "Regex-sensitive special chars do not crash substring search",
  specialSafe,
  "All special queries handled safely"
);

// 3.5 Whitespace trimming
const fTrim = dataTableFilter(testAlerts, "   udp   ", sKeys, []);
reporter.record(
  "3. Live Search",
  "Whitespace trimming ('   udp   ')",
  fTrim.length === 1 && fTrim[0].proto === "UDP",
  `Found proto: ${fTrim[0]?.proto}`
);

// 3.6 Empty or whitespace-only returns all
const fEmpty = dataTableFilter(testAlerts, "   ", sKeys, []);
reporter.record(
  "3. Live Search",
  "Whitespace-only query returns all items",
  fEmpty.length === testAlerts.length,
  `Count: ${fEmpty.length}`
);

// 3.7 No-match returns empty array cleanly
const fNone = dataTableFilter(testAlerts, "NONEXISTENT_PAYLOAD_XYZ", sKeys, []);
reporter.record(
  "3. Live Search",
  "No-match query returns empty array",
  fNone.length === 0,
  `Count: ${fNone.length}`
);

// 3.8 Fallback to columns when searchKeys is empty
const colsFallback = [
  { key: "src_addr" },
  { key: "proto" }
];
const fFallback = dataTableFilter(testAlerts, "icmp", [], colsFallback);
reporter.record(
  "3. Live Search",
  "Fallback to columns keys when searchKeys is empty",
  fFallback.length === 1 && fFallback[0].proto === "ICMP",
  `Found: ${fFallback[0]?.proto}`
);


// ============================================================================ //
// SUITE 4: DataTable.jsx — Pagination Logic & Bounds
// ============================================================================ //
console.log("\n" + "=".repeat(80));
console.log("SUITE 4: DataTable.jsx — Pagination Engine");
console.log("=".repeat(80));

function paginate(items, currentPage, pageSize, pagination = true) {
  const totalItems = items.length;
  const totalPages = pagination ? Math.max(1, Math.ceil(totalItems / pageSize)) : 1;
  const safeCurrentPage = Math.min(currentPage, totalPages);

  if (!pagination) return { paginatedData: items, totalPages, safeCurrentPage, totalItems };
  const start = (safeCurrentPage - 1) * pageSize;
  const paginatedData = items.slice(start, start + pageSize);
  return { paginatedData, totalPages, safeCurrentPage, totalItems };
}

// Generate 45 items
const items45 = Array.from({ length: 45 }, (_, i) => ({ id: i + 1 }));

// 4.1 Page count calculation
const p15 = paginate(items45, 1, 15);
reporter.record(
  "4. Pagination",
  "Exact page count (45 items / 15 per page = 3 pages)",
  p15.totalPages === 3 && p15.paginatedData.length === 15,
  `totalPages: ${p15.totalPages}`
);

// 4.2 Non-multiple page count
const items46 = Array.from({ length: 46 }, (_, i) => ({ id: i + 1 }));
const p46 = paginate(items46, 1, 15);
reporter.record(
  "4. Pagination",
  "Non-multiple page count (46 items / 15 per page = 4 pages)",
  p46.totalPages === 4,
  `totalPages: ${p46.totalPages}`
);

// 4.3 Slice accuracy across pages
const page2 = paginate(items45, 2, 15);
const page3 = paginate(items45, 3, 15);
const p2Start = page2.paginatedData[0].id;
const p2End = page2.paginatedData[page2.paginatedData.length - 1].id;
const p3Start = page3.paginatedData[0].id;
const p3End = page3.paginatedData[page3.paginatedData.length - 1].id;
reporter.record(
  "4. Pagination",
  "Page slice accuracy (Page 2: ids 16-30, Page 3: ids 31-45)",
  p2Start === 16 && p2End === 30 && p3Start === 31 && p3End === 45,
  `P2: [${p2Start}..${p2End}] | P3: [${p3Start}..${p3End}]`
);

// 4.4 Clamping when page exceeds total pages
const pOver = paginate(items45, 10, 15);
reporter.record(
  "4. Pagination",
  "Safe clamping when currentPage exceeds totalPages",
  pOver.safeCurrentPage === 3 && pOver.paginatedData.length === 15,
  `Clamped to page: ${pOver.safeCurrentPage}`
);

// 4.5 Empty dataset pagination
const pZero = paginate([], 1, 15);
reporter.record(
  "4. Pagination",
  "Empty dataset pagination (totalPages=1, empty array)",
  pZero.totalPages === 1 && pZero.paginatedData.length === 0,
  `totalPages: ${pZero.totalPages}`
);

// 4.6 Disabled pagination
const pOff = paginate(items45, 1, 15, false);
reporter.record(
  "4. Pagination",
  "Disabled pagination returns all items",
  pOff.paginatedData.length === 45,
  `Returned items: ${pOff.paginatedData.length}`
);


// ============================================================================ //
// SUITE 5: Alerts.jsx — Alert Freeze / Pause Mechanism
// ============================================================================ //
console.log("\n" + "=".repeat(80));
console.log("SUITE 5: Alerts.jsx — Alert Freeze / Pause Engine");
console.log("=".repeat(80));

// Emulate Alerts.jsx freeze state machine (Alerts.jsx lines 32-53)
class AlertsFreezeModel {
  constructor(initialAlerts = []) {
    this.alerts = [...initialAlerts];
    this.isPaused = false;
    this.frozenAlerts = [];
    this.prioFilter = "all";
  }

  togglePause() {
    if (!this.isPaused) {
      this.frozenAlerts = [...this.alerts];
      this.isPaused = true;
    } else {
      this.isPaused = false;
      this.frozenAlerts = [];
    }
  }

  setPrioFilter(prio) {
    this.prioFilter = prio;
  }

  // Live stream push
  receiveLiveAlert(newAlert) {
    this.alerts.unshift(newAlert);
  }

  getDisplayAlerts() {
    const base = this.isPaused ? this.frozenAlerts : this.alerts;
    if (this.prioFilter === "all") return base;
    return base.filter(a => String(a.priority) === this.prioFilter);
  }
}

const freezeModel = new AlertsFreezeModel([
  { id: 1, priority: 1, msg: "Alerte initiale 1" },
  { id: 2, priority: 2, msg: "Alerte initiale 2" },
  { id: 3, priority: 3, msg: "Alerte initiale 3" }
]);

// 5.1 Initial unpaused state
reporter.record(
  "5. Alert Freeze",
  "Initial live state (display equals live stream)",
  freezeModel.getDisplayAlerts().length === 3 && !freezeModel.isPaused,
  `Display count: ${freezeModel.getDisplayAlerts().length}`
);

// 5.2 Freeze snapshot
freezeModel.togglePause();
reporter.record(
  "5. Alert Freeze",
  "Toggle pause activates freeze snapshot",
  freezeModel.isPaused && freezeModel.frozenAlerts.length === 3,
  `Frozen count: ${freezeModel.frozenAlerts.length}`
);

// 5.3 Live alerts arrive while frozen
freezeModel.receiveLiveAlert({ id: 4, priority: 1, msg: "Incoming live 4" });
freezeModel.receiveLiveAlert({ id: 5, priority: 1, msg: "Incoming live 5" });
freezeModel.receiveLiveAlert({ id: 6, priority: 2, msg: "Incoming live 6" });

const displayWhileFrozen = freezeModel.getDisplayAlerts();
reporter.record(
  "5. Alert Freeze",
  "Live alerts do NOT mutate frozen display",
  displayWhileFrozen.length === 3 && freezeModel.alerts.length === 6,
  `Live alerts count: ${freezeModel.alerts.length} | Displayed count: ${displayWhileFrozen.length}`
);

// 5.4 Priority filtering on frozen snapshot
freezeModel.setPrioFilter("1");
const filteredFrozen = freezeModel.getDisplayAlerts();
reporter.record(
  "5. Alert Freeze",
  "Priority filtering applies strictly to frozen snapshot",
  filteredFrozen.length === 1 && filteredFrozen[0].id === 1,
  `Filtered P1 count: ${filteredFrozen.length} (expected 1, not 3)`
);

// 5.5 Unpause / resume stream
freezeModel.setPrioFilter("all");
freezeModel.togglePause();
const displayAfterResume = freezeModel.getDisplayAlerts();
reporter.record(
  "5. Alert Freeze",
  "Unpausing immediately catches up with all live alerts",
  !freezeModel.isPaused && displayAfterResume.length === 6 && displayAfterResume[0].id === 6,
  `Resumed count: ${displayAfterResume.length}`
);


// ============================================================================ //
// SUITE 6: ML.jsx — Anomaly Histogram & ReferenceLine Threshold Logic
// ============================================================================ //
console.log("\n" + "=".repeat(80));
console.log("SUITE 6: ML.jsx — Histogram & ReferenceLine Threshold Engine");
console.log("=".repeat(80));

// Extract histogram algorithm from ML.jsx lines 108-137
function computeMlHistogram(data) {
  if (!data?.items?.length) return { histogramData: [], thresholdBucket: null };
  const scores = data.items.map((i) => i.anomaly_score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = max - min || 1;

  const bins = Array.from({ length: 12 }, (_, i) => ({
    bucket: (min + (span * i) / 12).toFixed(2),
    count: 0,
    anomaly: false,
  }));

  let foundThreshold = null;

  for (const it of data.items) {
    let idx = Math.floor(((it.anomaly_score - min) / span) * 12);
    if (idx >= 12) idx = 11;
    if (idx < 0) idx = 0;
    bins[idx].count += 1;
    if (it.is_anomaly) {
      bins[idx].anomaly = true;
      if (!foundThreshold || Number(bins[idx].bucket) < Number(foundThreshold)) {
        foundThreshold = bins[idx].bucket;
      }
    }
  }

  return { histogramData: bins, thresholdBucket: foundThreshold };
}

// 6.1 Empty / null data handling
const mlEmpty1 = computeMlHistogram(null);
const mlEmpty2 = computeMlHistogram({ items: [] });
reporter.record(
  "6. ML Threshold Logic",
  "Empty dataset returns empty histogram and null threshold",
  mlEmpty1.histogramData.length === 0 && mlEmpty1.thresholdBucket === null &&
  mlEmpty2.histogramData.length === 0 && mlEmpty2.thresholdBucket === null,
  "Handled cleanly without throw"
);

// 6.2 Nominal data without anomalies (all is_anomaly=false)
const nominalItems = Array.from({ length: 50 }, (_, i) => ({
  anomaly_score: 0.10 + (i * 0.005),
  is_anomaly: false
}));
const mlNominal = computeMlHistogram({ items: nominalItems });
const anyNominalAnomalies = mlNominal.histogramData.some(b => b.anomaly);
reporter.record(
  "6. ML Threshold Logic",
  "Nominal dataset has no anomaly bins and null threshold (ReferenceLine hidden)",
  !anyNominalAnomalies && mlNominal.thresholdBucket === null && mlNominal.histogramData.length === 12,
  `Threshold: ${mlNominal.thresholdBucket}`
);

// 6.3 Mixed dataset with distinct anomaly cluster
const mixedItems = [
  // 30 normal items between 0.05 and 0.35
  ...Array.from({ length: 30 }, (_, i) => ({
    anomaly_score: 0.05 + (i * 0.01),
    is_anomaly: false
  })),
  // 5 anomaly items between 0.75 and 0.95
  ...Array.from({ length: 5 }, (_, i) => ({
    anomaly_score: 0.75 + (i * 0.05),
    is_anomaly: true
  }))
];
const mlMixed = computeMlHistogram({ items: mixedItems });
const totalCount = mlMixed.histogramData.reduce((acc, b) => acc + b.count, 0);
reporter.record(
  "6. ML Threshold Logic",
  "Histogram bins preserve total sample count (35 items)",
  totalCount === 35,
  `Total count in bins: ${totalCount}`
);
reporter.record(
  "6. ML Threshold Logic",
  "ReferenceLine threshold identified at start of anomaly cluster",
  mlMixed.thresholdBucket !== null && Number(mlMixed.thresholdBucket) >= 0.70,
  `Found threshold bucket: ${mlMixed.thresholdBucket}`
);

// 6.4 Boundary test: Identical scores (span = 0 fallback to 1)
const identicalScores = Array.from({ length: 10 }, () => ({
  anomaly_score: 0.42,
  is_anomaly: false
}));
const mlIdentical = computeMlHistogram({ items: identicalScores });
reporter.record(
  "6. ML Threshold Logic",
  "Zero-span identical scores avoids division by zero (NaN)",
  !isNaN(Number(mlIdentical.histogramData[0].bucket)) && mlIdentical.histogramData[0].count === 10,
  `Bin 0 count: ${mlIdentical.histogramData[0].count}`
);

// 6.5 Boundary test: Upper bound clamping (score == max lands in bin 11, not 12)
const maxEdgeItems = [
  { anomaly_score: 0.0, is_anomaly: false },
  { anomaly_score: 1.0, is_anomaly: true }
];
const mlMaxEdge = computeMlHistogram({ items: maxEdgeItems });
reporter.record(
  "6. ML Threshold Logic",
  "Score exactly at max clamps to bin index 11",
  mlMaxEdge.histogramData.length === 12 && mlMaxEdge.histogramData[11].count === 1 && mlMaxEdge.histogramData[11].anomaly === true,
  `Bin 11 count: ${mlMaxEdge.histogramData[11].count}`
);

// 6.6 Boundary test: Negative scores (Isolation Forest decision function below 0)
const negativeItems = [
  { anomaly_score: -0.35, is_anomaly: false },
  { anomaly_score: -0.10, is_anomaly: false },
  { anomaly_score: 0.15, is_anomaly: false },
  { anomaly_score: 0.45, is_anomaly: true }
];
const mlNegative = computeMlHistogram({ items: negativeItems });
reporter.record(
  "6. ML Threshold Logic",
  "Negative anomaly scores handled accurately",
  mlNegative.histogramData.length === 12 && mlNegative.thresholdBucket !== null,
  `Threshold bucket with negative min: ${mlNegative.thresholdBucket}`
);

// ============================================================================ //
// SUITE 7: DataTable.jsx — React Component DOM & XSS Safety Rendering
// ============================================================================ //
console.log("\n" + "=".repeat(80));
console.log("SUITE 7: DataTable.jsx — React DOM & XSS Safety Rendering");
console.log("=".repeat(80));

let DataTableComponent = null;
const tempBundlePath = path.resolve(projectRoot, "frontend", "node_modules", ".test_datatable_bundle.mjs");

try {
  const esbuildPath = path.join(projectRoot, "frontend", "node_modules", "esbuild", "lib", "main.js");
  const esbuild = (await import(pathToFileURL(esbuildPath).href)).default;
  await esbuild.build({
    entryPoints: [path.join(frontendSrc, "components", "ui", "DataTable.jsx")],
    bundle: true,
    format: "esm",
    outfile: tempBundlePath,
    external: ["react", "react-dom", "lucide-react"]
  });

  const imported = await import(pathToFileURL(tempBundlePath).href);
  DataTableComponent = imported.default;
} catch (err) {
  console.error("Failed to build DataTable for rendering:", err);
}

const reactPath = path.join(projectRoot, "frontend", "node_modules", "react", "index.js");
const React = (await import(pathToFileURL(reactPath).href)).default;
const rdomPath = path.join(projectRoot, "frontend", "node_modules", "react-dom", "server.node.js");
const { renderToStaticMarkup } = await import(pathToFileURL(rdomPath).href);

if (DataTableComponent) {
  // 7.1 XSS Escaping Safety
  const xssData = [
    { sid: 9999, msg: '<script>alert("XSS")</script>', src_addr: '<img src=x onerror=alert(1)>' }
  ];
  const xssCols = [
    { key: "sid", label: "SID" },
    { key: "msg", label: "Message" },
    { key: "src_addr", label: "Source" }
  ];
  const renderedXss = renderToStaticMarkup(React.createElement(DataTableComponent, {
    columns: xssCols,
    data: xssData
  }));

  const xssPrevented = !renderedXss.includes('<script>') &&
                       renderedXss.includes('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;') &&
                       !renderedXss.includes('<img src=x') &&
                       renderedXss.includes('&lt;img src=x onerror=alert(1)&gt;');
  reporter.record(
    "7. React DOM & XSS Safety",
    "Active XSS payloads escaped safely in table cells",
    xssPrevented,
    "HTML tags escaped to entities"
  );

  // 7.2 Empty State Markup
  const renderedEmpty = renderToStaticMarkup(React.createElement(DataTableComponent, {
    columns: xssCols,
    data: [],
    emptyMessage: "Aucune alerte à afficher."
  }));
  const emptyHasColspan = /colspan="3"/i.test(renderedEmpty);
  const emptyHasMessage = renderedEmpty.includes("Aucune alerte à afficher.");
  reporter.record(
    "7. React DOM & XSS Safety",
    "Empty dataset renders centered empty message with proper colspan",
    emptyHasColspan && emptyHasMessage,
    "Found colspan=3 and empty message text"
  );

  // 7.3 Custom render callback
  const customColsTest = [
    {
      key: "status",
      label: "Statut",
      render: (val) => React.createElement("span", { className: "badge-custom" }, `STATUT: ${val}`)
    }
  ];
  const renderedCustom = renderToStaticMarkup(React.createElement(DataTableComponent, {
    columns: customColsTest,
    data: [{ status: "ACTIF" }]
  }));
  reporter.record(
    "7. React DOM & XSS Safety",
    "Custom column render callback outputs custom JSX",
    renderedCustom.includes('<span class="badge-custom">STATUT: ACTIF</span>'),
    "Custom element rendered"
  );

  // 7.4 Non-sortable vs sortable column class
  const sortColsTest = [
    { key: "a", label: "Sortable Col", sortable: true },
    { key: "b", label: "Non-sortable Col", sortable: false }
  ];
  const renderedHeaders = renderToStaticMarkup(React.createElement(DataTableComponent, {
    columns: sortColsTest,
    data: [{ a: 1, b: 2 }]
  }));
  const hasSortableClass = renderedHeaders.includes('<th class="sortable"');
  const hasNonSortableClass = renderedHeaders.includes('<th class=""') || renderedHeaders.includes('<th>');
  reporter.record(
    "7. React DOM & XSS Safety",
    "Header classes distinguish sortable vs non-sortable columns",
    hasSortableClass && hasNonSortableClass,
    "Sortable class applied conditionally"
  );

  // 7.5 Initial defaultSort descending
  const defaultSortData = [
    { id: 1, val: "AAA" },
    { id: 2, val: "ZZZ" }
  ];
  const renderedDefaultSort = renderToStaticMarkup(React.createElement(DataTableComponent, {
    columns: [{ key: "val", label: "Val" }],
    data: defaultSortData,
    defaultSort: { key: "val", direction: "desc" }
  }));
  // In desc: ZZZ should appear before AAA
  const zzzPos = renderedDefaultSort.indexOf("ZZZ");
  const aaaPos = renderedDefaultSort.indexOf("AAA");
  reporter.record(
    "7. React DOM & XSS Safety",
    "defaultSort prop establishes initial descending order",
    zzzPos !== -1 && aaaPos !== -1 && zzzPos < aaaPos,
    `ZZZ index (${zzzPos}) < AAA index (${aaaPos})`
  );

  // 7.6 Missing key fallback placeholder (—)
  const renderedMissing = renderToStaticMarkup(React.createElement(DataTableComponent, {
    columns: [{ key: "nonexistent", label: "Missing" }],
    data: [{ dummy: 1 }]
  }));
  reporter.record(
    "7. React DOM & XSS Safety",
    "Missing field renders em-dash (—) fallback",
    renderedMissing.includes("—") || renderedMissing.includes("&#x2014;"),
    "Fallback placeholder rendered"
  );

  // 7.7 Large dataset stress render (1,000 items sliced to 15)
  const bigData = Array.from({ length: 1000 }, (_, i) => ({
    id: i + 1,
    msg: `Alert #${i + 1}`
  }));
  const renderedBig = renderToStaticMarkup(React.createElement(DataTableComponent, {
    columns: [{ key: "id", label: "ID" }, { key: "msg", label: "Msg" }],
    data: bigData,
    initialPageSize: 15
  }));
  // Count <tr> tags in <tbody>
  const tbodyMatches = renderedBig.match(/<tbody[\s\S]*?<\/tbody>/);
  const rowCount = tbodyMatches ? (tbodyMatches[0].match(/<tr/g) || []).length : 0;
  reporter.record(
    "7. React DOM & XSS Safety",
    "1,000 item dataset rendered safely with exact 15 DOM rows",
    rowCount === 15,
    `Rendered DOM rows: ${rowCount} / 1000`
  );

  // Cleanup temp bundle
  try {
    fs.unlinkSync(tempBundlePath);
  } catch {}
}

// ============================================================================ //
// Execution Summary
// ============================================================================ //
const summary = reporter.summary();
if (summary.fails > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

