// Browser — resolve Playwright and a Chrome binary for the game's tests.
//
// One job: hand a tools/*.cjs test the playwright-core module and the
// path to a Chrome/Chromium executable, whether it is running on this
// box or in GitHub Actions. It does not launch a browser or serve the
// game; each test does that itself.
//
// Environment:
//   PLAYWRIGHT_CORE     module path for playwright-core
//   CHROME_PATH / CHROME   explicit browser binary (CHROME_PATH wins)

const fs = require("fs");
const path = require("path");

class Browser {
  static playwrightCore() {
    if (process.env.PLAYWRIGHT_CORE) return require(process.env.PLAYWRIGHT_CORE);
    const candidates = [
      "playwright-core",
      path.join(__dirname, "..", "..", "node_modules", "playwright-core"),
      "/tmp/pw/node_modules/playwright-core"
    ];
    for (const c of candidates) {
      try { return require(c); } catch { /* try the next */ }
    }
    throw new Error("playwright-core not found; set PLAYWRIGHT_CORE");
  }

  static chromePath(chromium) {
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
}

module.exports = { Browser };
