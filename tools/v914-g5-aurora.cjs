// v9.14.0 Galaxy 5 Void Rift painted aurora.
// The ribbon is two wisps. The sky file stays backdrop_void.jpg.
//   node tools/v914-g5-aurora.cjs [port]
// Exit 0 when every check passed. Viewport 390x844 @2x.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Browser } = require("./lib/browser.cjs");
const { releaseAgrees } = require("./lib/release.cjs");
const { chromium } = Browser.playwrightCore();

const PORT = process.argv[2] || "8765";
const CHROME = Browser.chromePath(chromium);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SHOT = process.env.V914_SHOT
  || (fs.existsSync("/opt/cursor/artifacts")
    ? "/opt/cursor/artifacts/v914-g5-aurora-390x844.png"
    : path.join(require("os").tmpdir(), "v914-g5-aurora-390x844.png"));

const PRECACHE = [
  "./js/core/AuroraRift.js",
  "./assets/aurora/index.json",
  "./assets/aurora/aurora-wisp-subtle-1.png",
  "./assets/aurora/aurora-wisp-subtle-2.png"
];

const EXPECT = {
  "assets/aurora/aurora-wisp-subtle-1.png": "d8e95e99052bfb7b407b4e37908b7e6a32d86062864cc7c03251202ff57ed0e1",
  "assets/aurora/aurora-wisp-subtle-2.png": "7e92b71f16df609bca227fcdf31e79a68ae35dd59994ed72c302782bc0084469",
  "assets/backdrop_void.jpg": "55d55c7934372465e7c07ea2945dc5736e294dbd86b644276988f9097cfb9708"
};

