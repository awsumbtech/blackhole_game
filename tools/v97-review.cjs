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
  await page.waitForFunction(() => window.__bh && window.__bh.feeding && window.__bh.ring, { timeout: 20000 });
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

/** One Feeding.update bite: mass up, entity gone, absorption live then back to 0. */
async function bite(page) {
  await enter(page, { biome: "Comet Current", tier: 3, galaxy: 3, zen: false });
  return page.evaluate(() => {
    const bh = window.__bh;
    const s = bh.state;
    bh.absorption.clear();
    const e = s.entities.find(ent => !ent.powerup && !ent.consumed && s.radius > ent.radius * s.eatRatio);
    if (!e) return { ok: false, why: "no edible" };
    const mass0 = s.mass;
    const n0 = s.entities.length;
    e.x = s.playerX;
    e.y = s.playerY;
    e.vx = 0;
    e.vy = 0;
    bh.feeding.update(1);
    const gone = !s.entities.includes(e);
    const liveAfterBite = bh.absorption.live;
    for (let i = 0; i < 90; i++) bh.absorption.update(1, false);
    const massGained = s.mass - mass0;
    return {
      ok: massGained > 0 && gone && liveAfterBite >= 1 && bh.absorption.live === 0,
      massGained,
      gone,
      liveAfterBite,
      liveAfter: bh.absorption.live,
      removed: n0 - s.entities.length
    };
  });
}

/**
 * Draw the ring across a long Zen run and read the canvas matrix at each half.
 * A stored angle on the object is not consulted. Back image, then the hole, then the front image.
 */
async function ring(page) {
  await enter(page, { biome: "Planet Nursery", tier: 3, galaxy: 3, zen: true });
  return page.evaluate(async ({ step, samples }) => {
    const ring = window.__bh.ring;
    const proto = CanvasRenderingContext2D.prototype;
    const orig = {
      drawImage: proto.drawImage,
      setTransform: proto.setTransform,
      transform: proto.transform,
      rotate: proto.rotate
    };
    const origBack = ring.drawBack;
    const origFront = ring.drawFront;
    let half = null;
    let watch = false;
    let frame = [];
    const notes = [];
    const fail = m => notes.push(m);

    function matrixOf(ctx) {
      const m = ctx.getTransform();
      return { a: m.a, b: m.b, c: m.c, d: m.d, ang: Math.atan2(m.b, m.a) };
    }
    function argsMatrix(args) {
      if (args.length === 1 && args[0] && typeof args[0].a === "number") {
        const m = args[0];
        return { a: m.a, b: m.b, c: m.c, d: m.d, ang: Math.atan2(m.b, m.a) };
      }
      const a = args[0], b = args[1], c = args[2], d = args[3];
      return { a, b, c, d, ang: Math.atan2(b, a) };
    }
    function rotated(m) {
      if (!m || !isFinite(m.ang)) return true;
      // Pure scale plus translation keeps the x axis level and the y axis vertical.
      return Math.abs(m.ang) > 0.02 || Math.abs(m.c) > 1e-3 || Math.abs(m.b) > 1e-3;
    }

    proto.drawImage = function (img) {
      if (watch) {
        const m = matrixOf(this);
        let who = "other";
        if (img === ring.back) who = "back";
        else if (img === ring.front) who = "front";
        frame.push({ kind: "drawImage", half, who, ...m });
      }
      return orig.drawImage.apply(this, arguments);
    };
    proto.setTransform = function () {
      if (watch && half) frame.push({ kind: "setTransform", half, ...argsMatrix(arguments) });
      return orig.setTransform.apply(this, arguments);
    };
    proto.transform = function () {
      if (watch && half) frame.push({ kind: "transform", half, ...argsMatrix(arguments) });
      return orig.transform.apply(this, arguments);
    };
    proto.rotate = function (rad) {
      if (watch && half) frame.push({ kind: "rotate", half, rad });
      return orig.rotate.apply(this, arguments);
    };
    ring.drawBack = function () {
      half = "back";
      try { return origBack.apply(ring, arguments); }
      finally { half = null; }
    };
    ring.drawFront = function () {
      half = "front";
      try { return origFront.apply(ring, arguments); }
      finally { half = null; }
    };

    const taken = [];
    try {
      for (let s = 0; s < samples; s++) {
        for (let i = 0; i < step; i++) ring.update(1, false);
        frame = [];
        watch = true;
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        watch = false;
        const draws = frame.filter(e => e.kind === "drawImage");
        let pairs = 0;
        let i = 0;
        while (i < draws.length) {
          if (draws[i].who !== "back") { i++; continue; }
          let j = i + 1;
          let sawHole = false;
          while (j < draws.length && draws[j].who !== "front") {
            if (draws[j].who === "other") sawHole = true;
            if (draws[j].who === "back") break;
            j++;
          }
          if (j < draws.length && draws[j].who === "front" && sawHole) pairs++;
          else break;
          i = j + 1;
        }
        const halfEvents = frame.filter(e => e.half === "back" || e.half === "front");
        const tilted = halfEvents.filter(e => e.kind === "rotate" || rotated(e));
        const maxAbsAng = halfEvents.reduce((m, e) => Math.max(m, Math.abs(e.ang || 0)), 0);
        taken.push({
          phase: +ring.phase.toFixed(3),
          draws: draws.length,
          pairs,
          maxAbsAng: +maxAbsAng.toFixed(5),
          tilted: tilted.length
        });
        if (pairs < 1) fail("sample " + s + " did not draw back, then the hole, then front");
        if (tilted.length) fail("sample " + s + " tilted a ring half (" + tilted.length + ")");
        const mismatched = draws.filter(e => e.half && e.who !== "other" && e.half !== e.who);
        if (mismatched.length) fail("sample " + s + " drew the wrong half inside drawBack/drawFront");
      }
    } finally {
      watch = false;
      proto.drawImage = orig.drawImage;
      proto.setTransform = orig.setTransform;
      proto.transform = orig.transform;
      proto.rotate = orig.rotate;
      ring.drawBack = origBack;
      ring.drawFront = origFront;
    }

    return {
      ok: notes.length === 0,
      notes,
      samples: taken,
      minutes: samples * step / 3600
    };
  }, { step: STEP, samples: SAMPLES });
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
  result.ring = await ring(page);
  if (!result.ring.ok) { result.ok = false; result.notes.push("ring draw failed"); result.notes.push(...result.ring.notes); }
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

module.exports = { bite, ring };
