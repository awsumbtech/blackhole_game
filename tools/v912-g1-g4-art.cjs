// v9.12.0 Galaxy 1 + Galaxy 4 painted art.
// Reef beds, flagship hulls, landmark pips, and the two backdrops are pictures.
//   node tools/v912-g1-g4-art.cjs [port]
// Exit 0 when every check passed. Viewport 390x844.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Browser } = require("./lib/browser.cjs");
const { chromium } = Browser.playwrightCore();

const PORT = process.argv[2] || "8765";
const CHROME = Browser.chromePath(chromium);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SHOT_DIR = process.env.V912_SHOT_DIR
  || (fs.existsSync("/opt/cursor") ? "/opt/cursor/artifacts" : path.join(require("os").tmpdir(), "v912-shots"));

const PRECACHE = [
  "./assets/reef/index.json",
  "./assets/reef/reef-bed-1.png",
  "./assets/reef/reef-bed-2.png",
  "./assets/flagship/index.json",
  "./assets/flagship/flagship-hull-1.png",
  "./assets/flagship/flagship-hull-2.png",
  "./assets/flagship/flagship-ember.png",
  "./assets/hud/radar/radar-pip-reef.png",
  "./assets/hud/radar/radar-pip-flagship.png",
  "./js/core/ReefBed.js"
];

const EXPECT = {
  "assets/backdrop_reef.jpg": "3813dae66778ac604f60d59157790f473f40a6941ae2c8de3a2fe42cff9b876e",
  "assets/backdrop_armada.jpg": "e0d18507747d35e3a47960b5b649255a29184f9236da701c08d58d4a4a873635",
  "assets/reef/reef-bed-1.png": "ce681184251861a581b42853997716f5e5991e2cb0739c5225261c75a7d32a34",
  "assets/reef/reef-bed-2.png": "c42594346c4457b2148d442faba3a738d904d1c17ff45954c4a5c0549c3554e0",
  "assets/flagship/flagship-hull-1.png": "7236a23bf84a60b3c0813acefe32e7c0a39eb55573f72c02b92c4793aeaa3f82",
  "assets/flagship/flagship-hull-2.png": "ebb4d9c5ead273db6cbf3d44190c53eb1fa1a803ad141dce3f0641efd9b4d217",
  "assets/flagship/flagship-ember.png": "2f9dacae1d3fae7461e83c12d053aa1e22fb0f1d10510302ca66f97eb1c57680",
  "assets/hud/radar/radar-pip-reef.png": "261355473ce2920de301237a6d39c9108e7fe75106eb315ee06678c5a3047473",
  "assets/hud/radar/radar-pip-flagship.png": "80b539c7b9f0d875cadb446d53c00a8a82fab6a51bb34192022980f336cb8f95"
};

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function hook() {
  const proto = CanvasRenderingContext2D.prototype;
  const origDraw = proto.drawImage;
  const origRadial = proto.createRadialGradient;
  const origLinear = proto.createLinearGradient;
  const origFill = proto.fillRect;
  const origArc = proto.arc;
  const origStroke = proto.stroke;
  const bag = { src: [], reefGlow: 0, reefArc: 0, flagshipPaint: 0 };
  window.__g12 = bag;
  window.__g12reset = () => {
    bag.src.length = 0;
    bag.reefGlow = 0;
    bag.reefArc = 0;
    bag.flagshipPaint = 0;
  };
  const reefColor = (color) => {
    const c = String(color);
    return c.indexOf("90, 200, 180") >= 0 || c.indexOf("80, 200, 180") >= 0 || c.indexOf("110, 150, 230") >= 0;
  };
  proto.drawImage = function (img) {
    if (img && img instanceof HTMLImageElement) {
      const src = img.currentSrc || img.src || "";
      if (src) bag.src.push(src);
    }
    return origDraw.apply(this, arguments);
  };
  proto.createRadialGradient = function () {
    const grad = origRadial.apply(this, arguments);
    const add = grad.addColorStop;
    grad.addColorStop = function (offset, color) {
      if (reefColor(color)) bag.reefGlow++;
      return add.apply(this, arguments);
    };
    return grad;
  };
  proto.createLinearGradient = function () {
    if (this.canvas && this.canvas.width >= 1000) bag.flagshipPaint++;
    return origLinear.apply(this, arguments);
  };
  proto.fillRect = function (x, y, w, h) {
    if (this.canvas && this.canvas.width >= 1000 && w > 8 && h > 8) bag.flagshipPaint++;
    return origFill.apply(this, arguments);
  };
  proto.arc = function () {
    this.__g12arc = true;
    return origArc.apply(this, arguments);
  };
  proto.stroke = function () {
    if (this.__g12arc && reefColor(this.strokeStyle)) bag.reefArc++;
    this.__g12arc = false;
    return origStroke.apply(this, arguments);
  };
}

