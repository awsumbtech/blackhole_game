// v9.10.0 Galaxy 2 painted art: manifests survive an outage, Galaxy 2 and
// Galaxy 1 draw the paintings, and the old radar rects / edge triangles stay gone.
//   node tools/v910-g2-art.cjs [port] [--shots]
// Exit 0 when every check passed. Viewport 390x844.

const fs = require("fs");
const path = require("path");
const { Browser } = require("./lib/browser.cjs");
const { chromium } = Browser.playwrightCore();

const args = process.argv.slice(2).filter(a => a !== "--shots");
const SHOTS = process.argv.includes("--shots");
const PORT = args[0] || "8100";
const CHROME = Browser.chromePath(chromium);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SHOT_DIR = path.join("docs", "shots", "v9.10.0");

const INDEXES = [
  ["comets", "**/assets/comets/manifest.json"],
  ["rocks", "**/assets/rocks/manifest.json"],
  ["dust", "**/assets/dust/manifest.json"],
  ["current", "**/assets/current/manifest.json"],
  ["radar", "**/assets/hud/radar/manifest.json"]
];

function hook() {
  const proto = CanvasRenderingContext2D.prototype;
  const origDraw = proto.drawImage;
  const origRect = proto.strokeRect;
  const origFillRect = proto.fillRect;
  const origAdd = CanvasGradient.prototype.addColorStop;
  const origStroke = proto.stroke;
  const bag = { src: [], strokeRect: 0, tinyFill: 0, discs: [], rings: [] };
  window.__g2 = bag;
  window.__g2reset = () => {
    bag.src.length = 0;
    bag.strokeRect = 0;
    bag.tinyFill = 0;
    bag.discs.length = 0;
    bag.rings.length = 0;
  };
  proto.drawImage = function (img) {
    if (img && img instanceof HTMLImageElement) {
      const src = img.currentSrc || img.src || "";
      if (src) bag.src.push(src);
    }
    return origDraw.apply(this, arguments);
  };
  proto.strokeRect = function () {
    if (this.canvas && this.canvas.id === "game") bag.strokeRect++;
    return origRect.apply(this, arguments);
  };
  proto.fillRect = function (x, y, w, h) {
    if (this.canvas && this.canvas.id === "game" && w > 0 && h > 0 && w < 6 && h < 6) bag.tinyFill++;
    return origFillRect.apply(this, arguments);
  };
  CanvasGradient.prototype.addColorStop = function (offset, color) {
    const c = String(color);
    if (c.indexOf("255, 214, 140") >= 0 || c.indexOf("255,214,140") >= 0) bag.discs.push(c);
    if (c.indexOf("255, 220, 160") >= 0 || c.indexOf("255, 200, 120") >= 0) bag.discs.push(c);
    return origAdd.call(this, offset, color);
  };
  proto.stroke = function () {
    const style = String(this.strokeStyle || "");
    if (style.indexOf("240, 130, 140") >= 0 || style.indexOf("235, 185, 110") >= 0) bag.rings.push(style);
    return origStroke.apply(this, arguments);
  };
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
    deviceScaleFactor: dpr || 1,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block"
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  page._errs = errs;
  return page;
}

