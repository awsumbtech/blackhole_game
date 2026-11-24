// The live release number. Game, service worker, and DESIGN.md must name the
// same version, and that version must be at least the feature this test covers.
// A later bump does not fail the test.

const fs = require("fs");

function parts(text) {
  const m = String(text || "").match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function cmp(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/**
 * `min` is the feature's own version, such as "9.11.0".
 * Returns whether js/game.js, sw.js, and the current DESIGN.md header agree,
 * and whether that version is greater than or equal to `min`.
 */
function releaseAgrees(min) {
  const game = fs.readFileSync("js/game.js", "utf8");
  const sw = fs.readFileSync("sw.js", "utf8");
  const design = fs.readFileSync("DESIGN.md", "utf8");
  const version = (game.match(/const VERSION = "([^"]+)"/) || [])[1] || "";
  const cache = (sw.match(/const CACHE_NAME = "(blackhole-v[^"]+)"/) || [])[1] || "";
  const header = design.slice(0, design.indexOf("## 1.") > 0 ? design.indexOf("## 1.") : 800);
  const designVer = (header.match(/Current version:\s+\*\*v([0-9.]+)\*\*/) || [])[1] || "";
  const designCache = (header.match(/CACHE_NAME = "(blackhole-v[^"]+)"/) || [])[1] || "";
  const live = parts(version);
  const floor = parts(min);
  const atLeast = !!(live && floor && cmp(live, floor) >= 0);
  const agree = version.length > 0
    && cache === "blackhole-v" + version
    && designVer === version
    && designCache === cache;
  return {
    ok: agree && atLeast,
    version,
    cache,
    designVer,
    designCache,
    min,
    atLeast,
    agree
  };
}

module.exports = { releaseAgrees };
