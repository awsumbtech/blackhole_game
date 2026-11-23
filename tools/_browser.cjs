// Shared Playwright and Chrome lookup so tests run locally and in CI.
const fs = require("fs");
const path = require("path");

function playwrightCore() {
  if (process.env.PLAYWRIGHT_CORE) return require(process.env.PLAYWRIGHT_CORE);
  const candidates = [
    "playwright-core",
    path.join(__dirname, "..", "node_modules", "playwright-core"),
    "/tmp/pw/node_modules/playwright-core"
  ];
  for (const c of candidates) {
    try { return require(c); } catch { /* try the next */ }
  }
  throw new Error("playwright-core not found; set PLAYWRIGHT_CORE");
}

function chromePath(chromium) {
  const env = process.env.CHROME_PATH || process.env.CHROME;
  if (env && fs.existsSync(env)) return env;
  const defaults = [
    "/usr/bin/google-chrome",
    "/usr/local/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium"
  ];
  for (const p of defaults) if (fs.existsSync(p)) return p;
  try {
    const p = chromium && chromium.executablePath && chromium.executablePath();
    if (p && fs.existsSync(p)) return p;
  } catch { /* fall through */ }
  return env || "/usr/bin/google-chrome";
}

module.exports = { playwrightCore, chromePath };
