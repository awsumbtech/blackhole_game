// v9.13.0 Galaxy 6 Star Meadow painted art.
// Fields, bloom rings, the meadow sky, and the meadow radar pip are pictures.
//   node tools/v913-g6-meadow.cjs [port]
// Exit 0 when every check passed. Viewport 390x844 @2x.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Browser } = require("./lib/browser.cjs");
const { chromium } = Browser.playwrightCore();

const PORT = process.argv[2] || "8765";
const CHROME = Browser.chromePath(chromium);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SHOT = process.env.V913_SHOT
  || (fs.existsSync("/opt/cursor/artifacts")
    ? "/opt/cursor/artifacts/v913-g6-meadow-390x844.png"
    : path.join(require("os").tmpdir(), "v913-g6-meadow-390x844.png"));

const PRECACHE = [
  "./assets/meadow/index.json",
  "./assets/meadow/meadow-field-subtle-1.png",
  "./assets/meadow/bloom-halo-subtle-1.png",
  "./assets/meadow/bloom-halo-subtle-2.png",
  "./assets/hud/radar/radar-pip-meadow-subtle.png",
  "./js/core/MeadowField.js",
  "./js/core/BloomHalo.js"
];

const EXPECT = {
  "assets/backdrop_meadow.jpg": "c65269d287818be2675dcfaf6ee4f360fd7136c323bb90a51de2793189a539bc",
  "assets/meadow/meadow-field-subtle-1.png": "dd5d822317fc37266e6afd56ead5f2b2c0953df7f1c6a4ea6f16d84c3ede44d6",
  "assets/meadow/bloom-halo-subtle-1.png": "336485f1a492864eb0eea61efb6d9f339306cba03f24255c70b5e445ddc5d109",
  "assets/meadow/bloom-halo-subtle-2.png": "7d2023e15e95a23a44c91605e6abde06e21976a162daf1e1adabde85c524b2d0",
  "assets/hud/radar/radar-pip-meadow-subtle.png": "58b9934180db05bbfb7be892b2f0f7ecb0c7c8f1573dd458151a266084d73baf"
};

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function hook() {
  const proto = CanvasRenderingContext2D.prototype;
  const origDraw = proto.drawImage;
  const origRadial = proto.createRadialGradient;
  const origArc = proto.arc;
  const origStroke = proto.stroke;
  const bag = { src: [], meadowGlow: 0, bloomStroke: 0, budArc: 0 };
  window.__g6 = bag;
  window.__g6reset = () => {
    bag.src.length = 0;
    bag.meadowGlow = 0;
    bag.bloomStroke = 0;
    bag.budArc = 0;
  };
  const meadowGlow = (color) => {
    const c = String(color);
    return c.indexOf("255, 205, 110") >= 0 || c.indexOf("255,205,110") >= 0;
  };
  const bloomInk = (color) => {
    const c = String(color);
    return c.indexOf("255, 225, 150") >= 0 || c.indexOf("255,225,150") >= 0;
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
      if (meadowGlow(color)) bag.meadowGlow++;
      return add.apply(this, arguments);
    };
    return grad;
  };
  proto.arc = function (x, y, r) {
    this.__g6arc = { x, y, r };
    return origArc.apply(this, arguments);
  };
  proto.stroke = function () {
    const style = String(this.strokeStyle || "");
    if (bloomInk(style)) bag.bloomStroke++;
    const arc = this.__g6arc;
    if (arc && window.__bh && window.__bh.state) {
      const buds = window.__bh.state.entities || [];
      for (let i = 0; i < buds.length; i++) {
        const e = buds[i];
        if (!e || !e.bloom) continue;
        const dx = arc.x - e.x, dy = arc.y - e.y;
        if (dx * dx + dy * dy < 4) bag.budArc++;
      }
    }
    this.__g6arc = null;
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
    procedural: /createRadialGradient|createLinearGradient|\.arc\s*\(|strokeRect|lmSprite|drawGlow/.test(stripped)
  };
}

