// Art comes from the manifests. Adding a ship or a planet is a manifest entry.
//   node tools/oo-manifest.cjs [port] [--shots]
// Exit 0 on the branch. On main, planet painters still fill a body, so this fails.
// Viewport 390x844. Chrome: /usr/bin/google-chrome. Playwright: playwright-core.

const fs = require("fs");
const path = require("path");
const { Browser } = require("./lib/browser.cjs");
const { chromium } = Browser.playwrightCore();

const args = process.argv.slice(2).filter(a => a !== "--shots");
const SHOTS = process.argv.includes("--shots");
const PORT = args[0] || "8098";
const CHROME = Browser.chromePath(chromium);
const SHOT_DIR = path.join("docs", "shots", "v9.9.0");
const ORIGIN = `http://127.0.0.1:${PORT}`;

class OoManifest {
  static hook = function () {
    const proto = CanvasRenderingContext2D.prototype;
    const orig = proto.drawImage;
    const bag = [];
    proto.drawImage = function (img) {
      if (img instanceof HTMLImageElement) {
        bag.push({ src: img.currentSrc || img.src || "" });
      }
      return orig.apply(this, arguments);
    };
    window.__artDraws = bag;
  };

  static async boot(page) {
    await page.goto(`${ORIGIN}/?dev&debug`, { waitUntil: "load", timeout: 30000 });
    await page.waitForFunction(() => window.__bh && window.__bh.state && window.__bh.scene, { timeout: 20000 });
    const skip = page.locator("#btn-skip-intro");
    if (await skip.isVisible().catch(() => false)) await skip.click();
  }

  static async installRoutes(page) {
    await page.route("**/assets/ships/manifest.json", async route => {
      const res = await route.fetch();
      const json = await res.json();
      json.classes = json.classes.concat([{ class: "probe", extent: 1.48 }]);
      await route.fulfill({ json });
    });
    await page.route("**/assets/ships/probe.json", route => route.continue({ url: `${ORIGIN}/assets/ships/courier.json` }));
    await page.route("**/assets/ships/probe.webp", route => route.continue({ url: `${ORIGIN}/assets/ships/courier.webp` }));
    await page.route("**/assets/planets/manifest.json", async route => {
      const res = await route.fetch();
      const json = await res.json();
      json.types = json.types.concat([{ type: "test-gem", manifest: "test-gem/v1/manifest.json" }]);
      await route.fulfill({ json });
    });
    await page.route("**/assets/planets/test-gem/v1/manifest.json", async route => {
      const res = await route.fetch({ url: `${ORIGIN}/assets/planets/test-crystal/v1/manifest.json` });
      const json = await res.json();
      json.type = "test-gem";
      json.test = false;
      await route.fulfill({ json });
    });
    await page.route("**/assets/planets/test-gem/v1/body.png", route => route.continue({ url: `${ORIGIN}/assets/planets/test-crystal/v1/body.png` }));
    for (let i = 0; i < 4; i++) {
      await page.route(`**/assets/planets/test-gem/v1/debris${i}.png`, route => route.continue({ url: `${ORIGIN}/assets/planets/test-crystal/v1/debris${i}.png` }));
    }
  }

