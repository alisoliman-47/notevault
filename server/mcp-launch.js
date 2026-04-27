#!/usr/bin/env node
/**
 * Claude Desktop / MCP hosts spawn this file instead of dist/mcp-stdio.js directly.
 * If server source changed since the last build, runs `npm run build` once, then execs the MCP server.
 * Fixes "read-only / new code not applied" when dist/ was stale.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname);
const DIST_MCP = path.join(SERVER_ROOT, "dist", "mcp-stdio.js");
const SRC_ROOT = path.join(SERVER_ROOT, "src");

function newestTsMtimeMs(dir) {
  let max = 0;
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile() && p.endsWith(".ts")) max = Math.max(max, fs.statSync(p).mtimeMs);
    }
  };
  walk(dir);
  return max;
}

function needsBuild() {
  if (!fs.existsSync(DIST_MCP)) return true;
  const distMtime = fs.statSync(DIST_MCP).mtimeMs;
  return newestTsMtimeMs(SRC_ROOT) > distMtime;
}

function runBuild() {
  const bin = path.join(SERVER_ROOT, "node_modules", ".bin");
  const pathPrefix = `/opt/homebrew/bin:/usr/local/bin:${bin}`;
  const env = {
    ...process.env,
    PATH: `${pathPrefix}${path.delimiter}${process.env.PATH ?? ""}`,
  };
  const r = spawnSync("npm", ["run", "build"], {
    cwd: SERVER_ROOT,
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    console.error("[notevault-mcp-launch] npm run build failed with exit", r.status);
    process.exit(r.status ?? 1);
  }
  if (!fs.existsSync(DIST_MCP)) {
    console.error("[notevault-mcp-launch] build finished but dist/mcp-stdio.js is missing.");
    process.exit(1);
  }
}

if (needsBuild()) {
  console.error("[notevault-mcp-launch] Rebuilding server (src newer than dist/mcp-stdio.js)…");
  runBuild();
}

const r = spawnSync(process.execPath, [DIST_MCP], {
  stdio: "inherit",
  env: process.env,
});
process.exit(r.status ?? 1);