function filesGate() {
  const sw = fs.readFileSync("sw.js", "utf8");
  const game = fs.readFileSync("js/game.js", "utf8");
  const worlds = fs.readFileSync("js/worlds.js", "utf8");
  const radar = fs.readFileSync("js/core/RadarInstrument.js", "utf8");
  const missing = PRECACHE.filter(p => sw.indexOf(p) < 0);
  const cache = /CACHE_NAME = "blackhole-v9\.13\.0"/.test(sw);
  const version = /const VERSION = "9\.13\.0"/.test(game);
  const meadowDraw = worlds.slice(worlds.indexOf('"Star Meadow"(ctx'), worlds.indexOf('"Neutron Forge"(ctx'));
  const reefDraw = worlds.slice(worlds.indexOf('"Debris Reef"(ctx'), worlds.indexOf('"Comet Current"(ctx'));
  const armadaDraw = worlds.slice(worlds.indexOf('"Ruined Armada"(ctx'), worlds.indexOf('"Void Rift"(ctx'));
  const owners = ["js/core/MeadowField.js", "js/core/BloomHalo.js"].map(ownerGate);
  const hashMiss = [];
  for (const [rel, expect] of Object.entries(EXPECT)) {
    if (sha256(rel) !== expect) hashMiss.push(rel);
  }
  const provFiles = [
    ["assets/meadow/PROVENANCE.json", [
      "meadow-field-subtle-1.png",
      "bloom-halo-subtle-1.png",
      "bloom-halo-subtle-2.png",
      "../backdrop_meadow.jpg"
    ]],
    ["assets/hud/radar/PROVENANCE.json", ["radar-pip-meadow-subtle.png"]]
  ];
  const provMiss = [];
  for (const [rel, names] of provFiles) {
    const json = JSON.parse(fs.readFileSync(rel, "utf8"));
    const dir = path.dirname(rel);
    for (const name of names) {
      const row = (json.files || []).find(f => f.file === name);
      if (!row) { provMiss.push(rel + " missing " + name); continue; }
      const got = sha256(path.resolve(dir, row.file));
      if (got !== row.sha256) provMiss.push(name + " " + got);
    }
  }
  const index = JSON.parse(fs.readFileSync("assets/meadow/index.json", "utf8"));
  const halos = (index.sprites || []).filter(s => s && s.role === "halo");
  const geomOk = halos.length === 2 && halos.every(s => s.ringRadiusPx === 94 && s.sizePx === 256);
  const fieldOk = (index.sprites || []).some(s => s && s.role === "field" && s.id === "meadow-field-subtle-1");
  const roleOk = radar.indexOf('kind === "meadow"') >= 0
    && radar.indexOf('"landmark-meadow"') >= 0
    && radar.indexOf('"landmark-pulsar"') >= 0
    && radar.indexOf('"pip-edible"') >= 0
    && radar.indexOf('"pip-big"') >= 0;
  const meadowClean = meadowDraw.indexOf("MeadowField") >= 0
    && meadowDraw.indexOf("BloomHalo") >= 0
    && meadowDraw.indexOf("lmSprite") < 0
    && meadowDraw.indexOf("drawGlow") < 0
    && meadowDraw.indexOf("createRadialGradient") < 0
    && meadowDraw.indexOf("arc(") < 0;
  const others = reefDraw.indexOf("ReefBed") >= 0 && armadaDraw.indexOf("present") >= 0
    && reefDraw.indexOf("MeadowField") < 0 && armadaDraw.indexOf("BloomHalo") < 0;
  const ok = !missing.length && cache && version && !hashMiss.length && !provMiss.length
    && geomOk && fieldOk && roleOk && meadowClean && others
    && owners.every(o => o.classes === 1 && !o.looseFn && !o.looseState && !o.procedural);
  return { ok, missing, cache, version, hashMiss, provMiss, geomOk, fieldOk, roleOk, meadowClean, others, owners };
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
  await page.evaluate(async () => {
    const bh = window.__bh;
    const s = bh.state;
    const worlds = await import("/js/worlds.js");
    const living = await import("/js/living-world.js");
    const { Theme } = await import("/js/core/Theme.js");
    const t0 = performance.now();
    while (!(Theme.meadow.ready && Theme.radar.ready) && performance.now() - t0 < 15000) {
      await new Promise(r => setTimeout(r, 40));
    }
    Object.assign(bh.dev.cfg, { galaxy: 6, biome: "Star Meadow", tier: 5, depth: 1, zen: false, wisp: false });
    bh.dev.enter();
    s.paused = true;
    s.settings.reduceMotion = true;
    const info = worlds.worldsInfo();
    const lm = info && info.landmarks && info.landmarks[0];
    if (lm) {
      s.playerX = lm.x;
      s.playerY = lm.y;
      s.camX = lm.x;
      s.camY = lm.y;
    }
    for (let i = 0; i < 8; i++) {
      living.updateLivingWorld(s, 1, 1);
      worlds.updateWorlds(s, 1, 0);
    }
    for (let i = 0; i < 24; i++) worlds.updateWorlds(s, 20, 0);
    s.birth = 0;
    s.playerVX = 0;
    s.playerVY = 0;
    if (lm) {
      const shift = (lm.r || 100) * 0.55;
      s.playerX = lm.x + shift;
      s.playerY = lm.y;
      s.camX = s.playerX;
      s.camY = s.playerY;
    }
    for (const e of s.entities) {
      if (!e.bloom) continue;
      e._spawnAlpha = 1;
      e.bloom.t = Math.min(e.bloom.t, e.bloom.dur * 0.35);
    }
    const entities = await import("/js/entities.js");
    const far = Math.min(s.viewW, s.viewH) * 0.28;
    const edible = entities.createEntity(entities.typeById("dust"), s.playerX + far * 0.45, s.playerY - far * 0.2, 1);
    edible.radius = Math.max(2, s.radius * 0.22);
    edible.depthT = 1;
    edible._spawnAlpha = 1;
    s.entities.push(edible);
    const big = entities.createEntity(entities.typeById("junk"), s.playerX - far, s.playerY + far * 0.35, 1);
    big.radius = s.radius * 2.2;
    big.depthT = 1;
    big._spawnAlpha = 1;
    s.entities.push(big);
    bh.scene.draw(performance.now(), 0, true);
  });
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const bh = window.__bh;
    const s = bh.state;
    const info = bh.worlds();
    const lm = info && info.landmarks && info.landmarks[0];
    if (lm) {
      const shift = (lm.r || 100) * 0.55;
      s.playerX = lm.x + shift;
      s.playerY = lm.y;
      s.camX = s.playerX;
      s.camY = s.playerY;
      s.playerVX = 0;
      s.playerVY = 0;
    }
    window.__g6reset();
    for (let i = 0; i < 3; i++) bh.scene.draw(performance.now(), 0, true);
    const src = window.__g6.src;
    const needle = (n) => src.some(u => u.indexOf(n) >= 0);
    const badge = document.getElementById("dev-badge");
    let devHidden = true;
    if (badge) {
      const cs = getComputedStyle(badge);
      devHidden = badge.classList.contains("hidden") || cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0";
    }
    return {
      biome: s.biome && s.biome.name,
      tier: s.tier,
      field: needle("meadow-field-subtle"),
      halo: needle("bloom-halo-subtle"),
      pip: needle("radar-pip-meadow-subtle"),
      pipEdible: needle("radar-pip-edible"),
      pipBig: needle("radar-pip-big"),
      sky: needle("backdrop_meadow"),
      bezel: needle("radar-bezel"),
      meadowGlow: window.__g6.meadowGlow,
      bloomStroke: window.__g6.bloomStroke,
      budArc: window.__g6.budArc,
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

async function missingArt() {
  const browser = await launch();
  const page = await newPage(browser, 2);
  await page.addInitScript(hook);
  await page.route("**/assets/meadow/*.png", route => route.abort());
  await boot(page);
  const result = await page.evaluate(async () => {
    const bh = window.__bh;
    const s = bh.state;
    const worlds = await import("/js/worlds.js");
    const { Theme } = await import("/js/core/Theme.js");
    const { MeadowField } = await import("/js/core/MeadowField.js");
    const { BloomHalo } = await import("/js/core/BloomHalo.js");
    const t0 = performance.now();
    while (!(Theme.meadow.ready && Theme.radar.ready) && performance.now() - t0 < 15000) {
      await new Promise(r => setTimeout(r, 40));
    }
    Object.assign(bh.dev.cfg, { galaxy: 6, biome: "Star Meadow", tier: 5, depth: 1, zen: false, wisp: false });
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
    let bud = s.entities.find(e => e && e.bloom);
    if (!bud) return { ok: false, reason: "no blooming bud was planted" };
    const tStart = bud.bloom.t;
    const rStart = bud.radius;
    worlds.updateWorlds(s, 1, 40);
    const grew = bud.bloom ? (bud.bloom.t > tStart && bud.radius + 1e-4 >= rStart) : bud.radius + 1e-4 >= rStart;
    bud._spawnAlpha = 1;
    if (bud.bloom) bud.bloom.t = Math.min(bud.bloom.t, bud.bloom.dur * 0.4);
    window.__g6reset();
    const off = document.createElement("canvas").getContext("2d");
    const drewField = MeadowField.draw(off, [{ x: 0, y: 0, r: 40 }], v => v, v => v, v => v, 1, { camX: 0, camY: 0 }, 400, 800);
    const haloEntity = { x: 0, y: 0, radius: 12, seed: 3, bloom: { t: 200, dur: 1800 }, _spawnAlpha: 1 };
    const drewHalo = BloomHalo.draw(off, [haloEntity], 1, { camX: 0, camY: 0 }, 400, 800);
    bh.scene.draw(performance.now(), 0, true);
    const src = window.__g6.src.join("\n");
    const painted = src.indexOf("meadow-field-subtle") >= 0 || src.indexOf("bloom-halo-subtle") >= 0;
    const mass0 = s.mass;
    s.radius = bud.radius / (s.eatRatio || 0.88) + 6;
    s.anchorSmooth = s.radius;
    const reach = s.radius + bud.radius * 0.4;
    bud.x = s.playerX + reach * 0.9;
    bud.y = s.playerY;
    bud.vx = 0;
    bud.vy = 0;
    bud.depthT = 1;
    bud._spawnAlpha = 1;
    bh.feeding.update(1);
    const eaten = !s.entities.includes(bud) && s.mass > mass0;
    const ok = Theme.meadow.ready && !Theme.meadow.has("meadow-field-subtle-1")
      && !Theme.meadow.has("bloom-halo-subtle-1") && !Theme.meadow.has("bloom-halo-subtle-2")
      && grew && !drewField && !drewHalo && !painted
      && window.__g6.meadowGlow === 0 && window.__g6.bloomStroke === 0 && window.__g6.budArc === 0
      && eaten;
    return {
      ok,
      reason: ok ? "missing art drew nothing and the bud still bloomed and was eaten" : "missing-art resilience failed",
      ready: Theme.meadow.ready,
      grew, drewField, drewHalo, painted, eaten,
      meadowGlow: window.__g6.meadowGlow,
      bloomStroke: window.__g6.bloomStroke,
      budArc: window.__g6.budArc,
      mass: s.mass > mass0
    };
  });
  const pageErrors = page._errs.slice();
  const logs = page._logs.filter(t => !isAbortNoise(t));
  await browser.close();
  const ok = !!(result.ok && !pageErrors.length && !logs.length);
  return { ok, reason: ok ? result.reason : (result.reason || "missing art threw"), result, pageErrors, logs };
}

async function main() {
  const fail = [];
  const files = filesGate();
  if (!files.ok) fail.push({ ok: false, reason: "files, hashes, or object gate", files });

  const browser = await launch();
  const page = await newPage(browser, 2);
  await page.addInitScript(hook);
  await boot(page, "?debug");
  const g6 = await scene(page);
  g6.pageErrors = page._errs.slice();
  g6.consoleErrors = page._logs.slice();
  if (page._errs.length || page._logs.length) fail.push({ ok: false, reason: "galaxy 6 console or page errors", errors: page._errs, logs: page._logs });
  if (g6.biome !== "Star Meadow") fail.push({ ok: false, reason: "not Star Meadow", g6 });
  if (!g6.field || !g6.halo || !g6.pip || !g6.sky || !g6.bezel) fail.push({ ok: false, reason: "galaxy 6 paintings missing", g6 });
  if (!g6.pipEdible || !g6.pipBig) fail.push({ ok: false, reason: "shared radar pips missing", g6 });
  if (g6.meadowGlow || g6.bloomStroke || g6.budArc) fail.push({ ok: false, reason: "galaxy 6 still drew a meadow glow or a bloom stroke", g6 });
  if (!g6.devHidden) fail.push({ ok: false, reason: "DEV pill was visible", g6 });
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

  const missing = await missingArt();
  if (!missing.ok) fail.push(missing);

  const result = { ok: fail.length === 0, files, g6, missing, shot: SHOT, devAfter, fail };
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