function ownerGate(rel) {
  const src = fs.readFileSync(rel, "utf8");
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const classes = stripped.match(/export class /g) || [];
  const head = stripped.replace(/export class [\s\S]*$/, "");
  return {
    file: rel,
    classes: classes.length,
    looseFn: /^\s*(export\s+)?(async\s+)?function\s+/m.test(head),
    looseState: /^\s*(export\s+)?(const|let|var)\s+/m.test(head),
    procedural: /createRadialGradient|createLinearGradient|fillRect|strokeRect/.test(stripped)
  };
}

function filesGate() {
  const sw = fs.readFileSync("sw.js", "utf8");
  const game = fs.readFileSync("js/game.js", "utf8");
  const worlds = fs.readFileSync("js/worlds.js", "utf8");
  const missing = PRECACHE.filter(p => sw.indexOf(p) < 0);
  const cache = /CACHE_NAME = "blackhole-v9\.12\.0"/.test(sw);
  const version = /const VERSION = "9\.12\.0"/.test(game);
  const reefDraw = worlds.slice(worlds.indexOf('"Debris Reef"(ctx'), worlds.indexOf('"Comet Current"(ctx'));
  const armadaDraw = worlds.slice(worlds.indexOf('"Ruined Armada"(ctx'), worlds.indexOf('"Void Rift"(ctx'));
  const owners = ["js/core/ReefBed.js", "js/core/Flagship.js", "js/core/RadarInstrument.js"].map(ownerGate);
  const hashes = {};
  const hashMiss = [];
  for (const [rel, expect] of Object.entries(EXPECT)) {
    const got = sha256(rel);
    hashes[rel] = got === expect;
    if (got !== expect) hashMiss.push(rel);
  }
  const provFiles = [
    ["assets/reef/PROVENANCE.json", ["reef-bed-1.png", "reef-bed-2.png", "../backdrop_reef.jpg"]],
    ["assets/flagship/PROVENANCE.json", ["flagship-hull-1.png", "flagship-hull-2.png", "flagship-ember.png", "../backdrop_armada.jpg"]],
    ["assets/hud/radar/PROVENANCE.json", ["radar-pip-reef.png", "radar-pip-flagship.png"]]
  ];
  const provMiss = [];
  for (const [rel, names] of provFiles) {
    const json = JSON.parse(fs.readFileSync(rel, "utf8"));
    const dir = path.dirname(rel);
    for (const name of names) {
      const row = (json.files || []).find(f => f.file === name);
      if (!row) { provMiss.push(rel + " missing " + name); continue; }
      const got = sha256(path.resolve(dir, row.file));
      if (got !== row.sha256) provMiss.push(name);
    }
  }
  const ok = !missing.length && cache && version && !hashMiss.length && !provMiss.length
    && reefDraw.indexOf("lmSprite") < 0 && reefDraw.indexOf("drawGlow") < 0
    && reefDraw.indexOf("createRadialGradient") < 0 && reefDraw.indexOf("arc(") < 0
    && reefDraw.indexOf("ReefBed") >= 0
    && armadaDraw.indexOf("present") >= 0 && armadaDraw.indexOf("createRadialGradient") < 0
    && armadaDraw.indexOf("createLinearGradient") < 0 && armadaDraw.indexOf("fillRect") < 0
    && owners.every(o => o.classes === 1 && !o.looseFn && !o.looseState && !o.procedural);
  return { ok, missing, cache, version, hashMiss, provMiss, owners, reefClean: reefDraw.indexOf("lmSprite") < 0 };
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
  await page.goto(`${ORIGIN}/${query || "?dev&debug"}`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => window.__bh && window.__bh.state && window.__bh.scene, { timeout: 20000 });
  const skip = page.locator("#btn-skip-intro");
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

async function scene(page, cfg) {
  await page.evaluate(async (cfg) => {
    const bh = window.__bh;
    const s = bh.state;
    const worlds = await import("/js/worlds.js");
    const { Theme } = await import("/js/core/Theme.js");
    const t0 = performance.now();
    while (!(Theme.reef.ready && Theme.flagship.ready && Theme.radar.ready) && performance.now() - t0 < 15000) {
      await new Promise(r => setTimeout(r, 40));
    }
    Object.assign(bh.dev.cfg, cfg);
    bh.dev.enter();
    s.paused = true;
    s.settings.reduceMotion = true;
    const info = worlds.worldsInfo();
    const lm = info && info.landmarks && info.landmarks[0];
    if (lm) {
      s.playerX = lm.x;
      s.playerY = lm.y;
      s.camX = s.playerX;
      s.camY = s.playerY;
    }
    for (let i = 0; i < 8; i++) worlds.updateWorlds(s, 1, 1);
    for (let i = 0; i < 18; i++) worlds.updateWorlds(s, 20, 0);
    s.birth = 0;
    if (lm) {
      s.playerX = lm.x;
      s.playerY = lm.y;
      s.camX = lm.x;
      s.camY = lm.y;
    }
    s.playerVX = 0;
    s.playerVY = 0;
    const entities = await import("/js/entities.js");
    const place = (id, ox, oy, radius) => {
      const e = entities.createEntity(entities.typeById(id), s.playerX + ox, s.playerY + oy, 1);
      e.radius = radius;
      e.depthT = 1;
      e._spawnAlpha = 1;
      s.entities.push(e);
    };
    place("dust", 36, 18, Math.max(2, s.radius * 0.2));
    place("junk", -48, 24, s.radius * 2.2);
    bh.scene.draw(performance.now(), 1, true);
  }, cfg);
  await page.waitForTimeout(1400);
  return page.evaluate(() => {
    const bh = window.__bh;
    const s = bh.state;
    const info = bh.worlds();
    const lm = info && info.landmarks && info.landmarks[0];
    if (lm) {
      s.playerX = lm.x;
      s.playerY = lm.y;
      s.camX = lm.x;
      s.camY = lm.y;
    }
    window.__g12reset();
    for (let i = 0; i < 3; i++) bh.scene.draw(performance.now(), 1, true);
    const src = window.__g12.src;
    const needle = (n) => src.some(u => u.indexOf(n) >= 0);
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    const cx = (w / 2) | 0, cy = (h / 2) | 0;
    const mid = ctx.getImageData(cx, cy, 1, 1).data;
    const lum = (p) => p[0] + p[1] + p[2];
    let warm = 0;
    let disk = 0;
    const rad = Math.max(28, Math.round(Math.min(w, h) * 0.055));
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2;
      const x = cx + Math.cos(a) * rad;
      const y = cy + Math.sin(a) * rad * 0.35;
      const p = ctx.getImageData(x | 0, y | 0, 1, 1).data;
      disk = Math.max(disk, lum(p));
      if (p[0] > 60 && p[0] > p[2] + 12) warm++;
    }
    return {
      biome: s.biome && s.biome.name,
      reef: needle("reef-bed-"),
      hull: needle("flagship-hull-"),
      ember: needle("flagship-ember"),
      pipReef: needle("radar-pip-reef"),
      pipFlag: needle("radar-pip-flagship"),
      pipEdible: needle("radar-pip-edible"),
      pipBig: needle("radar-pip-big"),
      bezel: needle("radar-bezel"),
      player: needle("radar-player"),
      skyReef: needle("backdrop_reef"),
      skyArmada: needle("backdrop_armada"),
      holeDark: mid[0] < 30 && mid[1] < 30 && mid[2] < 30,
      holeDarkerThanDisk: lum(mid) < disk,
      holeWarm: warm,
      reefGlow: window.__g12.reefGlow,
      reefArc: window.__g12.reefArc,
      flagshipPaint: window.__g12.flagshipPaint,
      slice: bh.slicePaintReady()
    };
  });
}

