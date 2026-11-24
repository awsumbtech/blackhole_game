// v9.11.0 Galaxy 7 painted art: Neutron Forge draws PulsarBeam, NeutronStar,
// the pulsar radar pip, and backdrop_forge.jpg. An extra index row is drawn
// with no JS change. One failed beam PNG does not hide its sibling.
//   node tools/v911-g7-forge.cjs [port]
// Exit 0 when every check passed. Viewport 390x844. The play shot is @2x.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Browser } = require("./lib/browser.cjs");
const { chromium } = Browser.playwrightCore();

const PORT = process.argv[2] || "8111";
const CHROME = Browser.chromePath(chromium);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SHOT = "/opt/cursor/artifacts/v911-g7-forge-390x844.png";

const PRECACHE = [
  "blackhole-v9.11.0",
  "assets/pulsar/index.json",
  "assets/pulsar/pulsar-beam-cool.png",
  "assets/pulsar/pulsar-beam-ember.png",
  "assets/neutron/index.json",
  "assets/neutron/neutron-cool.png",
  "assets/neutron/neutron-ember.png",
  "assets/hud/radar/radar-pip-pulsar.png",
  "js/core/PulsarBeam.js",
  "js/core/NeutronStar.js",
  "\"9.11.0\""
];

const PROVENANCE = [
  "assets/pulsar/PROVENANCE.json",
  "assets/neutron/PROVENANCE.json",
  "assets/hud/radar/PROVENANCE.json"
];

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function staticChecks() {
  const sw = fs.readFileSync("sw.js", "utf8");
  const game = fs.readFileSync("js/game.js", "utf8");
  const worlds = fs.readFileSync("js/worlds.js", "utf8");
  const stars = fs.readFileSync("js/art/stars.js", "utf8");
  const data = fs.readFileSync("js/data/worlds.js", "utf8");
  const missing = PRECACHE.filter(s => (s === "\"9.11.0\"" ? game : sw).indexOf(s) < 0);
  if (game.indexOf('VERSION = "9.11.0"') < 0) missing.push("VERSION 9.11.0");
  const forge = worlds.slice(worlds.indexOf('"Neutron Forge"(ctx'), worlds.indexOf("export function drawWorldsOverlay"));
  const map = worlds.slice(worlds.indexOf("export function drawWorldsMinimap"), worlds.indexOf("export function worldsFeature"));
  const hashes = [];
  for (const rel of PROVENANCE) {
    const dir = path.dirname(rel);
    const prov = JSON.parse(fs.readFileSync(rel, "utf8"));
    for (const row of prov.files) {
      const file = path.resolve(dir, row.file);
      const got = sha256(file);
      if (got !== row.sha256) hashes.push({ file: row.file, got, expected: row.sha256 });
    }
  }
  const mechanics = worlds.indexOf("return W.flare > 0 ? 0.13 : 0.075") >= 0
    && worlds.indexOf('W.biome === "Neutron Forge" && W.inBeam ? 1.5 : 1') >= 0
    && data.indexOf("spin: 0.0019") >= 0;
  const retired = forge.indexOf("createRadialGradient") < 0
    && forge.indexOf("arc(") < 0
    && forge.indexOf("PulsarBeam") >= 0
    && forge.indexOf("NeutronStar") >= 0
    && map.indexOf("stroke(") < 0
    && map.indexOf("moveTo(") < 0
    && map.indexOf("landmarkRole") >= 0
    && stars.indexOf("neutron(") < 0;
  const owners = ["js/core/PulsarBeam.js", "js/core/NeutronStar.js", "js/core/RadarInstrument.js"].every(file => {
    const text = fs.readFileSync(file, "utf8");
    return text.indexOf("export class ") >= 0 && !/^function\s/m.test(text) && !/^(?:let|var|const)\s/m.test(text);
  });
  const ok = !missing.length && !hashes.length && mechanics && retired && owners;
  return {
    ok,
    reason: ok ? "precache, hashes, and the forge source match" : "static forge checks failed",
    missing, hashes, mechanics, retired, owners
  };
}

