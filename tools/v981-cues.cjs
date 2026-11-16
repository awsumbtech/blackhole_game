// v9.8.1: no gold disc and no too-big ring, for every object type.
// A dev-mode scene draws a planet, a moon, debris and a ship, each both
// still too big and already a fit, plus a planet mid-merge from a back layer.
// The old disc was a radial fill of rgba(255, 214, 140). The arrival disc was
// rgba(255, 220, 160) fading to rgba(255, 200, 120). The old ring was a stroke
// of rgba(240, 130, 140), or rgba(235, 185, 110) in the soft palette.
// Ships keep liveEdge.
//   node tools/v981-cues.cjs [port] [--shots]
// Exit 0 when every check passed. Viewport 390x844.
// Chrome: /usr/bin/google-chrome. Playwright: playwright-core.

const fs = require("fs");
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "/tmp/pw/node_modules/playwright-core");

const args = process.argv.slice(2).filter(a => a !== "--shots");
const SHOTS = process.argv.includes("--shots");
const PORT = args[0] || "8097";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome";
const SHOT_DIR = path.join("docs", "shots", "v9.8.1");

const HOOK = () => {
  const stops = new WeakMap();
  const proto = CanvasRenderingContext2D.prototype;
  const origGrad = proto.createRadialGradient;
  const origFill = proto.fill;
  const origStroke = proto.stroke;
  const origDraw = proto.drawImage;
  const origAdd = CanvasGradient.prototype.addColorStop;
  const bag = { discs: [], rings: [], warm: [], edges: [] };
  window.__cues = bag;
  window.__clearCues = () => {
    bag.discs.length = 0;
    bag.rings.length = 0;
    bag.warm.length = 0;
    bag.edges.length = 0;
  };
  proto.createRadialGradient = function () {
    const g = origGrad.apply(this, arguments);
    stops.set(g, []);
    return g;
  };
  CanvasGradient.prototype.addColorStop = function (offset, color) {
    const list = stops.get(this);
    const c = String(color);
    if (list) list.push(c);
    if (c.indexOf("255, 214, 140") >= 0 || c.indexOf("255,214,140") >= 0) bag.discs.push(c);
    if (c.indexOf("255, 220, 160") >= 0 || c.indexOf("255, 200, 120") >= 0) bag.warm.push(c);
    return origAdd.call(this, offset, color);
  };
  proto.fill = function () {
    return origFill.apply(this, arguments);
  };
  proto.stroke = function () {
    const style = String(this.strokeStyle || "");
    if (style.indexOf("240, 130, 140") >= 0 || style.indexOf("235, 185, 110") >= 0) bag.rings.push(style);
    return origStroke.apply(this, arguments);
  };
  proto.drawImage = function (img) {
    if (img instanceof HTMLImageElement) {
      const src = img.currentSrc || img.src || "";
      if (src.indexOf("assets/ships/") >= 0) {
        bag.edges.push({
          src,
          n: arguments.length - 1,
          sx: arguments[1],
          sy: arguments[2],
          sw: arguments[3]
        });
      }
    }
    return origDraw.apply(this, arguments);
  };
};

async function boot(page) {
  await page.goto(`http://127.0.0.1:${PORT}/?dev&debug`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => window.__bh && window.__bh.state && window.__bh.scene, { timeout: 20000 });
  const skip = page.locator("#btn-skip-intro");
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.evaluate(() => {
    const s = document.getElementById("splash");
    if (s) s.style.display = "none";
    const t = document.getElementById("hint-toast");
    if (t) t.classList.add("hidden");
  });
}

