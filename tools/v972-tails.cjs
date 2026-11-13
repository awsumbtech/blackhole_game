// Comet tails trail the on-screen step. The angle is the one actually drawn
// (ctx.rotate + drawImage of the tail sprites), so this file runs on main
// and on the fix without any edit.
//   node tools/v972-tails.cjs [port]
// Prints one JSON object. Exit 0 when every check passed.

const fs = require("fs");
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "/tmp/pw/node_modules/playwright-core");

const PORT = process.argv[2] || "8091";
const OUT = process.argv[3] || "";
const CHROME = process.env.CHROME || "/usr/local/bin/google-chrome";
const FRAMES = 500;
const LEVELS = [
  ["Planet Nursery", 3, 3],
  ["Comet Current", 3, 2],
  ["Debris Reef", 2, 1]
];

const HOOK = () => {
  const proto = CanvasRenderingContext2D.prototype;
  const origDraw = proto.drawImage;
  const origRot = proto.rotate;
  const bag = [];
  proto.rotate = function (ang) {
    return origRot.call(this, ang);
  };
  proto.drawImage = function (img) {
    // Tail pictures are wide canvases (dust, ion, and the find tail).
    if (img && img.width >= 16 && img.height > 0 && img.width / img.height >= 2.5) {
      const m = this.getTransform();
      bag.push({ ang: Math.atan2(m.b, m.a), x: m.e, y: m.f, w: img.width, h: img.height });
    }
    return origDraw.apply(this, arguments);
  };
  window.__tailDraws = bag;
  window.__tailSeq = 0;
  window.__seed = (n) => {
    let a = n >>> 0;
    Math.random = () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
};

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
    window.__seed(1000 + galaxy * 17 + tier);
    Object.assign(bh.dev.cfg, { galaxy, biome, tier, depth: 1, zen: false, wisp: false });
    bh.dev.enter();
    s.paused = true;
    bh.camera.updateScale(window.innerWidth, window.innerHeight, true);
    const look = s.entities.find(e => e.hasTail && !e.consumed && Math.hypot(e.x - s.playerX, e.y - s.playerY) > s.radius * 6)
      || s.entities.find(e => e.hasTail && !e.consumed);
    if (look) {
      s.playerX = look.x - s.viewW * 0.22;
      s.playerY = look.y - s.viewH * 0.05;
      s.camX = s.playerX;
      s.camY = s.playerY;
    }
    s.playerVX = 0.85;
    s.playerVY = 0.28;
    const TAU = Math.PI * 2;
    const wrap = a => {
      a = (a + Math.PI) % TAU;
      if (a < 0) a += TAU;
      return a - Math.PI;
    };
    const diff = (a, b) => Math.abs(wrap(a - b));
    const dpr = (bh.display && bh.display.dpr) || window.devicePixelRatio || 1;
    const headOf = (x, y) => {
      const z = s.zoom || 1;
      return {
        x: (x - s.camX + s.viewW / 2) * z * dpr,
        y: (y - s.camY + s.viewH / 2) * z * dpr
      };
    };
    // Last wide sprite drawn at this head (the ion tail; dust is the one before it).
    // Nearest head, then the thinner ion tail rather than the dust tail beside it.
    const drawn = (x, y) => {
      const h = headOf(x, y);
      const cap = (14 * dpr) ** 2;
      let best = Infinity;
      const near = [];
      for (const d of window.__tailDraws) {
        const dd = (d.x - h.x) ** 2 + (d.y - h.y) ** 2;
        if (dd < best) best = dd;
        if (dd <= cap) near.push({ ...d, dd });
      }
      const hit = near.filter(d => d.dd <= best + (4 * dpr) ** 2);
      if (!hit.length || best > cap) return null;
      hit.sort((a, b) => b.w / b.h - a.w / a.h);
      return hit[0].ang;
    };
    const prev = new Map();
    let checked = 0, far = 0, worst = 0, drawnCount = 0, bad = null;
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
      window.__tailDraws.length = 0;
      bh.scene.draw(0, 1, false);
      const seen = new Set();
      for (const e of s.entities) {
        if (!e.hasTail || e.consumed) continue;
        if (!e._tid) e._tid = ++window.__tailSeq;
        seen.add(e._tid);
        const ang = drawn(e.x, e.y);
        const sx = e.x - s.camX, sy = e.y - s.camY;
        const p = prev.get(e._tid);
        if (p && ang != null) {
          drawnCount++;
          const dx = sx - p.sx, dy = sy - p.sy, sp = Math.hypot(dx, dy);
          const back = Math.atan2(-dy, -dx);
          let steady = p.steady;
          if (sp > 0.25) {
            const turn = p.sp > 0.25 ? diff(back, p.back) : 1;
            steady = turn < 0.22 ? steady + 1 : 0;
            if (steady >= 6 && p.ang != null) {
              const err = diff(ang, back);
              checked++;
              const dist = Math.hypot(e.x - s.playerX, e.y - s.playerY);
              if (dist > s.radius * 8) far++;
              if (err > worst) worst = err;
              if (err > 0.4 && !bad) bad = {
                f, err: +err.toFixed(3), dist: Math.round(dist), sp: +sp.toFixed(2),
                ang: +ang.toFixed(3), back: +back.toFixed(3),
                stored: e.tail ? +e.tail.ang.toFixed(3) : null, orbit: !!e.orbit
              };
            }
          } else steady = 0;
          prev.set(e._tid, { sx, sy, back, sp, steady, ang });
        } else prev.set(e._tid, { sx, sy, back: 0, sp: 0, steady: 0, ang });
      }
      for (const id of prev.keys()) if (!seen.has(id)) prev.delete(id);
    }
    return {
      biome: s.biome && s.biome.name, tier: s.tier,
      checked, far, drawn: drawnCount, worst: +worst.toFixed(3), bad,
      ok: checked >= 40 && far >= 10 && !bad
    };
  }, { biome, tier, galaxy, frames: FRAMES });
}