function hook() {
  const proto = CanvasRenderingContext2D.prototype;
  const origDraw = proto.drawImage;
  const origAdd = CanvasGradient.prototype.addColorStop;
  const bag = { src: [], forge: [] };
  window.__g7 = bag;
  window.__g7reset = () => { bag.src.length = 0; bag.forge.length = 0; };
  proto.drawImage = function (img) {
    if (img && img instanceof HTMLImageElement) {
      const src = img.currentSrc || img.src || "";
      if (src) bag.src.push(src);
    }
    return origDraw.apply(this, arguments);
  };
  CanvasGradient.prototype.addColorStop = function (offset, color) {
    const c = String(color);
    if (c.indexOf("200, 190, 255") >= 0 || c.indexOf("255, 190, 140") >= 0) bag.forge.push(c);
    return origAdd.call(this, offset, color);
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
  page.on("console", msg => {
    if (msg.type() === "error") errs.push("console: " + msg.text());
  });
  page._errs = errs;
  return page;
}

async function boot(page) {
  await page.goto(`${ORIGIN}/?dev&debug`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => window.__bh && window.__bh.state && window.__bh.scene, { timeout: 20000 });
  const skip = page.locator("#btn-skip-intro");
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

async function scene(page) {
  return page.evaluate(async () => {
    const bh = window.__bh;
    const s = bh.state;
    const entities = await import("/js/entities.js");
    const worlds = await import("/js/worlds.js");
    const { Theme } = await import("/js/core/Theme.js");
    const t0 = performance.now();
    while (!(Theme.pulsar.ready && Theme.neutron.ready && Theme.radar.ready) && performance.now() - t0 < 15000) {
      await new Promise(r => setTimeout(r, 40));
    }
    Object.assign(bh.dev.cfg, { galaxy: 7, biome: "Neutron Forge", tier: 1, depth: 1, zen: false, wisp: false });
    bh.dev.enter();
    bh.dev.frozen = true;
    s.paused = true;
    const info = worlds.worldsInfo();
    const lm = info && info.landmarks && info.landmarks[0];
    if (lm) {
      // Sit just off the lighthouse so its core and radar pip are not under the hole.
      s.playerX = lm.x + s.radius * 11;
      s.playerY = lm.y - s.radius * 7;
      s.camX = s.playerX;
      s.camY = s.playerY;
    }
    const anchorX = s.playerX, anchorY = s.playerY;
    const placed = [];
    const place = (id, ox, oy, radius, seed) => {
      const e = entities.createEntity(entities.typeById(id), anchorX + ox, anchorY + oy, 1);
      e.radius = radius;
      e.seed = seed;
      e.look = -1;
      e.depthT = 1;
      e._spawnAlpha = 1;
      e.vx = 0;
      e.vy = 0;
      s.entities.push(e);
      placed.push({ e, ox, oy });
      return e;
    };
    place("neutron", 70, -40, Math.max(8, s.radius * 0.55), 0);
    place("neutron", -64, 86, Math.max(8, s.radius * 0.7), 1);
    place("dust", -24, 30, Math.max(4, s.radius * 0.16), 3);
    for (let i = 0; i < 8; i++) {
      const living = await import("/js/living-world.js");
      living.updateLivingWorld(s, 1, 1);
      worlds.updateWorlds(s, 1, 1);
      entities.updateEntities(s.entities, s.bounds, 1);
    }
    for (let i = 0; i < 18; i++) worlds.updateWorlds(s, 20, 0);
    s.birth = 0;
    s.playerX = anchorX;
    s.playerY = anchorY;
    s.playerVX = 0;
    s.playerVY = 0;
    s.camX = anchorX;
    s.camY = anchorY;
    for (const p of placed) {
      p.e.x = anchorX + p.ox;
      p.e.y = anchorY + p.oy;
    }
    window.__g7reset();
    for (let i = 0; i < 3; i++) bh.scene.draw(1000 + i * 16, 1, true);
    const src = window.__g7.src;
    const needle = (n) => src.some(u => u.indexOf(n) >= 0);
    const canvas = document.getElementById("game");
    const g = canvas.getContext("2d");
    const dpr = bh.display.dpr || 1;
    const cx = Math.round(bh.display.w * 0.5 * dpr);
    const cy = Math.round(bh.display.h * 0.5 * dpr);
    const center = g.getImageData(cx, cy, 1, 1).data;
    const disk = g.getImageData(Math.max(0, cx - Math.round(26 * dpr)), cy, 1, 1).data;
    const lum = px => px[0] + px[1] + px[2];
    return {
      biome: s.biome && s.biome.name,
      ready: { pulsar: Theme.pulsar.ready, neutron: Theme.neutron.ready, radar: Theme.radar.ready },
      backdrop: needle("backdrop_forge"),
      coolBeam: needle("pulsar-beam-cool"),
      emberBeam: needle("pulsar-beam-ember"),
      coolCore: needle("neutron-cool"),
      emberCore: needle("neutron-ember"),
      pip: needle("radar-pip-pulsar"),
      bezel: needle("radar-bezel"),
      forgeGradients: window.__g7.forge.length,
      hole: lum(center) + 20 < lum(disk),
      center: lum(center),
      disk: lum(disk),
      inBeam: worlds.worldsInfo().inBeam
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
    if (bh && bh.scene) bh.scene.draw(2600, 0, true);
  });
}

async function extraVariant() {
  const browser = await launch();
  const page = await newPage(browser, 1);
  await page.route("**/assets/pulsar/index.json", async route => {
    const res = await route.fetch();
    const json = await res.json();
    json.sprites = json.sprites.concat([
      { id: "beam-extra", role: "beam", file: "pulsar-beam-extra.png", w: 1024, h: 256, pivot: [64, 128] }
    ]);
    json.variants = json.variants.concat([{ id: "beam-extra", role: "beam" }]);
    await route.fulfill({ json });
  });
  await page.route("**/assets/neutron/index.json", async route => {
    const res = await route.fetch();
    const json = await res.json();
    json.sprites = json.sprites.concat([
      { id: "core-extra", role: "core", file: "neutron-extra.png", w: 256, h: 256, pivot: [128, 128] }
    ]);
    json.variants = json.variants.concat([{ id: "core-extra", role: "core" }]);
    await route.fulfill({ json });
  });
  const alias = (from, to) => page.route(from, route => route.continue({ url: `${ORIGIN}${to}` }));
  await alias("**/assets/pulsar/pulsar-beam-extra.png", "/assets/pulsar/pulsar-beam-cool.png");
  await alias("**/assets/neutron/neutron-extra.png", "/assets/neutron/neutron-cool.png");
  await boot(page);
  const result = await page.evaluate(async () => {
    const { Theme } = await import("/js/core/Theme.js");
    const { PulsarBeam } = await import("/js/core/PulsarBeam.js");
    const { NeutronStar } = await import("/js/core/NeutronStar.js");
    const entities = await import("/js/entities.js");
    const t0 = performance.now();
    while (!(Theme.pulsar.ready && Theme.neutron.ready) && performance.now() - t0 < 15000) {
      await new Promise(r => setTimeout(r, 40));
    }
    const beams = PulsarBeam.ids();
    const cores = NeutronStar.ids();
    if (beams.indexOf("beam-extra") < 0 || cores.indexOf("core-extra") < 0) {
      return { ok: false, reason: "extra index rows were not read", beams, cores };
    }
    const bag = [];
    const orig = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (img) {
      if (img && (img.src || img.currentSrc)) bag.push(img.currentSrc || img.src || "");
      return orig.apply(this, arguments);
    };
    const c = document.createElement("canvas").getContext("2d");
    const drewBeam = PulsarBeam.jet(c, 40, 40, 0.4, beams.indexOf("beam-extra"), 480, 1, 1);
    const star = entities.createEntity(entities.typeById("neutron"), 0, 0, 1);
    star.look = cores.indexOf("core-extra");
    star.radius = 12;
    const drewCore = NeutronStar.for(star).draw(c, 80, 40, 12, 1);
    CanvasRenderingContext2D.prototype.drawImage = orig;
    const src = bag.join("\n");
    const ok = !!(drewBeam && drewCore && src.indexOf("pulsar-beam-extra") >= 0 && src.indexOf("neutron-extra") >= 0);
    return { ok, reason: ok ? "extra rows drawn" : "extra rows were not drawn", drewBeam, drewCore, beams, cores };
  });
  const pageErrors = page._errs.filter(e => e.indexOf("console:") !== 0);
  await browser.close();
  return { ok: !!(result.ok && !pageErrors.length), result, pageErrors };
}

async function emberDown() {
  const browser = await launch();
  const page = await newPage(browser, 1);
  let manifest = false;
  await page.route("**/assets/pulsar/index.json", route => {
    manifest = true;
    return route.continue();
  });
  await page.route("**/assets/pulsar/pulsar-beam-ember.png", route => {
    if (!manifest) return route.continue();
    return route.abort();
  });
  await boot(page);
  const result = await page.evaluate(async () => {
    const { Theme } = await import("/js/core/Theme.js");
    const { PulsarBeam } = await import("/js/core/PulsarBeam.js");
    const { NeutronStar } = await import("/js/core/NeutronStar.js");
    const entities = await import("/js/entities.js");
    const worlds = await import("/js/worlds.js");
    const t0 = performance.now();
    while (!Theme.pulsar.ready && performance.now() - t0 < 15000) {
      await new Promise(r => setTimeout(r, 40));
    }
    const has = {
      cool: Theme.pulsar.has("beam-cool"),
      ember: Theme.pulsar.has("beam-ember"),
      coreCool: Theme.neutron.has("core-cool"),
      coreEmber: Theme.neutron.has("core-ember")
    };
    const bh = window.__bh;
    const s = bh.state;
    Object.assign(bh.dev.cfg, { galaxy: 7, biome: "Neutron Forge", tier: 1, depth: 1, zen: false, wisp: false });
    bh.dev.enter();
    bh.dev.frozen = true;
    s.paused = true;
    const info = worlds.worldsInfo();
    const lm = info && info.landmarks && info.landmarks[0];
    if (lm) { s.playerX = lm.x; s.playerY = lm.y; s.camX = lm.x; s.camY = lm.y; }
    const star = entities.createEntity(entities.typeById("neutron"), s.playerX + 48, s.playerY - 20, 1);
    star.radius = Math.max(8, s.radius * 0.5);
    star.seed = 0;
    star.look = -1;
    star.depthT = 1;
    star._spawnAlpha = 1;
    s.entities.push(star);
    s.birth = 0;
    const bag = [];
    const orig = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (img) {
      if (img && img instanceof HTMLImageElement) bag.push(img.currentSrc || img.src || "");
      return orig.apply(this, arguments);
    };
    bh.scene.draw(1800, 1, true);
    CanvasRenderingContext2D.prototype.drawImage = orig;
    const src = bag.join("\n");
    const ok = Theme.pulsar.ready && has.cool && !has.ember && has.coreCool && has.coreEmber
      && src.indexOf("pulsar-beam-cool") >= 0
      && src.indexOf("neutron-cool") >= 0;
    return { ok, ready: Theme.pulsar.ready, has, coolBeam: src.indexOf("pulsar-beam-cool") >= 0, core: src.indexOf("neutron-cool") >= 0 };
  });
  const pageErrors = page._errs.filter(e => e.indexOf("console:") !== 0);
  await browser.close();
  const ok = !!(result.ok && !pageErrors.length);
  return { ok, reason: ok ? "sibling pngs still draw" : "a missing beam hid its siblings", result, pageErrors };
}

async function main() {
  const fail = [];
  const stat = staticChecks();
  if (!stat.ok) fail.push(stat);

  const browser = await launch();
  const page = await newPage(browser, 2);
  await page.addInitScript(hook);
  await boot(page);
  const g7 = await scene(page);
  const consoleErrors = page._errs.filter(e => e.indexOf("console:") === 0);
  const pageErrors = page._errs.filter(e => e.indexOf("console:") !== 0);
  g7.pageErrors = pageErrors;
  g7.consoleErrors = consoleErrors;
  const drawn = g7.biome === "Neutron Forge" && g7.backdrop && g7.coolBeam && g7.emberBeam
    && g7.coolCore && g7.emberCore && g7.pip && g7.bezel && g7.hole && !g7.forgeGradients
    && g7.ready.pulsar && g7.ready.neutron && g7.ready.radar;
  if (!drawn || pageErrors.length || consoleErrors.length) {
    fail.push({ ok: false, reason: "galaxy 7 did not render the paintings cleanly", g7 });
  }
  fs.mkdirSync(path.dirname(SHOT), { recursive: true });
  await reveal(page);
  await page.screenshot({ path: SHOT });
  await browser.close();

  const extra = await extraVariant();
  if (!extra.ok) fail.push(extra);
  const sibling = await emberDown();
  if (!sibling.ok) fail.push(sibling);

  const result = { ok: fail.length === 0, stat, g7, extra, sibling, shot: SHOT, fail };
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