async function proof(page) {
  return page.evaluate(async () => {
    const entities = await import("/js/entities.js");
    const ships = await import("/js/ships.js");
    const render = await import("/js/render.js");
    const { SpriteSheet } = await import("/js/core/SpriteSheet.js");
    const bh = window.__bh;
    const s = bh.state;
    Object.assign(bh.dev.cfg, { galaxy: 3, biome: "Planet Nursery", tier: 5, depth: 1, zen: false, wisp: false });
    bh.dev.enter();
    bh.dev.frozen = true;
    s.paused = true;
    s.birth = 0;
    s.drift = null;
    s.reveal = null;
    s.settings.breathGuide = false;
    s.settings.softPalette = false;
    s.active.magnet = 0;
    render.setSoftPalette(false);
    s.radius = 28;
    s.anchorSmooth = 28;
    s.anchorR = 28;
    s.playerX = 90000;
    s.playerY = 90000;
    s.camX = s.playerX;
    s.camY = s.playerY;
    bh.camera.updateScale(bh.display.w, bh.display.h, true);

    const sheet = SpriteSheet.for("cruiser");
    sheet.start();
    const t0 = performance.now();
    while (!sheet.ready) {
      if (performance.now() - t0 > 8000) return { ok: false, reason: "cruiser sheet did not decode" };
      await new Promise(r => setTimeout(r, 40));
    }

    const eat = s.eatRatio;
    const made = [];
    const placed = [];
    // nearQ <= 1 is still too big (the ring used to stroke). nearQ > 0.82 used to fill the disc.
    const plan = [
      ["planet", 0.90, -0.22, -0.16],
      ["planet", 1.12, 0.22, -0.16],
      ["moon", 0.90, -0.22, 0.12],
      ["moon", 1.12, 0.22, 0.12],
      ["junk", 0.90, -0.22, 0.30],
      ["junk", 1.12, 0.22, 0.30],
      ["craft", 0.90, 0, -0.30],
      ["craft", 1.12, 0, 0.34]
    ];
    for (const [typeId, nearQ, ox, oy] of plan) {
      const e = entities.createEntity(entities.typeById(typeId), 0, 0, 1);
      e.bigFish = true;
      e.depthT = 1;
      e.consuming = false;
      e.hot = 0;
      e.look = 0;
      e.variant = 2;
      e.rotation = 0.4;
      e.radius = s.radius / (nearQ * eat);
      e.x = s.playerX + ox * s.viewW;
      e.y = s.playerY + oy * s.viewH;
      e.vx = 0;
      e.vy = 0;
      if (typeId === "craft") {
        ships.adoptShip(e, 4, false, true);
        e.ship = "cruiser";
        e.look = 0;
        e.wreck = false;
        e.steer = true;
        e.rotation = 0;
        e.bigFish = true;
        e.depthT = 1;
      }
      made.push({ type: typeId, nearQ, tooBig: s.radius <= e.radius * eat, radius: e.radius, depthT: 1 });
      placed.push(e);
    }
    // Mid-merge: this is the object that used to wear the warm arrival disc.
    const merging = entities.createEntity(entities.typeById("planet"), 0, 0, 1);
    merging.bigFish = true;
    merging.depthT = 0.4;
    merging.depthK0 = 0.55;
    merging.consuming = false;
    merging.hot = 0;
    merging.look = 0;
    merging.variant = 2;
    merging.rotation = 0.2;
    merging.radius = s.radius / eat;
    merging.x = s.playerX + s.viewW * 0.05;
    merging.y = s.playerY - s.viewH * 0.02;
    merging.vx = 0;
    merging.vy = 0;
    made.push({ type: "planet", nearQ: 1, tooBig: s.radius <= merging.radius * eat, radius: merging.radius, depthT: merging.depthT });
    placed.push(merging);
    s.entities = placed;
    s.settings.reduceMotion = false;
    s.rivals = [];
    s.finds = [];
    s.particles = [];
    s.ripples = [];
    bh.debris.clear();

    const c = document.createElement("canvas");
    const g = c.getContext("2d");
    window.__clearCues();
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 8);
    gr.addColorStop(0, "rgba(255, 214, 140, 0.4)");
    gr.addColorStop(1, "rgba(255, 214, 140, 0)");
    const wr = g.createRadialGradient(0, 0, 0, 0, 0, 8);
    wr.addColorStop(0, "rgba(255, 220, 160, 0.2)");
    wr.addColorStop(1, "rgba(255, 200, 120, 0)");
    g.fillStyle = gr;
    g.beginPath();
    g.arc(4, 4, 4, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(2, 2, 2, 0, Math.PI * 2);
    g.strokeStyle = "rgba(240, 130, 140, 0.3)";
    g.stroke();
    g.beginPath();
    g.arc(3, 3, 2, 0, Math.PI * 2);
    g.strokeStyle = "rgba(235, 185, 110, 0.3)";
    g.stroke();
    const probe = { discs: window.__cues.discs.length, rings: window.__cues.rings.length, warm: window.__cues.warm.length };
    window.__clearCues();

    const toast = document.getElementById("hint-toast");
    if (toast) toast.classList.add("hidden");
    bh.scene.draw(performance.now(), 0, true);
    const plain = {
      discs: window.__cues.discs.length,
      rings: window.__cues.rings.length,
      warm: window.__cues.warm.length,
      edges: window.__cues.edges.filter(d => d.sw === 320 && d.sx === 640).length
    };
    window.__clearCues();
    render.setSoftPalette(true);
    bh.scene.draw(performance.now(), 0, true);
    const soft = { discs: window.__cues.discs.length, rings: window.__cues.rings.length, warm: window.__cues.warm.length };
    render.setSoftPalette(false);
    window.__clearCues();

    const hookOk = probe.discs >= 1 && probe.rings >= 2 && probe.warm >= 1;
    const noDisc = plain.discs === 0 && soft.discs === 0;
    const noRing = plain.rings === 0 && soft.rings === 0;
    const noWarm = plain.warm === 0 && soft.warm === 0;
    const edgeKept = plain.edges >= 2;
    const mergingOk = made.some(m => m.depthT > 0 && m.depthT < 1);
    const covered = ["planet", "moon", "junk", "craft"].every(t =>
      made.some(m => m.type === t && m.tooBig && m.depthT === 1) && made.some(m => m.type === t && !m.tooBig && m.depthT === 1));
    const ok = hookOk && noDisc && noRing && noWarm && edgeKept && covered && mergingOk;
    let reason = "clear";
    if (!hookOk) reason = "canvas hook did not see a probe disc, ring and warm stop";
    else if (!noDisc) reason = "a gold disc was drawn";
    else if (!noRing) reason = "a too-big ring was drawn";
    else if (!noWarm) reason = "a warm arrival disc was drawn";
    else if (!edgeKept) reason = "ship liveEdge was not drawn";
    else if (!mergingOk) reason = "scene had no merging object";
    else if (!covered) reason = "scene missed a type or a size";
    return { ok, reason, probe, plain, soft, made, eat, version: bh.version || null };
  });
}

