#!/usr/bin/env node
/**
 * Empirical stress test for Frontend Build Determinism and Reproducibility.
 * Executed by challenger_m2_2.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const frontendDir = path.join(projectRoot, "frontend");
const distDir = path.join(frontendDir, "dist");

console.log("\n" + "=".repeat(80));
console.log("Stress Testing Frontend Build Determinism (3 consecutive builds)");
console.log("=".repeat(80));

const builds = [];

for (let i = 1; i <= 3; i++) {
  console.log(`\n--- Build Iteration ${i} / 3 ---`);
  const startT = performance.now();

  try {
    const stdout = execSync("npm run build", {
      cwd: frontendDir,
      stdio: "pipe",
      encoding: "utf8"
    });
    const duration = ((performance.now() - startT) / 1000).toFixed(2);

    // Verify dist files
    const indexHtml = path.join(distDir, "index.html");
    const assetsDir = path.join(distDir, "assets");
    const assetFiles = fs.readdirSync(assetsDir);

    const jsFiles = assetFiles.filter(f => f.endsWith(".js"));
    const cssFiles = assetFiles.filter(f => f.endsWith(".css"));

    const jsSize = fs.statSync(path.join(assetsDir, jsFiles[0])).size;
    const cssSize = fs.statSync(path.join(assetsDir, cssFiles[0])).size;
    const htmlSize = fs.statSync(indexHtml).size;

    console.log(`Build ${i} succeeded in ${duration}s.`);
    console.log(`  HTML size: ${htmlSize} bytes`);
    console.log(`  JS bundle: ${jsFiles[0]} (${jsSize} bytes)`);
    console.log(`  CSS bundle: ${cssFiles[0]} (${cssSize} bytes)`);

    builds.push({
      iteration: i,
      duration,
      htmlSize,
      jsSize,
      cssSize,
      jsFile: jsFiles[0],
      cssFile: cssFiles[0],
      success: true
    });
  } catch (err) {
    console.error(`Build ${i} FAILED:`, err.message);
    builds.push({ iteration: i, success: false, error: err.message });
  }
}

console.log("\n" + "=".repeat(80));
console.log("Build Determinism Evaluation:");
console.log("=".repeat(80));

let allSuccessful = builds.every(b => b.success);
let sizeDeterministic = false;

if (allSuccessful) {
  const first = builds[0];
  sizeDeterministic = builds.every(
    b => b.htmlSize === first.htmlSize && b.jsSize === first.jsSize && b.cssSize === first.cssSize
  );

  console.log(`[${allSuccessful ? "PASS" : "FAIL"}] All 3 consecutive builds succeeded with exit code 0`);
  console.log(`[${sizeDeterministic ? "PASS" : "FAIL"}] Asset sizes are 100% deterministic across all iterations`);
  console.log(`  Expected HTML: ${first.htmlSize} B | JS: ${first.jsSize} B | CSS: ${first.cssSize} B`);
}

if (!allSuccessful || !sizeDeterministic) {
  process.exit(1);
}
process.exit(0);
