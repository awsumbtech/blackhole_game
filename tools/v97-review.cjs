// v9.7 review checks. One command:
//   node tools/v97-review.cjs [port]
// Writes qa/v9.7/review-tests.json. Default port is 8091.
// Needs playwright-core under /tmp/pw (or PLAYWRIGHT_CORE) and Chrome.
//
// When assets/sky/golden_veil.jpg is replaced, re-shoot plain vs golden from the
// same frozen frame (Armada and Nursery, 390x844) and print the RGB delta:
//   node tools/v97-review.cjs --golden

const fs = require("fs");
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "/tmp/pw/node_modules/playwright-core");

const ARGS = process.argv.slice(2).filter(a => a !== "--golden");
const GOLDEN = process.argv.includes("--golden");
const PORT = ARGS[0] || "8091";
const OUT_DIR = path.join(__dirname, "..", "qa", "v9.7");
const OUT = path.join(OUT_DIR, "review-tests.json");
const CHROME = process.env.CHROME || "/usr/local/bin/google-chrome";

// Five simulated minutes, sampled as real draws. dt is in 60Hz frames.
const MINUTES = 5;
const SAMPLES = 8;
const STEP = Math.round((MINUTES * 60 * 60) / SAMPLES);

function tiltOf(m) {
  return Math.atan2(m.b, m.a);
}

async function boot(page) {
  await page.goto(`http://127.0.0.1:${PORT}/?dev&debug`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => window.__bh && window.__bh.feeding && window.__bh.debris, { timeout: 20000 });
  const skip = page.locator("#btn-skip-intro");
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.evaluate(() => {
    const s = document.getElementById("splash");
    if (s) s.style.display = "none";
  });
}

async function enter(page, cfg) {
  await page.evaluate(c => {
    Object.assign(window.__bh.dev.cfg, { galaxy: 3, biome: "Comet Current", tier: 3, depth: 1, zen: false, wisp: false }, c);
    window.__bh.dev.enter();
  }, cfg);
  if (cfg.zen) {
    await page.waitForFunction(() => {
      const s = window.__bh.state;
      return s.screen === "play" && s.mode === "zen" && !s.drift;
    }, { timeout: 15000 });
  } else {
    await page.waitForFunction(() => window.__bh.state.screen === "play", { timeout: 15000 });
  }
  await page.waitForTimeout(300);
}