async function reveal(page) {
  await page.evaluate(() => {
    for (const id of ["splash", "title-screen", "intro-screen"]) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.style.display = "none";
      el.classList.add("hidden");
    }
    const hint = document.getElementById("hint-toast");
    if (hint) hint.classList.add("hidden");
    const badge = document.getElementById("dev-badge");
    if (badge) badge.style.visibility = "hidden";
    const bh = window.__bh;
    if (bh && bh.state) bh.state.birth = 0;
    if (bh && bh.scene) bh.scene.draw(performance.now(), 0, true);
  });
}

async function extraVariants() {
  const browser = await launch();
  const page = await newPage(browser, 1);
  await page.route("**/assets/reef/index.json", async route => {
    const res = await route.fetch();
    const json = await res.json();
    json.sprites = json.sprites.concat([
      { id: "reef-bed-extra", role: "bed", file: "reef-bed-extra.png", w: 512, h: 512, pivot: [256, 256] }
    ]);
    json.variants = (json.variants || []).concat([{ bed: "reef-bed-extra" }]);
    await route.fulfill({ json });
  });
  await page.route("**/assets/flagship/index.json", async route => {
    const res = await route.fetch();
    const json = await res.json();
    json.sprites = json.sprites.concat([
      { id: "flagship-hull-extra", role: "hull", file: "flagship-hull-extra.png", w: 2048, h: 1024, pivot: [1024, 512] }
    ]);
    await route.fulfill({ json });
  });
  const alias = (from, to) => page.route(from, route => route.continue({ url: `${ORIGIN}${to}` }));
  await alias("**/assets/reef/reef-bed-extra.png", "/assets/reef/reef-bed-1.png");
  await alias("**/assets/flagship/flagship-hull-extra.png", "/assets/flagship/flagship-hull-1.png");
  await boot(page);
  const result = await page.evaluate(async () => {
    const { Theme } = await import("/js/core/Theme.js");
    const { ReefBed } = await import("/js/core/ReefBed.js");
    const { Flagship } = await import("/js/core/Flagship.js");
    const t0 = performance.now();
    while (!(Theme.reef.ready && Theme.flagship.ready) && performance.now() - t0 < 15000) {
      await new Promise(r => setTimeout(r, 40));
    }
    const beds = ReefBed.bedIds();
    const hulls = Theme.flagship.idsByRole("hull");
    if (beds.indexOf("reef-bed-extra") < 0 || hulls.indexOf("flagship-hull-extra") < 0) {
      return { ok: false, reason: "extra index rows were not read", beds, hulls };
    }
    const bag = [];
    const orig = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (img) {
      if (img && (img.src || img.currentSrc)) bag.push(img.src || img.currentSrc);
      return orig.apply(this, arguments);
    };
    const c = document.createElement("canvas").getContext("2d");
    const reefs = beds.map((_, i) => ({ x: i * 40, y: 0, r: 18, haze: false, born: 0 }));
    const drewBeds = ReefBed.drawSet(c, reefs, { ox: 0, oy: 0, f: 1, timer: 1000 }, { camX: 0, camY: 0 }, { breath: 0.5 }, 100000, 100000, 1);
    const ship = new Flagship();
    let drewHull = false;
    for (let i = 0; i < hulls.length; i++) {
      const sp = ship.sprite(i, null, false, true);
      if (sp && ship.draw(c, sp, 60 + i * 10, 60, 24, 0, 1, 0.4)) drewHull = true;
    }
    CanvasRenderingContext2D.prototype.drawImage = orig;
    const src = bag.join("\n");
    const ok = !!(drewBeds && drewHull && src.indexOf("reef-bed-extra") >= 0 && src.indexOf("flagship-hull-extra") >= 0);
    return { ok, reason: ok ? "extra rows drawn" : "extra rows were not drawn", drewBeds, drewHull, beds, hulls };
  });
  const pageErrors = page._errs.slice();
  await browser.close();
  return { ok: !!(result.ok && !pageErrors.length), result, pageErrors };
}

