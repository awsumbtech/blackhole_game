// Comet tails trail the on-screen step, anywhere in the field, not only near the hole.
//   node tools/v972-tails.cjs [port]
// A comet whose tail still follows vx/vy (or a clock) fails while the view drifts.

const { chromium } = require(process.env.PLAYWRIGHT_CORE || "/tmp/pw/node_modules/playwright-core");

const PORT = process.argv[2] || "8091";
const CHROME = process.env.CHROME || "/usr/local/bin/google-chrome";
const FRAMES = 500;
const LEVELS = [
  ["Planet Nursery", 3, 3],
  ["Comet Current", 3, 2],
  ["Debris Reef", 2, 1]
];

async function boot(page) {
  await page.goto(`http://127.0.0.1:${PORT}/?dev&debug`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => window.__bh && window.__bh.feeding && window.__bh.scene, { timeout: 20000 });
  const skip = page.locator("#btn-skip-intro");
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

async function level(page, biome, tier, galaxy) {
  return page.evaluate(async ({ biome, tier, galaxy, frames }) => {
    const worlds = await import("/js/worlds.js");
    const entities = await import("/js/entities.js");
    const living = await import("/js/living-world.js");
    const discoveries = await import("/js/discoveries.js");
    const bh = window.__bh;
    const s = bh.state;
    s.paused = true;
    Object.assign(bh.dev.cfg, { galaxy, biome, tier, depth: 1, zen: false, wisp: false });
    bh.dev.enter();
    s.paused = true;
    bh.camera.updateScale(window.innerWidth, window.innerHeight, true);
    s.playerVX = 0.85;
    s.playerVY = 0.28;
    const TAU = Math.PI * 2;
    const wrap = a => {
      a = (a + Math.PI) % TAU;
      if (a < 0) a += TAU;
      return a - Math.PI;
    };
    const diff = (a, b) => Math.abs(wrap(a - b));
    const prev = new Map();
    let checked = 0, far = 0, worst = 0, bad = null;
    for (let f = 0; f < frames; f++) {
      s.playerX += s.playerVX;
      s.playerY += s.playerVY;
      s.camX = s.playerX;
      s.camY = s.playerY;
      living.updateLivingWorld(s, 1, 1);
      worlds.updateWorlds(s, 1, 1);
      entities.updateEntities(s.entities, s.bounds, 1);
      bh.feeding.update(1);
      discoveries.updateDiscoveries(s, 1, () => {});
      bh.scene.draw(0, 0, false);
      const z = s.zoom || 1;
      const seen = new Set();
      for (const e of s.entities) {
        if (!e.hasTail || e.consumed || !e.tail) continue;
        if (!e._tid) e._tid = "c" + f + ":" + (e.x | 0);
        seen.add(e._tid);
        const sx = (e.x - s.camX) * z, sy = (e.y - s.camY) * z;
        const p = prev.get(e._tid);
        if (p) {
          const dx = sx - p.sx, dy = sy - p.sy, sp = Math.hypot(dx, dy);
          const back = Math.atan2(-dy, -dx);
          let steady = p.steady;
          if (sp > 0.25) {
            const turn = p.sp > 0.25 ? diff(back, p.back) : 1;
            steady = turn < 0.22 ? steady + 1 : 0;
            if (steady >= 6) {
              const err = diff(e.tail.ang, back);
              checked++;
              const dist = Math.hypot(e.x - s.playerX, e.y - s.playerY);
              if (dist > s.radius * 8) far++;
              if (err > worst) worst = err;
              if (err > 0.4 && !bad) bad = { f, err: +err.toFixed(3), dist: Math.round(dist), sp: +sp.toFixed(2) };
            }
          } else steady = 0;
          prev.set(e._tid, { sx, sy, back, sp, steady });
        } else prev.set(e._tid, { sx, sy, back: 0, sp: 0, steady: 0 });
      }
      for (const id of prev.keys()) if (!seen.has(id)) prev.delete(id);
    }
    return {
      biome: s.biome && s.biome.name, tier: s.tier,
      checked, far, worst: +worst.toFixed(3), bad,
      ok: checked >= 40 && far >= 10 && !bad
    };
  }, { biome, tier, galaxy, frames: FRAMES });
}

async function golden(page) {
  return page.evaluate(() => {
    const bh = window.__bh;
    const s = bh.state;
    s.paused = true;
    Object.assign(bh.dev.cfg, { galaxy: 2, biome: "Comet Current", tier: 3, depth: 1, zen: false, wisp: false });
    bh.dev.enter();
    s.paused = true;
    bh.camera.updateScale(window.innerWidth, window.innerHeight, true);
    const f = {
      def: { id: "goldcomet", name: "Golden Comet", rgb: "255, 214, 130", kind: "comet" },
      at: 0.4, planted: true, found: false, cue: 0, age: 200,
      x: s.playerX + 500, y: s.playerY - 200
    };
    s.finds = [f];
    const TAU = Math.PI * 2;
    const wrap = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
    const diff = (a, b) => Math.abs(wrap(a - b));
    let px = 0, py = 0, have = false, worst = 0, checked = 0, bad = null;
    s.playerVX = 1.1; s.playerVY = -0.4;
    for (let i = 0; i < 40; i++) {
      s.playerX += s.playerVX; s.playerY += s.playerVY;
      s.camX = s.playerX; s.camY = s.playerY;
      const z = s.zoom || 1;
      bh.scene.draw(0, 0, false);
      const sx = (f.x - s.camX) * z, sy = (f.y - s.camY) * z;
      if (have && f.tail) {
        const dx = sx - px, dy = sy - py;
        const back = Math.atan2(-dy, -dx);
        const err = diff(f.tail.ang, back);
        if (i > 8) {
          checked++;
          if (err > worst) worst = err;
          if (err > 0.45 && !bad) bad = { i, err: +err.toFixed(3) };
        }
      }
      px = sx; py = sy; have = true;
    }
    return { checked, worst: +worst.toFixed(3), bad, hasTail: !!(f.tail), ok: checked >= 20 && !bad && !!f.tail };
  });
}

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  const page = await (await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  })).newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
  await boot(page);
  const result = { ok: true, levels: [], errs };
  for (const [biome, tier, galaxy] of LEVELS) {
    const row = await level(page, biome, tier, galaxy);
    result.levels.push(row);
    if (!row.ok) result.ok = false;
  }
  result.golden = await golden(page);
  if (!result.golden.ok) result.ok = false;
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  process.exit(result.ok && errs.length === 0 ? 0 : 1);
}

main();