/** One Feeding.update bite: exactly 4 pieces, each life inside DebrisField's range, then gone. */
async function bite(page) {
  await enter(page, { biome: "Planet Nursery", tier: 5, galaxy: 5, zen: false });
  await page.waitForFunction(() => window.__bh.debris.masksReady);
  return page.evaluate(() => {
    const bh = window.__bh;
    const s = bh.state;
    const field = bh.debris;
    field.clear();
    const eds = s.entities.filter(ent => !ent.powerup && !ent.consumed && s.radius > ent.radius * s.eatRatio && ent.radius > s.radius * 0.45);
    eds.sort((a, b) => b.radius - a.radius);
    const e = eds[0];
    if (!e) return { ok: false, why: "no large edible" };
    const mass0 = s.mass;
    const n0 = s.entities.length;
    const reach = s.radius + e.radius * (0.4 + (s.mods.reachBonus || 0));
    e.x = s.playerX + reach * 0.99;
    e.y = s.playerY;
    e.vx = 0;
    e.vy = 0;
    const proto = CanvasRenderingContext2D.prototype;
    const orig = proto.drawImage;
    const origDraw = field.draw;
    let inside = false;
    let hits = 0;
    field.draw = function () {
      inside = true;
      try { return origDraw.apply(field, arguments); }
      finally { inside = false; }
    };
    proto.drawImage = function () {
      if (inside) hits++;
      return orig.apply(this, arguments);
    };
    let drawHits = 0;
    try {
      bh.feeding.update(1);
      const gone = !s.entities.includes(e);
      const live = field.pieces.filter(p => p.on);
      const lives = live.map(p => p.life);
      const fromSprite = live.every(p => p.spr && p.spr.width > 0);
      const maxLife = lives.length ? Math.max(...lives) : 0;
      const now = performance.now();
      s.paused = true;
      s.camX = s.playerX;
      s.camY = s.playerY;
      const canvas = document.getElementById("game");
      const ctx = canvas.getContext("2d");
      const dpr = window.devicePixelRatio || 1;
      const shadowR = bh.shadowRadius(s.radius, s.gulp, !!(s.settings && s.settings.reduceMotion));
      const cx = (s.viewW / 2) * s.zoom * dpr;
      const cy = (s.viewH / 2) * s.zoom * dpr;
      const discR = 0.95 * shadowR * s.zoom * dpr;
      const sample = () => {
        const x0 = Math.max(0, Math.floor(cx - discR));
        const y0 = Math.max(0, Math.floor(cy - discR));
        const x1 = Math.min(canvas.width - 1, Math.ceil(cx + discR));
        const y1 = Math.min(canvas.height - 1, Math.ceil(cy + discR));
        const img = ctx.getImageData(x0, y0, Math.max(1, x1 - x0 + 1), Math.max(1, y1 - y0 + 1));
        const pix = [];
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const dx = x - cx, dy = y - cy;
            if (dx * dx + dy * dy > discR * discR) continue;
            const i = ((y - y0) * img.width + (x - x0)) * 4;
            pix.push(img.data[i], img.data[i + 1], img.data[i + 2]);
          }
        }
        return pix;
      };
      let coreBad = 0;
      let frames = 0;
      let baseCount = 0;
      const born = live.slice();
      const bright = born.map(() => 0);
      const plainDraw = field.draw;
      field.draw = function (ctx2, hx, hy, side) {
        const before = sample();
        inside = true;
        let result;
        try { result = plainDraw.call(field, ctx2, hx, hy, side); }
        finally { inside = false; }
        const after = sample();
        if (side === 1) {
          frames++;
          baseCount = before.length / 3;
          for (let i = 0; i < born.length; i++) if (born[i].visAlpha > 0.3) bright[i]++;
        }
        const n = Math.min(before.length, after.length);
        for (let i = 0; i < n; i++) if (before[i] !== after[i]) coreBad++;
        return result;
      };
      for (let age = 0; age <= maxLife; age++) {
        bh.scene.draw(now, 0, true);
        if (age < maxLife) field.update(1, false);
      }
      // 18 frames at dt=1 is 300 ms at 60 Hz. At least 3 of the 4 shards.
      const brightOk = bright.filter(n => n >= 18).length >= 3;
      field.draw = plainDraw;
      drawHits = hits;
      const massGained = s.mass - mass0;
      const lifeOk = lives.length === 4 && lives.every(n => n >= field.lifeMin && n <= field.lifeMax);
      s.paused = false;
      return {
        ok: massGained > 0 && gone && lifeOk && fromSprite && field.live === 0 && drawHits > 0 && coreBad === 0 && baseCount > 20 && brightOk,
        massGained,
        gone,
        pieces: live.length,
        lives,
        lifeMin: field.lifeMin,
        lifeMax: field.lifeMax,
        fromSprite,
        drawHits,
        coreBad,
        coreSamples: baseCount,
        frames,
        bright,
        brightOk,
        liveAfter: field.live,
        removed: n0 - s.entities.length
      };
    } finally {
      proto.drawImage = orig;
      field.draw = origDraw;
    }
  });
}

/**
 * Real Zen play for several seconds. Entities are kept out of reach.
 * drawImage calls made inside DebrisField.draw are counted, so a draw that
 * forgets its own counter still fails this check. A bite afterwards must draw.
 */