async function finds(page) {
  return page.evaluate(() => {
    const bh = window.__bh;
    const s = bh.state;
    s.paused = true;
    window.__seed(202);
    Object.assign(bh.dev.cfg, { galaxy: 2, biome: "Comet Current", tier: 3, depth: 1, zen: false, wisp: false });
    bh.dev.enter();
    s.paused = true;
    bh.camera.updateScale(window.innerWidth, window.innerHeight, true);
    const make = (id, name, ox, oy) => ({
      def: { id, name, rgb: "255, 214, 130", kind: "comet" },
      at: 0.4, planted: true, found: false, cue: 0, age: 200,
      x: s.playerX + ox, y: s.playerY + oy
    });
    const gold = make("goldcomet", "Golden Comet", 420, -180);
    const twin = make("twincomets", "Twin Comets", -380, 220);
    s.finds = [gold, twin];
    const TAU = Math.PI * 2;
    const wrap = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
    const diff = (a, b) => Math.abs(wrap(a - b));
    const dpr = (bh.display && bh.display.dpr) || window.devicePixelRatio || 1;
    const measure = (f) => {
      const z = s.zoom || 1;
      const hx = (f.x - s.camX + s.viewW / 2) * z * dpr;
      const hy = (f.y - s.camY + s.viewH / 2) * z * dpr;
      const cap = (14 * dpr) ** 2;
      let best = Infinity;
      const near = [];
      for (const d of window.__tailDraws) {
        const dd = (d.x - hx) ** 2 + (d.y - hy) ** 2;
        if (dd < best) best = dd;
        if (dd <= cap) near.push({ ...d, dd });
      }
      const hit = near.filter(d => d.dd <= best + (4 * dpr) ** 2);
      if (!hit.length || best > cap) return null;
      hit.sort((a, b) => b.w / b.h - a.w / a.h);
      return hit[0].ang;
    };
    s.playerVX = 1.1;
    s.playerVY = -0.35;
    const prev = { gold: null, twin: null };
    const stat = {
      gold: { checked: 0, worst: 0, bad: null, misses: 0 },
      twin: { checked: 0, worst: 0, bad: null, misses: 0 }
    };
    for (let i = 0; i < 36; i++) {
      s.playerX += s.playerVX;
      s.playerY += s.playerVY;
      s.camX = s.playerX;
      s.camY = s.playerY;
      window.__tailDraws.length = 0;
      bh.scene.draw(0, 1, false);
      for (const key of ["gold", "twin"]) {
        const f = key === "gold" ? gold : twin;
        const ang = measure(f);
        const sx = f.x - s.camX, sy = f.y - s.camY;
        const p = prev[key];
        if (ang == null) stat[key].misses++;
        if (p && ang != null && i > 8) {
          const back = Math.atan2(-(sy - p.sy), -(sx - p.sx));
          const err = diff(ang, back);
          stat[key].checked++;
          if (err > stat[key].worst) stat[key].worst = err;
          if (err > 0.45 && !stat[key].bad) stat[key].bad = { i, err: +err.toFixed(3) };
        }
        prev[key] = { sx, sy };
      }
    }
    for (const k of ["gold", "twin"]) {
      stat[k].worst = +stat[k].worst.toFixed(3);
      stat[k].ok = stat[k].checked >= 20 && !stat[k].bad;
    }
    return stat;
  });
}