async function bedDown() {
  const browser = await launch();
  const page = await newPage(browser, 1);
  await page.route("**/assets/reef/reef-bed-2.png", route => route.abort());
  await boot(page);
  const result = await page.evaluate(async () => {
    const { Theme } = await import("/js/core/Theme.js");
    const { ReefBed } = await import("/js/core/ReefBed.js");
    const t0 = performance.now();
    while (!Theme.reef.ready && performance.now() - t0 < 15000) {
      await new Promise(r => setTimeout(r, 40));
    }
    const kept = Theme.reef.has("reef-bed-1");
    const missing = Theme.reef.has("reef-bed-2");
    const bag = [];
    const orig = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (img) {
      if (img && (img.src || img.currentSrc)) bag.push(img.src || img.currentSrc);
      return orig.apply(this, arguments);
    };
    const c = document.createElement("canvas").getContext("2d");
    const reefs = [
      { x: 0, y: 0, r: 18, haze: false, born: 0 },
      { x: 40, y: 0, r: 18, haze: false, born: 0 }
    ];
    const drew = ReefBed.drawSet(c, reefs, { ox: 0, oy: 0, f: 1, timer: 1000 }, { camX: 0, camY: 0 }, { breath: 0.5 }, 100000, 100000, 1);
    CanvasRenderingContext2D.prototype.drawImage = orig;
    const src = bag.join("\n");
    const ok = Theme.reef.ready && kept && !missing && drew && src.indexOf("reef-bed-1") >= 0 && src.indexOf("reef-bed-2") < 0;
    return { ok, ready: Theme.reef.ready, kept, missing, drew };
  });
  const pageErrors = page._errs.slice();
  await browser.close();
  const ok = !!(result.ok && !pageErrors.length);
  return { ok, reason: ok ? "sibling reef bed still draws" : "a missing reef bed hid its sibling", result, pageErrors };
}