async function idle(page) {
  await enter(page, { biome: "Planet Nursery", tier: 3, galaxy: 3, zen: true });
  await page.waitForFunction(() => window.__bh.debris.masksReady);
  return page.evaluate(() => new Promise(resolve => {
    const bh = window.__bh;
    const s = bh.state;
    const field = bh.debris;
    const proto = CanvasRenderingContext2D.prototype;
    const orig = proto.drawImage;
    const origDraw = field.draw;
    let inside = false;
    let idleHits = 0;
    field.draw = function () {
      inside = true;
      try { return origDraw.apply(field, arguments); }
      finally { inside = false; }
    };
    proto.drawImage = function () {
      if (inside) idleHits++;
      return orig.apply(this, arguments);
    };
    field.clear();
    s.paused = false;
    s.playerVX = 0;
    s.playerVY = 0;
    const park = () => {
      const R = s.radius;
      s.playerVX = 0;
      s.playerVY = 0;
      for (const e of s.entities) {
        e.radius = Math.max(e.radius, R * 4);
        e.x = s.playerX + R * 30;
        e.y = s.playerY;
        e.vx = 0;
        e.vy = 0;
      }
    };
    park();
    const t0 = performance.now();
    const step = () => {
      park();
      if (performance.now() - t0 < 5000) requestAnimationFrame(step);
      else finish();
    };
    const finish = () => {
      const idle = { hits: idleHits, live: field.live, ms: Math.round(performance.now() - t0) };
      idleHits = 0;
      const e = s.entities[0];
      let biteHits = 0;
      if (e) {
        e.radius = s.radius * 0.9;
        e.consumed = false;
        const reach = s.radius + e.radius * (0.4 + (s.mods.reachBonus || 0));
        e.x = s.playerX + reach * 0.99;
        e.y = s.playerY;
        e.vx = 0;
        e.vy = 0;
        if (!s.entities.includes(e)) s.entities.push(e);
        bh.feeding.update(1);
        const now = performance.now();
        s.paused = true;
        for (let i = 0; i < 6; i++) {
          field.update(2, false);
          bh.scene.draw(now, 0, true);
        }
        biteHits = idleHits;
        s.paused = false;
      }
      proto.drawImage = orig;
      field.draw = origDraw;
      resolve({
        ok: idle.hits === 0 && idle.live === 0 && biteHits > 0,
        idle,
        biteHits
      });
    };
    requestAnimationFrame(step);
  }));
}

const SHOT_DIR = process.env.V97_SHOT_DIR || path.join(OUT_DIR, "after");

/**
 * Plain and golden from one frozen draw. Same seed, same camera, same timestamp.
 * Before either shot, slice-painted sprites in view (the Flagship) must be
 * finished and past their 1.2 s fade. The fade reads performance.now(), so
 * freezing the scene clock does not hold it.
 * Deltas are canvas-only getImageData. The centre box is the middle 30–70%.
 */