  static async proof(page) {
    return page.evaluate(async () => {
      let painters = null;
      try { painters = await import("/js/art/planets.js"); } catch { painters = null; }
      if (painters && painters.PLANET_PAINTERS) {
        const c = document.createElement("canvas");
        c.width = c.height = 128;
        const g = c.getContext("2d");
        let fills = 0;
        const orig = g.fill.bind(g);
        g.fill = (...a) => { fills++; return orig(...a); };
        const moon = painters.PLANET_PAINTERS.moon;
        const rand = () => 0.3;
        if (moon) moon(g, 40, { seed: 1 }, rand, 0, 0);
        return { ok: false, reason: "planet painter filled a body", fills };
      }

      const { Theme } = await import("/js/core/Theme.js");
      const { ShipCatalog } = await import("/js/core/ShipCatalog.js");
      const { Body } = await import("/js/core/Body.js");
      const { Ship } = await import("/js/core/Ship.js");
      const entities = await import("/js/entities.js");
      let shipsMod = {};
      try { shipsMod = await import("/js/ships.js"); } catch { shipsMod = {}; }
      const bh = window.__bh;
      const s = bh.state;
      if (shipsMod.SHIP_CLASSES || shipsMod.shipClassFor || shipsMod.EXTENT) {
        return { ok: false, reason: "ship class list still lives in ships.js" };
      }
      if (!ShipCatalog.playable().includes("probe")) {
        return { ok: false, reason: "probe ship was not read from the manifest", classes: ShipCatalog.names() };
      }
      const high = [8, 9, 12, 99].map(tier => ShipCatalog.classFor(tier, false, 0));
      if (high.some(name => name !== "capital")) {
        return { ok: false, reason: "capital was not reachable at tier 8+ after adding a sixth class", high, classes: ShipCatalog.playable() };
      }
      if (!ShipCatalog.playable().includes("probe")) {
        return { ok: false, reason: "sixth class via data was not playable", classes: ShipCatalog.playable() };
      }
      if (!Theme.planets.has("test-gem")) {
        return { ok: false, reason: "test-gem was not read from the planet index", types: Theme.planets.names() };
      }
      const names = Theme.planets.playable();
      const gemAt = names.indexOf("test-gem");
      if (gemAt < 0) return { ok: false, reason: "test-gem is not playable", names };

      Object.assign(bh.dev.cfg, { galaxy: 3, biome: "Planet Nursery", tier: 5, depth: 1, zen: false, wisp: false });
      bh.dev.enter();
      bh.dev.frozen = true;
      s.paused = true;

      const planet = entities.createEntity(entities.typeById("planet"), 0, 0, 1);
      planet.seed = gemAt;
      planet.artType = Theme.planets.pick(gemAt);
      planet.depthT = 1;
      planet.radius = 30;
      planet.x = s.camX;
      planet.y = s.camY - s.viewH * 0.2;
      const art = Theme.planets.get("test-gem");
      art.start();
      const t0 = performance.now();
      while (!art.ready && performance.now() - t0 < 8000) await new Promise(r => setTimeout(r, 40));
      if (!Body.for(planet).ready()) return { ok: false, reason: "test-gem did not become edible" };

      const ship = entities.createEntity(entities.typeById("craft"), 0, 0, 1);
      ShipCatalog.adopt(ship, 99, false, false, 0);
      if (ship.ship !== "capital") {
        return { ok: false, reason: "adopt at tier 99 did not keep capital after adding a sixth class", got: ship.ship };
      }
      ship.ship = "probe";
      ship.depthT = 1;
      ship.steer = false;
      ship.rotation = 0;
      ship.radius = 24;
      ship.x = s.camX + s.viewW * 0.15;
      ship.y = s.camY - s.viewH * 0.2;
      const sheet = (await import("/js/core/SpriteSheet.js")).SpriteSheet.for("probe");
      sheet.start();
      const t1 = performance.now();
      while (!sheet.ready && performance.now() - t1 < 8000) await new Promise(r => setTimeout(r, 40));
      if (!Ship.for(ship).ready()) return { ok: false, reason: "probe ship did not become edible" };

      const isolated = document.createElement("canvas");
      isolated.width = isolated.height = 200;
      const g = isolated.getContext("2d");
      let fills = 0;
      const orig = g.fill.bind(g);
      g.fill = (...a) => { fills++; return orig(...a); };
      window.__artDraws.length = 0;
      Body.for(planet).draw(g, 100, 100, 40, 1);
      Ship.for(ship).draw(g, 100, 100, 80, 1, 0.5, true, 0, 1, 0.82);
      const srcs = window.__artDraws.map(d => d.src);
      const gem = srcs.some(src => src.includes("assets/planets/test-gem/"));
      const probe = srcs.some(src => src.includes("assets/ships/probe.webp"));
      const bodySkippedDebris = srcs.every(src => !src.includes("debris"));
      bh.debris.clear();
      window.__artDraws.length = 0;
      bh.debris.spawn(planet);
      s.entities = [];
      bh.scene.draw(performance.now(), 0, true);
      const debrisSrc = window.__artDraws.map(d => d.src).filter(src => src.includes("assets/planets/test-gem/v1/debris"));
      const debrisOk = debrisSrc.length === 4;
      const bite = async (kind, typeName) => {
        const cat = kind === "moon" ? Theme.moons : Theme.planets;
        const ent = entities.createEntity(entities.typeById(kind), s.playerX, s.playerY, 1);
        ent.artType = typeName;
        ent.depthT = 1;
        ent.radius = 18;
        const piece = cat.get(typeName);
        piece.start();
        const t = performance.now();
        while (!piece.ready && performance.now() - t < 8000) await new Promise(r => setTimeout(r, 40));
        window.__artDraws.length = 0;
        Body.for(ent).draw(g, 30, 30, 16, 1);
        const bodyClean = window.__artDraws.every(d => !d.src.includes("debris"));
        bh.debris.clear();
        bh.debris.spawn(ent);
        const born = bh.debris.pieces.filter(p => p.on);
        const life = born.length ? Math.max(...born.map(p => p.life)) : 0;
        if (born.length === 4) bh.debris.update(life * 0.35, false);
        const stillThere = bh.debris.pieces.filter(p => p.on).length;
        bh.debris.update(life + 1, false);
        return { ready: !!piece.ready, pieces: born.length, bodyClean, stillThere, left: bh.debris.live };
      };
      const planetBite = await bite("planet", "rust-desert");
      const moonBite = await bite("moon", "grey-cratered");
      const bitesOk = planetBite.pieces === 4 && planetBite.bodyClean && planetBite.stillThere === 4 && planetBite.left === 0
        && moonBite.pieces === 4 && moonBite.bodyClean && moonBite.stillThere === 4 && moonBite.left === 0;
      const ok = gem && probe && fills === 0 && bodySkippedDebris && planet.artType === "test-gem" && ship.ship === "probe" && debrisOk && bitesOk;
      return { ok, reason: ok ? "manifest" : "new entries did not draw from their files", gem, probe, fills, bodySkippedDebris, debris: debrisSrc.length, planetBite, moonBite, artType: planet.artType, ship: ship.ship };
    });
  }