async function emberDown() {
  const browser = await launch();
  const page = await newPage(browser, 1);
  await page.route("**/assets/flagship/flagship-ember.png", route => route.abort());
  await boot(page);
  const result = await page.evaluate(async () => {
    const { Theme } = await import("/js/core/Theme.js");
    const { Flagship } = await import("/js/core/Flagship.js");
    const t0 = performance.now();
    while (!Theme.flagship.ready && performance.now() - t0 < 15000) {
      await new Promise(r => setTimeout(r, 40));
    }
    const hulls = Theme.flagship.idsByRole("hull");
    const has = {};
    for (const id of hulls) has[id] = Theme.flagship.has(id);
    const ember = Theme.flagship.has("flagship-ember");
    const missing = hulls.filter(id => !has[id]);
    const ship = new Flagship();
    const bag = [];
    const orig = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (img) {
      if (img && (img.src || img.currentSrc)) bag.push(img.src || img.currentSrc);
      return orig.apply(this, arguments);
    };
    const c = document.createElement("canvas").getContext("2d");
    const sp = ship.sprite(0, null, false, true);
    const drew = !!(sp && ship.draw(c, sp, 80, 80, 30, 0.2, 1, 0.6));
    CanvasRenderingContext2D.prototype.drawImage = orig;
    const src = bag.join("\n");
    const ok = Theme.flagship.ready && !missing.length && !ember && drew
      && src.indexOf("flagship-hull") >= 0 && src.indexOf("flagship-ember") < 0;
    return { ok, ready: Theme.flagship.ready, has, ember, drew, missing };
  });
  const pageErrors = page._errs.slice();
  await browser.close();
  const ok = !!(result.ok && !pageErrors.length);
  return { ok, reason: ok ? "sibling hulls still draw" : "a missing ember hid its hulls", result, pageErrors };
}