async function zoomStill(page) {
  return page.evaluate(() => {
    const bh = window.__bh;
    const s = bh.state;
    s.paused = true;
    window.__seed(303);
    Object.assign(bh.dev.cfg, { galaxy: 3, biome: "Planet Nursery", tier: 3, depth: 1, zen: false, wisp: false });
    bh.dev.enter();
    s.paused = true;
    bh.camera.updateScale(window.innerWidth, window.innerHeight, true);
    const look = s.entities.find(e => e.hasTail && !e.consumed);
    if (look) {
      s.playerX = look.x - s.viewW * 0.2;
      s.playerY = look.y;
      s.camX = s.playerX;
      s.camY = s.playerY;
    }
    s.playerVX = 0.4;
    s.playerVY = 0.1;
    const TAU = Math.PI * 2;
    const wrap = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
    const diff = (a, b) => Math.abs(wrap(a - b));
    const dpr = (bh.display && bh.display.dpr) || window.devicePixelRatio || 1;
    const angOf = (e) => {
      const z = s.zoom || 1;
      const hx = (e.x - s.camX + s.viewW / 2) * z * dpr;
      const hy = (e.y - s.camY + s.viewH / 2) * z * dpr;
      const cap = (14 * dpr) ** 2;
      let best = Infinity;
      const near = [];
      for (const d of window.__tailDraws) {
        const dd = (d.x - hx) ** 2 + (d.y - hy) ** 2;
        if (dd < best) best = dd;
        if (dd <= cap) near.push({ ...d, dd });
      }
      const hit = near.filter(d => d.dd <= best + (4 * dpr) ** 2);
      if (!hit.length || best > cap) return null;
      hit.sort((a, b) => b.w / b.h - a.w / a.h);
      return hit[0].ang;
    };
    for (const e of s.entities) if (e.hasTail) e._spawnAlpha = 1;
    // Freeze the world. Zoom, and turn the player's heading, without moving anyone.
    const before = new Map();
    window.__tailDraws.length = 0;
    bh.scene.draw(0, 1, false);
    for (const e of s.entities) {
      if (!e.hasTail || e.consumed) continue;
      const a = angOf(e);
      if (a != null) before.set(e, { a, far: Math.hypot(e.x - s.playerX, e.y - s.playerY) > s.radius * 8 });
    }
    const z0 = s.zoom;
    s.zoom = z0 * 1.85;
    const vx = s.playerVX, vy = s.playerVY;
    s.playerVX = -vy;
    s.playerVY = vx;
    window.__tailDraws.length = 0;
    bh.scene.draw(0, 1, false);
    let compared = 0, far = 0, worst = 0, bad = null;
    for (const [e, rec] of before) {
      const a1 = angOf(e);
      if (a1 == null) continue;
      const err = diff(a1, rec.a);
      compared++;
      if (rec.far) far++;
      if (err > worst) worst = err;
      if (err > 0.08 && !bad) bad = { err: +err.toFixed(3), far: rec.far };
    }
    s.zoom = z0;
    s.playerVX = vx;
    s.playerVY = vy;
    return { compared, far, worst: +worst.toFixed(3), bad, ok: compared >= 1 && !bad };
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
  page.on("pageerror", e => errs.push(String(e).slice(0, 300)));
  await boot(page);
  await page.evaluate(HOOK);
  const result = { ok: true, levels: [], errs };
  for (const [biome, tier, galaxy] of LEVELS) {
    const row = await level(page, biome, tier, galaxy);
    result.levels.push(row);
    if (!row.ok) result.ok = false;
  }
  result.finds = await finds(page);
  if (!result.finds.gold.ok || !result.finds.twin.ok) result.ok = false;
  result.zoom = await zoomStill(page);
  if (!result.zoom.ok) result.ok = false;
  const text = JSON.stringify(result, null, 2);
  console.log(text);
  if (OUT) fs.writeFileSync(OUT, text + "\n");
  await browser.close();
  process.exit(result.ok && errs.length === 0 ? 0 : 1);
}

main();