  static async shot(page, file) {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.waitForFunction(() => {
      const s = document.getElementById("splash");
      if (!s) return true;
      const cs = getComputedStyle(s);
      return cs.visibility === "hidden" || cs.opacity === "0";
    }, { timeout: 5000 }).catch(() => {});
    const dest = path.join(SHOT_DIR, file);
    await page.screenshot({ path: dest });
    const buf = fs.readFileSync(dest);
    return { file, w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }

  static async pictures(page) {
    const out = [];
    const place = async (setup) => {
      await page.evaluate(setup);
    };
    await place(async () => {
      const bh = window.__bh;
      const s = bh.state;
      Object.assign(bh.dev.cfg, { galaxy: 3, biome: "Planet Nursery", tier: 5, depth: 1, zen: false, wisp: false });
      bh.dev.enter();
      bh.dev.frozen = true;
      s.paused = true;
      const { Body } = await import("/js/core/Body.js");
      const t0 = performance.now();
      while (performance.now() - t0 < 8000) {
        const planet = s.entities.find(e => e.type === "planet" && Body.for(e).ready());
        if (planet) break;
        await new Promise(r => setTimeout(r, 40));
      }
      bh.scene.draw(performance.now(), 0, true);
    });
    out.push(await this.shot(page, "01-nursery-planets.png"));

    await place(async () => {
      const bh = window.__bh;
      const s = bh.state;
      const entities = await import("/js/entities.js");
      const { Theme } = await import("/js/core/Theme.js");
      const { Body } = await import("/js/core/Body.js");
      Object.assign(bh.dev.cfg, { galaxy: 3, biome: "Planet Nursery", tier: 6, depth: 1, zen: false, wisp: false });
      bh.dev.enter();
      bh.dev.frozen = true;
      s.paused = true;
      s.radius = 6;
      s.anchorSmooth = 6;
      bh.camera.updateScale(bh.display.w, bh.display.h, true);
      const e = entities.createEntity(entities.typeById("planet"), 0, 0, 1);
      e.artType = "banded-ringed-giant";
      e.depthT = 1;
      e.radius = 28;
      e.x = s.playerX;
      e.y = s.playerY - s.viewH * 0.12;
      const art = Theme.planets.get(e.artType);
      art.start();
      const t0 = performance.now();
      while (!art.ready && performance.now() - t0 < 8000) await new Promise(r => setTimeout(r, 40));
      s.entities = [e];
      Body.for(e);
      bh.scene.draw(performance.now(), 0, true);
    });
    out.push(await this.shot(page, "02-ringed-giant.png"));

    await place(async () => {
      const bh = window.__bh;
      const s = bh.state;
      const entities = await import("/js/entities.js");
      const { Theme } = await import("/js/core/Theme.js");
      Object.assign(bh.dev.cfg, { galaxy: 3, biome: "Planet Nursery", tier: 4, depth: 1, zen: false, wisp: false });
      bh.dev.enter();
      bh.dev.frozen = true;
      s.paused = true;
      s.radius = 6;
      s.anchorSmooth = 6;
      bh.camera.updateScale(bh.display.w, bh.display.h, true);
      const e = entities.createEntity(entities.typeById("moon"), 0, 0, 1);
      e.artType = "grey-cratered";
      e.depthT = 1;
      e.radius = 22;
      e.x = s.playerX;
      e.y = s.playerY - s.viewH * 0.16;
      const art = Theme.moons.get(e.artType);
      art.start();
      const t0 = performance.now();
      while (!art.ready && performance.now() - t0 < 8000) await new Promise(r => setTimeout(r, 40));
      s.entities = [e];
      bh.scene.draw(performance.now(), 0, true);
    });
    out.push(await this.shot(page, "03-moon.png"));

    await place(async () => {
      const bh = window.__bh;
      const s = bh.state;
      const entities = await import("/js/entities.js");
      const { ShipCatalog } = await import("/js/core/ShipCatalog.js");
      const { SpriteSheet } = await import("/js/core/SpriteSheet.js");
      Object.assign(bh.dev.cfg, { galaxy: 4, biome: "Ruined Armada", tier: 3, depth: 1, zen: false, wisp: false });
      bh.dev.enter();
      bh.dev.frozen = true;
      s.paused = true;
      s.radius = 6;
      s.anchorSmooth = 6;
      bh.camera.updateScale(bh.display.w, bh.display.h, true);
      const e = entities.createEntity(entities.typeById("craft"), 0, 0, 1);
      ShipCatalog.adopt(e, 3, false, false, 0);
      e.ship = "courier";
      e.look = 0;
      e.steer = true;
      e.rotation = 0;
      e.depthT = 1;
      e.radius = s.radius * 4;
      e.x = s.playerX;
      e.y = s.playerY - s.viewH * 0.16;
      const sheet = SpriteSheet.for("courier");
      sheet.start();
      const t0 = performance.now();
      while (!sheet.ready && performance.now() - t0 < 8000) await new Promise(r => setTimeout(r, 40));
      s.entities = [e];
      bh.scene.draw(performance.now(), 0, true);
    });
    out.push(await this.shot(page, "04-courier.png"));

    await place(async () => {
      const bh = window.__bh;
      const s = bh.state;
      const entities = await import("/js/entities.js");
      const { Theme } = await import("/js/core/Theme.js");
      Object.assign(bh.dev.cfg, { galaxy: 3, biome: "Planet Nursery", tier: 5, depth: 1, zen: false, wisp: false });
      bh.dev.enter();
      bh.dev.frozen = true;
      s.paused = true;
      s.radius = 6;
      s.anchorSmooth = 6;
      bh.camera.updateScale(bh.display.w, bh.display.h, true);
      const e = entities.createEntity(entities.typeById("planet"), 0, 0, 1);
      e.artType = "test-crystal";
      e.depthT = 1;
      e.radius = 26;
      e.x = s.playerX;
      e.y = s.playerY - s.viewH * 0.14;
      const art = Theme.planets.get("test-crystal");
      art.start();
      const t0 = performance.now();
      while (!art.ready && performance.now() - t0 < 8000) await new Promise(r => setTimeout(r, 40));
      s.entities = [e];
      bh.scene.draw(performance.now(), 0, true);
    });
    out.push(await this.shot(page, "05-test-crystal.png"));
    await place(async () => {
      const bh = window.__bh;
      const s = bh.state;
      const entities = await import("/js/entities.js");
      const { Theme } = await import("/js/core/Theme.js");
      Object.assign(bh.dev.cfg, { galaxy: 3, biome: "Planet Nursery", tier: 5, depth: 1, zen: false, wisp: false });
      bh.dev.enter();
      bh.dev.frozen = true;
      s.paused = true;
      s.radius = 8;
      s.anchorSmooth = 8;
      bh.camera.updateScale(bh.display.w, bh.display.h, true);
      const e = entities.createEntity(entities.typeById("planet"), 0, 0, 1);
      e.artType = "rust-desert";
      e.depthT = 1;
      e.radius = 16;
      e.x = s.playerX + s.viewW * 0.16;
      e.y = s.playerY;
      const art = Theme.planets.get(e.artType);
      art.start();
      const t0 = performance.now();
      while (!art.ready && performance.now() - t0 < 8000) await new Promise(r => setTimeout(r, 40));
      s.entities = [];
      bh.debris.clear();
      bh.debris.spawn(e);
      const born = bh.debris.pieces.filter(p => p.on);
      if (born.length) bh.debris.update(Math.max(...born.map(p => p.life)) * 0.22, false);
      bh.scene.draw(performance.now(), 0, true);
    });
    out.push(await this.shot(page, "06-planet-bite-debris.png"));
    return out;
  }

  static async run() {
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
    await page.addInitScript(OoManifest.hook);
    const errors = [];
    page.on("pageerror", err => errors.push(String(err)));
    let result;
    try {
      await this.installRoutes(page);
      await this.boot(page);
      result = await this.proof(page);
      if (SHOTS && result && result.ok) result.shots = await this.pictures(page);
    } catch (err) {
      result = { ok: false, reason: String(err && err.stack || err) };
    }
    result.pageErrors = errors;
    if (errors.length) result.ok = false;
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
    process.exit(result.ok ? 0 : 1);
  }
}

OoManifest.run();