const PROC = /\.stroke\s*\(|\.arc\s*\(|createRadialGradient|fillRect/;

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function hook() {
  const proto = CanvasRenderingContext2D.prototype;
  const origDraw = proto.drawImage;
  const origStroke = proto.stroke;
  const origArc = proto.arc;
  const origRadial = proto.createRadialGradient;
  const origFill = proto.fillRect;
  const bag = { src: [], proc: 0 };
  window.__g5 = bag;
  window.__g5depth = 0;
  window.__g5reset = () => { bag.src.length = 0; bag.proc = 0; };
  const bump = () => { if (window.__g5depth > 0) bag.proc++; };
  proto.drawImage = function (img) {
    if (img && img instanceof HTMLImageElement) {
      const src = img.currentSrc || img.src || "";
      if (src) bag.src.push(src);
    }
    return origDraw.apply(this, arguments);
  };
  proto.stroke = function () { bump(); return origStroke.apply(this, arguments); };
  proto.arc = function () { bump(); return origArc.apply(this, arguments); };
  proto.createRadialGradient = function () { bump(); return origRadial.apply(this, arguments); };
  proto.fillRect = function () { bump(); return origFill.apply(this, arguments); };
}

function ownerGate(rel) {
  const src = fs.readFileSync(rel, "utf8");
  const stripped = strip(src);
  const classes = stripped.match(/export class /g) || [];
  const head = stripped.replace(/export class [\s\S]*$/, "");
  return {
    file: rel,
    classes: classes.length,
    looseFn: /^\s*(export\s+)?(async\s+)?function\s+/m.test(head),
    looseState: /^\s*(export\s+)?(const|let|var)\s+/m.test(head),
    procedural: PROC.test(stripped)
  };
}

function filesGate() {
  const sw = fs.readFileSync("sw.js", "utf8");
  const worlds = fs.readFileSync("js/worlds.js", "utf8");
  const missing = PRECACHE.filter(p => sw.indexOf(p) < 0);
  const release = releaseAgrees("9.14.0");
  const owners = ["js/core/AuroraRift.js"].map(ownerGate);
  const hashMiss = [];
  for (const [rel, expect] of Object.entries(EXPECT)) {
    if (sha256(rel) !== expect) hashMiss.push(rel);
  }
  const provMiss = [];
  const prov = JSON.parse(fs.readFileSync("assets/aurora/PROVENANCE.json", "utf8"));
  const dir = "assets/aurora";
  for (const name of ["aurora-wisp-subtle-1.png", "aurora-wisp-subtle-2.png"]) {
    const row = (prov.files || []).find(f => f.file === name);
    if (!row) { provMiss.push("missing " + name); continue; }
    const got = sha256(path.join(dir, name));
    if (got !== row.sha256) provMiss.push(name + " " + got);
  }
  const index = JSON.parse(fs.readFileSync("assets/aurora/index.json", "utf8"));
  const wisps = (index.sprites || []).filter(s => s && s.role === "wisp");
  const indexOk = index.kind === "aurora" && index.version === 1 && wisps.length === 2
    && wisps.every(s => s.w === 512 && s.h === 160 && s.pivot && s.pivot[0] === 256 && s.pivot[1] === 80)
    && wisps.some(s => s.id === "aurora-wisp-subtle-1")
    && wisps.some(s => s.id === "aurora-wisp-subtle-2");
  const start = worlds.indexOf('"Void Rift"(ctx');
  const end = worlds.indexOf('"Star Meadow"(ctx');
  const voidDraw = strip(worlds.slice(start, end));
  const voidClean = start >= 0 && end > start
    && voidDraw.indexOf("AuroraRift.draw") >= 0
    && !PROC.test(voidDraw);
  const mini = worlds.slice(worlds.indexOf("function drawWorldsMinimap"), worlds.indexOf("let lastFD"));
  const radarOk = /W\.aurora[\s\S]*?0\.18/.test(mini) && /W\.rivers[\s\S]*?0\.35/.test(mini);
  const skySame = sha256("assets/backdrop_void.jpg") === EXPECT["assets/backdrop_void.jpg"];
  const ok = !missing.length && release.ok && !hashMiss.length && !provMiss.length
    && indexOk && voidClean && radarOk && skySame
    && owners.every(o => o.classes === 1 && !o.looseFn && !o.looseState && !o.procedural);
  return { ok, missing, release, hashMiss, provMiss, indexOk, voidClean, radarOk, skySame, owners };
}

function isAbortNoise(text) {
  return /Failed to load resource|net::ERR_|ERR_FAILED|ERR_ABORTED/i.test(text);
}

async function launch() {
  return chromium.launch({
    executablePath: CHROME,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
}

async function newPage(browser, dpr) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: dpr || 2,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block"
  });
  const page = await ctx.newPage();
  const errs = [];
  const logs = [];
  page.on("pageerror", e => errs.push(String(e)));
  page.on("console", msg => { if (msg.type() === "error") logs.push(msg.text()); });
  page._errs = errs;
  page._logs = logs;
  return page;
}

async function boot(page, query) {
  await page.goto(`${ORIGIN}/${query || "?debug"}`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => window.__bh && window.__bh.state && window.__bh.scene, { timeout: 20000 });
  const skip = page.locator("#btn-skip-intro");
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

async function scene(page) {
  return page.evaluate(async () => {
    const bh = window.__bh;
    const s = bh.state;
    const worlds = await import("/js/worlds.js");
    const { Theme } = await import("/js/core/Theme.js");
    const { AuroraRift } = await import("/js/core/AuroraRift.js");
    const { PictureCatalog } = await import("/js/core/PictureCatalog.js");
    const bag = { blits: [], calls: [] };
    window.__g5probe = bag;
    const origDraw = AuroraRift.draw;
    const origBlit = PictureCatalog.prototype.blit;
    AuroraRift.draw = function () {
      bag.calls.push({ wide: arguments[2], cover: arguments[3], boost: arguments[4] });
      window.__g5depth++;
      try { return origDraw.apply(this, arguments); }
      finally { window.__g5depth--; }
    };
    PictureCatalog.prototype.blit = function (ctx, spr, x, y, w, h) {
      if (window.__g5depth > 0 && spr && spr.id) {
        const t = ctx.getTransform();
        bag.blits.push({
          id: spr.id, w, h, sw: spr.w, sh: spr.h,
          alpha: ctx.globalAlpha,
          op: ctx.globalCompositeOperation,
          x: t.e, y: t.f
        });
      }
      return origBlit.apply(this, arguments);
    };
    const clearProbe = () => { bag.blits.length = 0; bag.calls.length = 0; window.__g5.proc = 0; };
    const t0 = performance.now();
    while (!(Theme.aurora.ready && Theme.aurora.has("aurora-wisp-subtle-1") && Theme.aurora.has("aurora-wisp-subtle-2")) && performance.now() - t0 < 15000) {
      await new Promise(r => setTimeout(r, 40));
    }
    Object.assign(bh.dev.cfg, { galaxy: 5, biome: "Void Rift", tier: 6, depth: 0, zen: false, wisp: false });
    bh.dev.enter();
    s.paused = true;
    s.settings.reduceMotion = true;
    s.birth = 0;
    const info = worlds.worldsInfo();
    const lm = info && info.landmarks && info.landmarks[0];
    if (lm) {
      s.playerX = lm.x;
      s.playerY = lm.y;
      s.camX = lm.x;
      s.camY = lm.y;
    }
    s.playerVX = 0;
    s.playerVY = 0;
    const viewW = s.viewW, viewH = s.viewH;
    const wideExpect = s.radius * 100 * 0.045;
    window.__g5reset();
    clearProbe();
    s.viewW = 1e8;
    s.viewH = 1e8;
    bh.scene.draw(performance.now(), 0, true);
    const calm = {
      blits: window.__g5probe.blits.map(b => ({ id: b.id, w: b.w, h: b.h, sw: b.sw, sh: b.sh, alpha: b.alpha, op: b.op })),
      calls: window.__g5probe.calls.slice(),
      proc: window.__g5.proc
    };
    window.__g5reset();
    clearProbe();
    worlds.onWorldEvent(s, "voidPulse");
    bh.scene.draw(performance.now(), 0, true);
    const boost = {
      blits: window.__g5probe.blits.map(b => ({ id: b.id, alpha: b.alpha, op: b.op })),
      calls: window.__g5probe.calls.slice(),
      proc: window.__g5.proc
    };
    for (let i = 0; i < 12; i++) worlds.updateWorlds(s, 80, 0);
    s.viewW = viewW;
    s.viewH = viewH;
    if (lm) {
      s.playerX = lm.x;
      s.playerY = lm.y;
      s.camX = lm.x;
      s.camY = lm.y;
    }
    s.playerVX = 0;
    s.playerVY = 0;
    s.birth = 0;
    window.__g5reset();
    clearProbe();
    bh.scene.draw(performance.now(), 0, true);
    const framed = window.__g5probe.blits.length;
    const off = document.createElement("canvas").getContext("2d");
    const pts = [];
    for (let i = 0; i <= 8; i++) pts.push([i * 400, 0]);
    const ribbon = { pts };
    const view = { camX: 1600, camY: 0 };
    clearProbe();
    AuroraRift.draw(off, ribbon, 30, 1, 0, 0, 0, 0, 1, view, 10000, 4000, false);
    const still = window.__g5probe.blits.map(b => b.x);
    clearProbe();
    AuroraRift.draw(off, ribbon, 30, 1, 0, 5000, 0, 0, 1, view, 10000, 4000, false);
    const moved = window.__g5probe.blits.map(b => b.x);
    clearProbe();
    AuroraRift.draw(off, ribbon, 30, 1, 0, 5000, 0, 0, 1, view, 10000, 4000, true);
    const held = window.__g5probe.blits.map(b => b.x);
    clearProbe();
    AuroraRift.draw(off, ribbon, 30, 1, 0, 0, 0, 0, 1, view, 10000, 4000, true);
    const a0 = window.__g5probe.blits[0] ? window.__g5probe.blits[0].alpha : 0;
    clearProbe();
    AuroraRift.draw(off, ribbon, 30, 1, 900, 0, 0, 0, 1, view, 10000, 4000, true);
    const a1 = window.__g5probe.blits[0] ? window.__g5probe.blits[0].alpha : 0;
    const src = window.__g5.src;
    const needle = (n) => src.some(u => u.indexOf(n) >= 0);
    const badge = document.getElementById("dev-badge");
    let devHidden = true;
    if (badge) {
      const cs = getComputedStyle(badge);
      devHidden = badge.classList.contains("hidden") || cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0";
    }
    const ids = calm.blits.map(b => b.id);
    return {
      biome: s.biome && s.biome.name,
      tier: s.tier,
      ready: Theme.aurora.ready,
      has1: Theme.aurora.has("aurora-wisp-subtle-1"),
      has2: Theme.aurora.has("aurora-wisp-subtle-2"),
      sky: needle("backdrop_void"),
      wisp1: ids.indexOf("aurora-wisp-subtle-1") >= 0,
      wisp2: ids.indexOf("aurora-wisp-subtle-2") >= 0,
      framed,
      calm,
      boost,
      wideExpect,
      still: Math.min.apply(null, still),
      moved: Math.min.apply(null, moved),
      held: Math.min.apply(null, held),
      a0, a1,
      devHidden,
      devText: badge ? badge.textContent : ""
    };
  });
}

async function reveal(page) {
  await page.evaluate(() => {
    for (const id of ["splash", "title-screen", "intro-screen", "hint-toast"]) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.style.display = "none";
      el.classList.add("hidden");
    }
    const badge = document.getElementById("dev-badge");
    if (badge) {
      badge.classList.add("hidden");
      badge.style.display = "none";
      badge.style.visibility = "hidden";
    }
    const bh = window.__bh;
    if (bh && bh.state) bh.state.birth = 0;
    if (bh && bh.scene) bh.scene.draw(performance.now(), 0, true);
  });
}

function near(a, b, tol) {
  return Math.abs(a - b) <= tol;
}

function sizeOk(blits, wide) {
  if (!blits.length || !(wide > 0)) return false;
  const segH = wide * 1.95;
  for (const b of blits) {
    const segW = segH * (b.sw / b.sh);
    if (!near(b.h, segH, segH * 0.02)) return false;
    if (!near(b.w, segW, segW * 0.02)) return false;
    if (b.op !== "screen") return false;
    const silk = b.h * 0.5;
    if (!(silk / wide > 0.9 && silk / wide < 1.1)) return false;
  }
  return true;
}

async function extraManifest() {
  const browser = await launch();
  const page = await newPage(browser, 1);
  await page.addInitScript(hook);
  await page.route("**/assets/aurora/index.json", async route => {
    const res = await route.fetch();
    const json = await res.json();
    json.sprites = json.sprites.concat([
      { id: "wisp-extra", role: "wisp", file: "aurora-wisp-subtle-2.png", w: 512, h: 160, pivot: [256, 80] }
    ]);
    await route.fulfill({ json });
  });
  await boot(page, "?debug");
  const result = await page.evaluate(async () => {
    const bh = window.__bh;
    const s = bh.state;
    const { Theme } = await import("/js/core/Theme.js");
    const { AuroraRift } = await import("/js/core/AuroraRift.js");
    const { PictureCatalog } = await import("/js/core/PictureCatalog.js");
    const t0 = performance.now();
    while (!(Theme.aurora.ready && Theme.aurora.has("wisp-extra")) && performance.now() - t0 < 15000) {
      await new Promise(r => setTimeout(r, 40));
    }
    const ids = Theme.aurora.idsByRole("wisp");
    if (ids.indexOf("wisp-extra") < 0) return { ok: false, reason: "extra wisp row was not read", ids };
    const drawn = [];
    const orig = PictureCatalog.prototype.blit;
    PictureCatalog.prototype.blit = function (ctx, spr) {
      if (spr && spr.id) drawn.push(spr.id);
      return orig.apply(this, arguments);
    };
    const c = document.createElement("canvas").getContext("2d");
    const pts = [];
    for (let i = 0; i <= 16; i++) pts.push([i * 200, Math.sin(i) * 30]);
    const drew = AuroraRift.draw(c, { pts }, 36, 1, 0, 0, 0, 0, 1, { camX: 1600, camY: 0 }, 20000, 8000, true);
    PictureCatalog.prototype.blit = orig;
    const ok = !!(drew && drawn.indexOf("wisp-extra") >= 0 && drawn.indexOf("aurora-wisp-subtle-1") >= 0);
    return { ok, reason: ok ? "extra wisp row drawn" : "extra wisp row was not drawn", drew, ids, drawn, biome: s.biome && s.biome.name };
  });
  const pageErrors = page._errs.slice();
  const logs = page._logs.filter(t => !isAbortNoise(t));
  await browser.close();
  const ok = !!(result.ok && !pageErrors.length && !logs.length);
  return { ok, reason: ok ? result.reason : (result.reason || "extra manifest threw"), result, pageErrors, logs };
}

async function onePngDown() {
  const browser = await launch();
  const page = await newPage(browser, 1);
  await page.addInitScript(hook);
  await page.route("**/assets/aurora/aurora-wisp-subtle-1.png", route => route.abort());
  await boot(page, "?debug");
  const result = await page.evaluate(async () => {
    const bh = window.__bh;
    const s = bh.state;
    const worlds = await import("/js/worlds.js");
    const { Theme } = await import("/js/core/Theme.js");
    const { AuroraRift } = await import("/js/core/AuroraRift.js");
    const { PictureCatalog } = await import("/js/core/PictureCatalog.js");
    const t0 = performance.now();
    while (!(Theme.aurora.ready && Theme.aurora.has("aurora-wisp-subtle-2")) && performance.now() - t0 < 15000) {
      await new Promise(r => setTimeout(r, 40));
    }
    Object.assign(bh.dev.cfg, { galaxy: 5, biome: "Void Rift", tier: 4, depth: 0, zen: false, wisp: false });
    bh.dev.enter();
    s.paused = true;
    const info = worlds.worldsInfo();
    const lm = info && info.landmarks && info.landmarks[0];
    if (lm) {
      s.playerX = lm.x;
      s.playerY = lm.y;
      s.camX = lm.x;
      s.camY = lm.y;
    }
    const drawn = [];
    const orig = PictureCatalog.prototype.blit;
    PictureCatalog.prototype.blit = function (ctx, spr) {
      if (spr && spr.id) drawn.push(spr.id);
      return orig.apply(this, arguments);
    };
    window.__g5reset();
    window.__g5depth = 0;
    const proto = CanvasRenderingContext2D.prototype;
    const mark = () => { if (window.__g5depth > 0) window.__g5.proc++; };
    const oStroke = proto.stroke, oArc = proto.arc, oRad = proto.createRadialGradient, oFill = proto.fillRect;
    proto.stroke = function () { mark(); return oStroke.apply(this, arguments); };
    proto.arc = function () { mark(); return oArc.apply(this, arguments); };
    proto.createRadialGradient = function () { mark(); return oRad.apply(this, arguments); };
    proto.fillRect = function () { mark(); return oFill.apply(this, arguments); };
    const origDraw = AuroraRift.draw;
    AuroraRift.draw = function () {
      window.__g5depth++;
      try { return origDraw.apply(this, arguments); }
      finally { window.__g5depth--; }
    };
    s.viewW = 1e8;
    s.viewH = 1e8;
    const drew = !!bh.scene.draw(performance.now(), 0, true);
    AuroraRift.draw = origDraw;
    proto.stroke = oStroke;
    proto.arc = oArc;
    proto.createRadialGradient = oRad;
    proto.fillRect = oFill;
    PictureCatalog.prototype.blit = orig;
    const one = drawn.filter(id => id === "aurora-wisp-subtle-1").length;
    const two = drawn.filter(id => id === "aurora-wisp-subtle-2").length;
    const ok = Theme.aurora.ready
      && !Theme.aurora.has("aurora-wisp-subtle-1")
      && Theme.aurora.has("aurora-wisp-subtle-2")
      && one === 0 && two >= 3
      && window.__g5.proc === 0;
    return {
      ok,
      reason: ok ? "sibling wisp still draws across the ribbon" : "single png recovery failed",
      drew, one, two, proc: window.__g5.proc, drawn,
      has1: Theme.aurora.has("aurora-wisp-subtle-1"),
      has2: Theme.aurora.has("aurora-wisp-subtle-2")
    };
  });
  const pageErrors = page._errs.slice();
  const logs = page._logs.filter(t => !isAbortNoise(t));
  await browser.close();
  const ok = !!(result.ok && !pageErrors.length && !logs.length);
  return { ok, reason: ok ? result.reason : (result.reason || "single png recovery threw"), result, pageErrors, logs };
}

async function allPngDown() {
  const browser = await launch();
  const page = await newPage(browser, 1);
  await page.addInitScript(hook);
  await page.route("**/assets/aurora/*.png", route => route.abort());
  await boot(page, "?debug");
  const result = await page.evaluate(async () => {
    const bh = window.__bh;
    const s = bh.state;
    const worlds = await import("/js/worlds.js");
    const entities = await import("/js/entities.js");
    const { Theme } = await import("/js/core/Theme.js");
    const { AuroraRift } = await import("/js/core/AuroraRift.js");
    const { PictureCatalog } = await import("/js/core/PictureCatalog.js");
    const t0 = performance.now();
    while (!Theme.aurora.ready && performance.now() - t0 < 15000) {
      await new Promise(r => setTimeout(r, 40));
    }
    Object.assign(bh.dev.cfg, { galaxy: 5, biome: "Void Rift", tier: 3, depth: 0, zen: false, wisp: false });
    bh.dev.enter();
    s.paused = true;
    const info = worlds.worldsInfo();
    const lm = info && info.landmarks && info.landmarks[0];
    if (lm) {
      s.playerX = lm.x;
      s.playerY = lm.y;
      s.camX = lm.x;
      s.camY = lm.y;
    }
    const dust = entities.createEntity(entities.typeById("dust"), s.playerX, s.playerY, 1);
    dust.radius = Math.max(2, s.radius * 0.18);
    dust.depthT = 1;
    dust._spawnAlpha = 1;
    dust.auroraItem = true;
    dust.auroraT = 0.12;
    s.entities.push(dust);
    const tStart = dust.auroraT;
    worlds.updateWorlds(s, 1, 40);
    const drifted = dust.auroraT > tStart;
    const drawn = [];
    const orig = PictureCatalog.prototype.blit;
    PictureCatalog.prototype.blit = function (ctx, spr) {
      if (spr && spr.id) drawn.push(spr.id);
      return orig.apply(this, arguments);
    };
    window.__g5reset();
    const origDraw = AuroraRift.draw;
    AuroraRift.draw = function () {
      window.__g5depth++;
      try { return origDraw.apply(this, arguments); }
      finally { window.__g5depth--; }
    };
    const off = document.createElement("canvas").getContext("2d");
    const pts = [];
    for (let i = 0; i <= 6; i++) pts.push([i * 120, 0]);
    const drew = AuroraRift.draw(off, { pts }, 40, 1, 0, 0, 0, 0, 1, { camX: 300, camY: 0 }, 4000, 2000, true);
    bh.scene.draw(performance.now(), 0, true);
    AuroraRift.draw = origDraw;
    PictureCatalog.prototype.blit = orig;
    const mass0 = s.mass;
    s.radius = dust.radius / (s.eatRatio || 0.88) + 8;
    s.anchorSmooth = s.radius;
    dust.x = s.playerX + s.radius * 0.3;
    dust.y = s.playerY;
    dust.vx = 0;
    dust.vy = 0;
    dust.depthT = 1;
    dust.consuming = false;
    dust.consumed = false;
    bh.feeding.update(1);
    const eaten = s.mass > mass0;
    const painted = drawn.some(id => id.indexOf("aurora-wisp") >= 0);
    const ok = Theme.aurora.ready
      && !Theme.aurora.has("aurora-wisp-subtle-1")
      && !Theme.aurora.has("aurora-wisp-subtle-2")
      && drifted && drew === false && !painted
      && window.__g5.proc === 0
      && eaten;
    return {
      ok,
      reason: ok ? "missing wisps drew nothing and the rift still feeds" : "all-png recovery failed",
      ready: Theme.aurora.ready,
      drifted, drew, painted, eaten, proc: window.__g5.proc, drawn,
      has1: Theme.aurora.has("aurora-wisp-subtle-1"),
      has2: Theme.aurora.has("aurora-wisp-subtle-2")
    };
  });
  const pageErrors = page._errs.slice();
  const logs = page._logs.filter(t => !isAbortNoise(t));
  await browser.close();
  const ok = !!(result.ok && !pageErrors.length && !logs.length);
  return { ok, reason: ok ? result.reason : (result.reason || "all png recovery threw"), result, pageErrors, logs };
}

async function main() {
  const fail = [];
  const files = filesGate();
  if (!files.ok) fail.push({ ok: false, reason: "files, hashes, or object gate", files });

  const browser = await launch();
  const page = await newPage(browser, 2);
  await page.addInitScript(hook);
  await boot(page, "?debug");
  const g5 = await scene(page);
  g5.pageErrors = page._errs.slice();
  g5.consoleErrors = page._logs.slice();
  if (page._errs.length || page._logs.length) fail.push({ ok: false, reason: "galaxy 5 console or page errors", errors: page._errs, logs: page._logs });
  if (g5.biome !== "Void Rift") fail.push({ ok: false, reason: "not Void Rift", g5 });
  if (!g5.ready || !g5.has1 || !g5.has2 || !g5.sky) fail.push({ ok: false, reason: "aurora catalog or sky missing", g5 });
  if (!g5.wisp1 || !g5.wisp2) fail.push({ ok: false, reason: "both wisps were not blitted", g5 });
  if (!g5.framed) fail.push({ ok: false, reason: "framed view drew no ribbon", g5 });
  if (g5.calm.proc || g5.boost.proc) fail.push({ ok: false, reason: "Void Rift draw used a procedural call", g5 });
  const wide = g5.calm.calls[0] && g5.calm.calls[0].wide;
  if (!sizeOk(g5.calm.blits, wide)) fail.push({ ok: false, reason: "ribbon size does not match the corridor", wide, wideExpect: g5.wideExpect, sample: g5.calm.blits.slice(0, 3) });
  if (!(wide > 0) || Math.abs(wide - g5.wideExpect) / g5.wideExpect > 0.02) fail.push({ ok: false, reason: "corridor width is not b0 * 0.045", wide, wideExpect: g5.wideExpect });
  const calmA = g5.calm.blits[0] && g5.calm.blits[0].alpha;
  const boostA = g5.boost.blits[0] && g5.boost.blits[0].alpha;
  if (!near(calmA, 0.15, 0.004) || !near(boostA, 0.15 * 1.45, 0.006) || !near(g5.a1 / g5.a0, 1.45, 0.02)) {
    fail.push({ ok: false, reason: "boost did not lift alpha", calmA, boostA, a0: g5.a0, a1: g5.a1 });
  }
  const segW = 30 * 1.95 * (512 / 160);
  const phase = 5 * segW * 0.04;
  if (!near(g5.still, 0, 0.6) || !near(g5.moved - g5.still, phase, 1.2) || !near(g5.held, g5.still, 0.6)) {
    fail.push({ ok: false, reason: "drift phase did not slide the ribbon", still: g5.still, moved: g5.moved, held: g5.held, phase });
  }
  if (!g5.devHidden) fail.push({ ok: false, reason: "DEV pill was visible", g5 });
  fs.mkdirSync(path.dirname(SHOT), { recursive: true });
  await reveal(page);
  const devAfter = await page.evaluate(() => {
    const b = document.getElementById("dev-badge");
    if (!b) return { hidden: true };
    const cs = getComputedStyle(b);
    return {
      hidden: b.classList.contains("hidden") || cs.display === "none" || cs.visibility === "hidden",
      text: b.textContent
    };
  });
  if (!devAfter.hidden) fail.push({ ok: false, reason: "DEV pill showed on the shot", devAfter });
  await page.screenshot({ path: SHOT });
  await browser.close();

  const extra = await extraManifest();
  if (!extra.ok) fail.push(extra);

  const sibling = await onePngDown();
  if (!sibling.ok) fail.push(sibling);

  const missing = await allPngDown();
  if (!missing.ok) fail.push(missing);

  const result = {
    ok: fail.length === 0,
    files, g5: {
      biome: g5.biome, tier: g5.tier, wisp1: g5.wisp1, wisp2: g5.wisp2, sky: g5.sky,
      framed: g5.framed, proc: g5.calm && g5.calm.proc, boostProc: g5.boost && g5.boost.proc,
      wide, wideExpect: g5.wideExpect, calmA, boostA, blits: g5.calm && g5.calm.blits.length,
      devHidden: g5.devHidden
    },
    extra, sibling, missing, shot: SHOT, devAfter, fail
  };
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