async function main() {
  const fail = [];
  const files = filesGate();
  if (!files.ok) fail.push({ ok: false, reason: "files, hashes, or object gate", files });

  const browser = await launch();
  const page = await newPage(browser, 2);
  await page.addInitScript(hook);
  await boot(page);

  const g1 = await scene(page, { galaxy: 1, biome: "Debris Reef", tier: 1, depth: 1, zen: false, wisp: false });
  g1.pageErrors = page._errs.slice();
  g1.consoleErrors = page._logs.slice();
  if (page._errs.length || page._logs.length) fail.push({ ok: false, reason: "galaxy 1 console or page errors", errors: page._errs, logs: page._logs });
  if (!g1.reef || !g1.pipReef || !g1.pipEdible || !g1.pipBig || !g1.skyReef || !g1.bezel || !g1.player) fail.push({ ok: false, reason: "galaxy 1 paintings missing", g1 });
  if (!g1.holeDark || !g1.holeDarkerThanDisk || g1.holeWarm < 1) fail.push({ ok: false, reason: "galaxy 1 black hole missing", g1 });
  if (g1.reefGlow || g1.reefArc || g1.flagshipPaint) fail.push({ ok: false, reason: "galaxy 1 still painted a reef or a flagship in code", g1 });
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await reveal(page);
  await page.screenshot({ path: path.join(SHOT_DIR, "v912-g1-reef-390x844.png") });

  page._errs.length = 0;
  page._logs.length = 0;
  const g4 = await scene(page, { galaxy: 4, biome: "Ruined Armada", tier: 4, depth: 1, zen: false, wisp: false });
  g4.pageErrors = page._errs.slice();
  g4.consoleErrors = page._logs.slice();
  if (page._errs.length || page._logs.length) fail.push({ ok: false, reason: "galaxy 4 console or page errors", errors: page._errs, logs: page._logs });
  if (!g4.hull || !g4.ember || !g4.pipFlag || !g4.pipEdible || !g4.pipBig || !g4.skyArmada || !g4.bezel) fail.push({ ok: false, reason: "galaxy 4 paintings missing", g4 });
  if (!g4.holeDark || !g4.holeDarkerThanDisk || g4.holeWarm < 1) fail.push({ ok: false, reason: "galaxy 4 black hole missing", g4 });
  if (g4.reefGlow || g4.reefArc || g4.flagshipPaint) fail.push({ ok: false, reason: "galaxy 4 still painted a reef or a flagship in code", g4 });
  if (!g4.slice || !g4.slice.ready) fail.push({ ok: false, reason: "flagship catalog was not ready", g4 });
  await reveal(page);
  await page.screenshot({ path: path.join(SHOT_DIR, "v912-g4-armada-390x844.png") });
  await browser.close();

  const extra = await extraVariants();
  if (!extra.ok) fail.push(extra);
  const sibling = await emberDown();
  if (!sibling.ok) fail.push(sibling);
  const reefSibling = await bedDown();
  if (!reefSibling.ok) fail.push(reefSibling);

  const shots = {
    g1: path.join(SHOT_DIR, "v912-g1-reef-390x844.png"),
    g4: path.join(SHOT_DIR, "v912-g4-armada-390x844.png")
  };
  const result = { ok: fail.length === 0, files, g1, g4, extra, sibling, reefSibling, shots, fail };
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