async function shot(page, file, spec) {
  await page.evaluate(async (spec) => {
    const entities = await import("/js/entities.js");
    const ships = await import("/js/ships.js");
    const { SpriteSheet } = await import("/js/core/SpriteSheet.js");
    const bh = window.__bh;
    const s = bh.state;
    bh.dev.frozen = true;
    s.paused = true;
    s.birth = 0;
    s.drift = null;
    s.reveal = null;
    s.settings.breathGuide = false;
    s.active.magnet = 0;
    s.playerX = 90000;
    s.playerY = 90000;
    s.camX = s.playerX;
    s.camY = s.playerY;
    s.radius = 28;
    s.anchorSmooth = 28;
    s.anchorR = 28;
    bh.camera.updateScale(bh.display.w, bh.display.h, true);
    const e = entities.createEntity(entities.typeById(spec.type), 0, 0, 1);
    e.bigFish = true;
    e.depthT = 1;
    e.consuming = false;
    e.hot = 0;
    e.look = spec.look;
    e.variant = spec.variant;
    e.rotation = spec.rotation;
    e.radius = s.radius / (spec.nearQ * s.eatRatio);
    e.x = s.playerX;
    e.y = s.playerY - s.viewH * 0.2;
    e.vx = 0;
    e.vy = 0;
    if (spec.type === "craft") {
      ships.adoptShip(e, 5, false, true);
      e.ship = "capital";
      e.look = 0;
      e.wreck = false;
      e.steer = true;
      e.rotation = 0;
      e.bigFish = true;
      e.depthT = 1;
      const sheet = SpriteSheet.for("capital");
      sheet.start();
      const t0 = performance.now();
      while (!sheet.ready && performance.now() - t0 < 8000) await new Promise(r => setTimeout(r, 40));
    }
    s.entities = [e];
    s.rivals = [];
    s.finds = [];
    s.particles = [];
    s.ripples = [];
    bh.debris.clear();
    const toast = document.getElementById("hint-toast");
    if (toast) toast.classList.add("hidden");
    bh.scene.draw(performance.now(), 0, true);
  }, spec);
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const dest = path.join(SHOT_DIR, file);
  await page.screenshot({ path: dest });
  const buf = fs.readFileSync(dest);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return { file: dest, bytes: buf.length, w, h };
}

async function run() {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  const page = await (await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block"
  })).newPage();
  await page.addInitScript(HOOK);
  const errors = [];
  page.on("pageerror", err => errors.push(String(err)));
  let result;
  try {
    await boot(page);
    result = await proof(page);
    if (SHOTS && result && result.ok) {
      result.shots = [
        await shot(page, "phone-big-catch-planet.png", {
          type: "planet", nearQ: 1.08, look: 0, variant: 2, rotation: 0.2
        }),
        await shot(page, "phone-toobig-ship.png", {
          type: "craft", nearQ: 0.9, look: 0, variant: 0, rotation: 0
        })
      ];
      const sizeOk = result.shots.every(s => s.w === 390 && s.h === 844);
      if (!sizeOk) {
        result.ok = false;
        result.reason = "shot was not 390x844";
      }
    }
  } catch (err) {
    result = { ok: false, reason: String(err && err.stack || err) };
  }
  result.pageErrors = errors;
  if (errors.length) result.ok = false;
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  process.exit(result.ok ? 0 : 1);
}

run();