async function boot(page, query) {
  await page.goto(`${ORIGIN}/${query || "?dev&debug"}`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => window.__bh && window.__bh.state && window.__bh.scene, { timeout: 20000 });
  const skip = page.locator("#btn-skip-intro");
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

function has(src, needle) {
  return src.some(s => s.indexOf(needle) >= 0);
}

async function outage() {
  const browser = await launch();
  const page = await newPage(browser, 1);
  for (const [, glob] of INDEXES) await page.route(glob, route => route.abort());
  await boot(page);
  const first = await page.evaluate(() => {
    const s = window.__bh.state;
    return { screen: s.screen, scene: !!window.__bh.scene };
  });
  const spawned = await page.evaluate(async () => {
    const entities = await import("/js/entities.js");
    const bh = window.__bh;
    const s = bh.state;
    Object.assign(bh.dev.cfg, { galaxy: 2, biome: "Comet Current", tier: 1, depth: 1, zen: false, wisp: false });
    bh.dev.enter();
    s.paused = true;
    const e = entities.createEntity(entities.typeById("comet"), s.playerX + 40, s.playerY, 1);
    e.radius = s.radius * 0.45;
    e.depthT = 1;
    e.seed = 3;
    s.entities.push(e);
    const before = s.mass;
    s.radius = e.radius / (s.eatRatio || 0.88) + 4;
    s.anchorSmooth = s.radius;
    const reach = s.radius + e.radius * 0.4;
    e.x = s.playerX + reach * 0.99;
    e.y = s.playerY;
    e.vx = 0;
    e.vy = 0;
    bh.feeding.update(1);
    return { eaten: !s.entities.includes(e), mass: s.mass > before };
  });
  for (const [, glob] of INDEXES) await page.unroute(glob);
  const recovered = await page.evaluate(async () => {
    const { Theme } = await import("/js/core/Theme.js");
    const { Comet } = await import("/js/core/Comet.js");
    const { SpaceRock } = await import("/js/core/SpaceRock.js");
    const { SpaceDust } = await import("/js/core/SpaceDust.js");
    const entities = await import("/js/entities.js");
    const t0 = performance.now();
    while (!(Theme.comets.ready && Theme.rocks.ready && Theme.dust.ready && Theme.current.ready && Theme.radar.ready) && performance.now() - t0 < 15000) {
      await new Promise(r => setTimeout(r, 80));
    }
    const ready = {
      comets: Theme.comets.ready, rocks: Theme.rocks.ready, dust: Theme.dust.ready,
      current: Theme.current.ready, radar: Theme.radar.ready
    };
    if (!ready.comets || !ready.rocks || !ready.dust || !ready.current || !ready.radar) {
      return { ok: false, reason: "a painted index did not recover", ready };
    }
    const s = window.__bh.state;
    const comet = entities.createEntity(entities.typeById("comet"), 0, 0, 1);
    comet.seed = 2;
    comet.radius = 12;
    const rock = entities.createEntity(entities.typeById("junk"), 0, 0, 1);
    rock.seed = 8;
    rock.look = 1;
    rock.radius = 10;
    const dust = entities.createEntity(entities.typeById("dust"), 0, 0, 1);
    dust.seed = 4;
    dust.radius = 6;
    const c = document.createElement("canvas").getContext("2d");
    const drew = {
      comet: Comet.for(comet).draw(c, 40, 40, 12, 1),
      rock: SpaceRock.for(rock).draw(c, 40, 40, 10, 1),
      dust: SpaceDust.for(dust).draw(c, 40, 40, 6, 1)
    };
    return { ok: drew.comet && drew.rock && drew.dust, ready, drew };
  });
  const pageErrors = page._errs.slice();
  await browser.close();
  const ok = !!(first.scene && spawned.eaten && spawned.mass && recovered.ok && !pageErrors.length);
  return {
    ok,
    reason: ok ? "indexes recovered" : (recovered.reason || "outage recovery failed"),
    first, spawned, recovered, pageErrors
  };
}

async function scene(page, cfg) {
  return page.evaluate(async (cfg) => {
    const bh = window.__bh;
    const s = bh.state;
    const entities = await import("/js/entities.js");
    const worlds = await import("/js/worlds.js");
    Object.assign(bh.dev.cfg, cfg);
    bh.dev.enter();
    bh.dev.frozen = true;
    s.paused = true;
    const info = worlds.worldsInfo();
    const lm = info && info.landmarks && info.landmarks[0];
    if (lm) {
      s.playerX = lm.x;
      s.playerY = lm.y;
      s.camX = s.playerX;
      s.camY = s.playerY;
    }
    const place = (id, ox, oy, radius, seed, look, vx) => {
      const e = entities.createEntity(entities.typeById(id), s.playerX + ox, s.playerY + oy, 1);
      e.radius = radius;
      e.seed = seed;
      e.look = look;
      e.depthT = 1;
      e._spawnAlpha = 1;
      e.vx = vx;
      e.vy = 0.05;
      s.entities.push(e);
      return e;
    };
    if (cfg.biome === "Comet Current") {
      place("comet", 78, -36, s.radius * 0.62, 2, 0, 0.55);
      place("comet", -70, 90, s.radius * 0.7, 5, 1, -0.2);
      place("junk", -90, -120, s.radius * 0.85, 11, 1, 0.02);
      place("junk", 40, 130, s.radius * 0.28, 4, 0, 0);
      place("junk", -30, 40, s.radius * 0.22, 9, 2, 0);
      place("meteor", 120, 60, s.radius * 0.34, 7, 0, 0.1);
      place("dust", -20, -50, s.radius * 0.16, 3, 0, 0);
    } else {
      place("junk", -80, -90, s.radius * 0.7, 15, 1, 0);
      place("junk", 50, 70, s.radius * 0.3, 6, 2, 0);
      place("dust", -10, 30, s.radius * 0.18, 1, 0, 0);
      place("dust", 30, -40, s.radius * 0.14, 8, 3, 0);
    }
    // An edible speck just off the left edge, so an edge cue has somewhere to point.
    const off = entities.createEntity(entities.typeById("dust"), s.playerX - s.viewW, s.playerY - 30, 1);
    off.radius = Math.max(2, s.radius * 0.2);
    off.depthT = 1;
    off._spawnAlpha = 1;
    s.entities.push(off);
    for (let i = 0; i < 8; i++) {
      const living = await import("/js/living-world.js");
      living.updateLivingWorld(s, 1, 1);
      worlds.updateWorlds(s, 1, 1);
      entities.updateEntities(s.entities, s.bounds, 1);
    }
    // Let the landmark caption finish so the shot is the sky, not the name.
    for (let i = 0; i < 18; i++) worlds.updateWorlds(s, 20, 0);
    window.__g2reset();
    for (let i = 0; i < 3; i++) bh.scene.draw(1000 + i * 16, 1, true);
    const src = window.__g2.src;
    const needle = (n) => src.some(u => u.indexOf(n) >= 0);
    return {
      biome: s.biome && s.biome.name,
      tier: s.tier,
      strokeRect: window.__g2.strokeRect,
      tinyFill: window.__g2.tinyFill,
      discs: window.__g2.discs.length,
      rings: window.__g2.rings.length,
      comet: needle("comet-nucleus") && needle("comet-tail") && needle("comet-coma"),
      rock: needle("pebble-"),
      dust: needle("dust-wisp"),
      current: needle("current-wisp"),
      mote: needle("current-mote"),
      radar: needle("radar-bezel") && needle("radar-player") && needle("radar-pip"),
      errors: 0
    };
  }, cfg);
}

async function sourceGate(page) {
  return page.evaluate(async () => {
    const render = await (await fetch("/js/render.js")).text();
    const worlds = await (await fetch("/js/worlds.js")).text();
    const edge = render.slice(render.indexOf("export function drawEdgeIndicators"), render.indexOf("export function drawCursor"));
    const mini = render.slice(render.indexOf("export function drawMinimap"), render.indexOf("export function drawEdgeIndicators"));
    const map = worlds.slice(worlds.indexOf("export function drawWorldsMinimap"), worlds.indexOf("export function worldsFeature"));
    return {
      edgeClean: edge.indexOf("lineTo") < 0 && edge.indexOf("closePath") < 0 && edge.indexOf("EdgeCue") >= 0,
      miniClean: mini.indexOf("strokeRect") < 0 && mini.indexOf("fillRect") < 0 && mini.indexOf("RadarInstrument") >= 0,
      mapClean: map.indexOf("stroke(") < 0 && map.indexOf("polyline") < 0 && map.indexOf("RadarInstrument") >= 0
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
    if (window.__bh && window.__bh.scene) window.__bh.scene.draw(2400, 0, true);
  });
}

async function main() {
  const fail = [];
  const browser = await launch();
  const out = await outage();
  if (!out.ok) fail.push(out);

  const page = await newPage(browser, SHOTS ? 2 : 1);
  await page.addInitScript(hook);
  await boot(page);
  const gate = await sourceGate(page);
  if (!gate.edgeClean || !gate.miniClean || !gate.mapClean) fail.push({ ok: false, reason: "code-drawn radar or edge path still present", gate });

  const g2 = await scene(page, { galaxy: 2, biome: "Comet Current", tier: 1, depth: 1, zen: false, wisp: false });
  g2.pageErrors = page._errs.slice();
  if (page._errs.length) fail.push({ ok: false, reason: "galaxy 2 page errors", errors: page._errs });
  if (!g2.comet || !g2.rock || !g2.current || !g2.radar || !g2.mote) fail.push({ ok: false, reason: "galaxy 2 paintings missing", g2 });
  if (g2.strokeRect || g2.tinyFill || g2.discs || g2.rings) fail.push({ ok: false, reason: "galaxy 2 still drew a rect, disc or ring", g2 });
  if (SHOTS) {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await reveal(page);
    await page.screenshot({ path: path.join(SHOT_DIR, "g2-comet-current.png") });
  }

  page._errs.length = 0;
  const g1 = await scene(page, { galaxy: 1, biome: "Debris Reef", tier: 1, depth: 1, zen: false, wisp: false });
  g1.pageErrors = page._errs.slice();
  if (page._errs.length) fail.push({ ok: false, reason: "galaxy 1 page errors", errors: page._errs });
  if (!g1.rock || !g1.dust || !g1.radar || !g1.mote) fail.push({ ok: false, reason: "galaxy 1 shared paintings missing", g1 });
  if (g1.strokeRect || g1.tinyFill || g1.discs || g1.rings) fail.push({ ok: false, reason: "galaxy 1 still drew a rect, disc or ring", g1 });
  if (SHOTS) {
    await reveal(page);
    await page.screenshot({ path: path.join(SHOT_DIR, "g1-debris-reef.png") });
  }
  await browser.close();

  const cleanBrowser = await launch();
  const clean = await newPage(cleanBrowser, SHOTS ? 2 : 1);
  await clean.goto(`${ORIGIN}/`, { waitUntil: "load", timeout: 30000 });
  await clean.waitForFunction(() => window.__bh && window.__bh.state, { timeout: 20000 });
  const skip = clean.locator("#btn-skip-intro");
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await clean.waitForTimeout(400);
  const dev = await clean.evaluate(() => {
    const b = document.getElementById("dev-badge");
    if (!b) return { present: false, hidden: true };
    const cs = getComputedStyle(b);
    const hidden = b.classList.contains("hidden") || cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0";
    return { present: true, hidden, text: b.textContent };
  });
  if (!dev.hidden || clean._errs.length) fail.push({ ok: false, reason: "clean load showed DEV or threw", dev, errors: clean._errs });
  if (SHOTS) await clean.screenshot({ path: path.join(SHOT_DIR, "clean-load.png") });
  await cleanBrowser.close();

  const result = { ok: fail.length === 0, out, gate, g2, g1, dev, fail };
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