async function goldenShots(page) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const pairs = [
    ["Ruined Armada", 5, 4, "phone-armada-plain.png", "phone-armada-golden.png"],
    ["Planet Nursery", 4, 3, "phone-nursery-plain.png", "phone-nursery-golden.png"]
  ];
  await page.waitForFunction(() => window.__bh.golden && window.__bh.golden.ok, { timeout: 15000 });
  const report = [];
  for (const [biome, tier, galaxy, plainName, goldName] of pairs) {
    await enter(page, { biome, tier, galaxy, zen: false });
    await page.evaluate(() => {
      const s = window.__bh.state;
      const w = window.__bh.worlds();
      const lm = w && w.landmarks && w.landmarks[0];
      if (lm) {
        const off = Math.max(s.viewW * 0.28, 60);
        s.playerX = lm.x + off;
        s.playerY = lm.y;
        s.camX = s.playerX;
        s.camY = s.playerY;
      }
      s.paused = false;
      const toast = document.getElementById("hint-toast");
      if (toast) toast.classList.add("hidden");
    });
    await page.waitForFunction(() => {
      const r = window.__bh.slicePaintReady();
      return r && r.ready;
    }, { timeout: 20000 });
    const delta = await page.evaluate(() => {
      const bh = window.__bh;
      const s = bh.state;
      const prev = { paused: s.paused, reduce: s.settings.reduceMotion, golden: s.golden };
      const w = bh.worlds();
      const lm = w && w.landmarks && w.landmarks[0];
      if (lm) {
        const off = Math.max(s.viewW * 0.28, 60);
        s.playerX = lm.x + off;
        s.playerY = lm.y;
        s.camX = s.playerX;
        s.camY = s.playerY;
      }
      s.paused = true;
      s.settings.reduceMotion = true;
      const toast = document.getElementById("hint-toast");
      if (toast) toast.classList.add("hidden");
      const canvas = document.getElementById("game");
      const ctx = canvas.getContext("2d");
      const now = performance.now();
      s.golden = false;
      bh.scene.draw(now, 0, true);
      const plain = ctx.getImageData(0, 0, canvas.width, canvas.height);
      s.golden = true;
      bh.scene.draw(now, 0, true);
      const gold = ctx.getImageData(0, 0, canvas.width, canvas.height);
      s.paused = prev.paused;
      s.settings.reduceMotion = prev.reduce;
      s.golden = prev.golden;
      const wdt = plain.width, h = plain.height;
      let n = 0, dr = 0, dg = 0, db = 0, over = 0;
      let cn = 0, cdr = 0, cdg = 0, cdb = 0, cover = 0;
      const x0 = Math.floor(wdt * 0.3), x1 = Math.floor(wdt * 0.7);
      const y0 = Math.floor(h * 0.3), y1 = Math.floor(h * 0.7);
      const A = plain.data, B = gold.data;
      for (let y = 0; y < h; y++) {
        const midY = y >= y0 && y < y1;
        for (let x = 0; x < wdt; x++) {
          const i = (y * wdt + x) * 4;
          const r = B[i] - A[i], g = B[i + 1] - A[i + 1], bl = B[i + 2] - A[i + 2];
          dr += r; dg += g; db += bl; n++;
          if (Math.max(Math.abs(r), Math.abs(g), Math.abs(bl)) > 8) over++;
          if (midY && x >= x0 && x < x1) {
            cdr += r; cdg += g; cdb += bl; cn++;
            if (Math.max(Math.abs(r), Math.abs(g), Math.abs(bl)) > 8) cover++;
          }
        }
      }
      const mean = (sum, count) => +(sum / count).toFixed(2);
      // Leave the golden frame on the canvas for the second screenshot. The plain
      // pixels are copied below via a second draw once the page shot is taken.
      s.paused = true;
      s.golden = true;
      bh.scene.draw(now, 0, true);
      window.__pair = { now, prev };
      return {
        meanRGB: [mean(dr, n), mean(dg, n), mean(db, n)],
        pctOver8: +((over / n) * 100).toFixed(2),
        centerMeanRGB: [mean(cdr, cn), mean(cdg, cn), mean(cdb, cn)],
        centerPctOver8: +((cover / cn) * 100).toFixed(2),
        pixels: n,
        source: "canvas getImageData",
        centerBox: "30-70%"
      };
    });
    await page.screenshot({ path: path.join(SHOT_DIR, goldName) });
    await page.evaluate(() => {
      const s = window.__bh.state;
      s.golden = false;
      window.__bh.scene.draw(window.__pair.now, 0, true);
    });
    await page.screenshot({ path: path.join(SHOT_DIR, plainName) });
    await page.evaluate(() => {
      const s = window.__bh.state;
      const prev = window.__pair.prev;
      s.paused = prev.paused;
      s.settings.reduceMotion = prev.reduce;
      s.golden = prev.golden;
    });
    report.push({ biome, plain: plainName, golden: goldName, ...delta });
  }
  return report;
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
  page.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0, 240)); });
  await boot(page);

  const result = { ok: true, notes: [], errs, command: "node tools/v97-review.cjs" };
  if (GOLDEN) {
    result.golden = await goldenShots(page);
    console.log(JSON.stringify(result.golden, null, 2));
  }
  result.bite = await bite(page);
  if (!result.bite.ok) { result.ok = false; result.notes.push("bite failed"); }
  result.idle = await idle(page);
  if (!result.idle.ok) { result.ok = false; result.notes.push("idle debris failed"); }
  if (errs.length) { result.ok = false; result.notes.push("console errors"); }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  if (!result.ok) process.exit(1);
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { bite, idle };
