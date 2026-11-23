// Ship pixels come from a painted sheet, not from paintShip.
//   node tools/oo-ship.cjs [port] [--shots]
// Exit 0 when every check passed. On main (paintShip still fills a hull) this fails.
// Viewport 390x844. Chrome: /usr/bin/google-chrome. Playwright: playwright-core.

const fs = require("fs");
const path = require("path");
const { Browser } = require("./lib/browser.cjs");
const { chromium } = Browser.playwrightCore();

const args = process.argv.slice(2).filter(a => a !== "--shots");
const SHOTS = process.argv.includes("--shots");
const PORT = args[0] || "8096";
const CHROME = Browser.chromePath(chromium);
const SHOT_DIR = path.join("docs", "shots", "v9.8.0");

class OoShip {
  static hook = function () {
    const proto = CanvasRenderingContext2D.prototype;
    const orig = proto.drawImage;
    const bag = [];
    proto.drawImage = function (img) {
      if (img instanceof HTMLImageElement) {
        const m = this.getTransform();
        const a = Array.prototype.slice.call(arguments, 1);
        bag.push({
          img,
          src: img.currentSrc || img.src || "",
          sx: a[0], sy: a[1], sw: a[2], sh: a[3],
          dx: a[4], dy: a[5], dw: a[6], dh: a[7],
          n: a.length,
          a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f,
          alpha: this.globalAlpha
        });
      }
      return orig.apply(this, arguments);
    };
    window.__shipDraws = bag;
  };

  static galaxies = [
    [1, "Debris Reef", 1],
    [2, "Comet Current", 2],
    [3, "Planet Nursery", 3],
    [4, "Ruined Armada", 3],
    [5, "Void Rift", 4],
    [6, "Star Meadow", 5],
    [7, "Neutron Forge", 6]
  ];

  static async boot(page) {
    await page.goto(`http://127.0.0.1:${PORT}/?dev&debug`, { waitUntil: "load", timeout: 30000 });
    await page.waitForFunction(() => window.__bh && window.__bh.state && window.__bh.scene, { timeout: 20000 });
    const skip = page.locator("#btn-skip-intro");
    if (await skip.isVisible().catch(() => false)) await skip.click();
  }

  static async proof(page) {
    return page.evaluate(async () => {
      let ships = {}; try { ships = await import("/js/ships.js"); } catch { ships = {}; }
      const entities = await import("/js/entities.js");
      const bh = window.__bh;
      const s = bh.state;
      Object.assign(bh.dev.cfg, { galaxy: 4, biome: "Ruined Armada", tier: 3, depth: 1, zen: false, wisp: false });
      bh.dev.enter();
      bh.dev.frozen = true;
      s.paused = true;

      if (typeof ships.paintShip === "function") {
        const c = document.createElement("canvas");
        c.width = c.height = 160;
        const g = c.getContext("2d");
        let fills = 0;
        const orig = g.fill.bind(g);
        g.fill = (...a) => { fills++; return orig(...a); };
        const e = entities.createEntity(entities.typeById("craft"), 0, 0, 1);
        ships.adoptShip(e, 3, false, false);
        ships.paintShip(g, 64, e);
        return { ok: false, reason: "paintShip filled a hull", fills, drawShip: typeof ships.drawShip === "function" };
      }

      const { SpriteSheet } = await import("/js/core/SpriteSheet.js");
      const { Ship } = await import("/js/core/Ship.js");
      const e = entities.createEntity(entities.typeById("craft"), 0, 0, 1);
      const adopt = ships.adoptShip
        ? (ent, tier, wreck, big) => ships.adoptShip(ent, tier, wreck, big)
        : (ent, tier, wreck, big) => import("/js/core/ShipCatalog.js").then(m => m.ShipCatalog.adopt(ent, tier, wreck, big));
      await adopt(e, 3, false, false);
      e.ship = "freighter";
      e.look = 0;
      e.wreck = false;
      e.steer = false;
      e.bigFish = false;
      e.consuming = false;
      e.rotation = 0;
      e.depthT = 1;
      // Large on screen so the centre device pixel is hull, not a filtered edge.
      s.radius = 6;
      s.anchorSmooth = 6;
      bh.camera.updateScale(bh.display.w, bh.display.h, true);
      e.radius = 36;
      const sheet = SpriteSheet.for("freighter");
      sheet.start();
      const t0 = performance.now();
      while (!sheet.ready) {
        if (performance.now() - t0 > 8000) return { ok: false, reason: "sheet did not decode", started: sheet.started };
        await new Promise(r => setTimeout(r, 40));
      }
      // Off the hole, so the hull pixel is the sheet and not the disc.
      e.x = s.camX;
      e.y = s.camY - s.viewH * 0.22;
      s.entities = [e];
      window.__shipDraws.length = 0;
      bh.scene.draw(performance.now(), 0, true);
      const z = s.zoom, dpr = bh.display.dpr;
      const sx = e.x - s.camX + s.viewW / 2;
      const sy = e.y - s.camY + s.viewH / 2;
      const expX = dpr * z * sx, expY = dpr * z * sy;
      const mine = window.__shipDraws.filter(d =>
        d.n >= 8 && d.src.includes("assets/ships/freighter.webp") &&
        Math.abs(d.e - expX) < 3 && Math.abs(d.f - expY) < 3);
      const body = mine.find(d => d.sx === 0 && d.sy === 0 && d.sw === 320 && d.sh === 320);
      if (!body) {
        return {
          ok: false, reason: "no freighter frame drawn from the sheet",
          draws: window.__shipDraws.length,
          near: window.__shipDraws.slice(0, 6).map(d => ({ src: d.src, e: d.e, f: d.f, sx: d.sx, sy: d.sy })),
          exp: { expX, expY }
        };
      }
      const centred = Math.abs(body.dx + body.dw / 2) < 0.01 && Math.abs(body.dy + body.dh / 2) < 0.01;
      // 1:1 centre: the frame's middle pixel against a draw of that same frame.
      const isolated = document.createElement("canvas");
      isolated.width = isolated.height = 320;
      const ig = isolated.getContext("2d");
      let fills = 0, grads = 0;
      const of = ig.fill.bind(ig), og = ig.createRadialGradient.bind(ig);
      ig.fill = (...a) => { fills++; return of(...a); };
      ig.createRadialGradient = (...a) => { grads++; return og(...a); };
      Ship.for(e).draw(ig, 160, 160, 320, 1, 0.5, true, 0, 1, 0.82);
      const got = ig.getImageData(160, 160, 1, 1).data;
      const ref = document.createElement("canvas");
      ref.width = ref.height = 320;
      const rg = ref.getContext("2d");
      rg.drawImage(body.img, 0, 0, 320, 320, 0, 0, 320, 320);
      const want = rg.getImageData(160, 160, 1, 1).data;
      let diff = 0;
      for (let i = 0; i < 4; i++) diff = Math.max(diff, Math.abs(got[i] - want[i]));
      const game = bh.display.canvas.getContext("2d").getImageData(Math.round(body.e), Math.round(body.f), 1, 1).data;
      const replay = document.createElement("canvas");
      replay.width = bh.display.canvas.width;
      replay.height = bh.display.canvas.height;
      const pg = replay.getContext("2d");
      pg.setTransform(body.a, body.b, body.c, body.d, body.e, body.f);
      pg.globalAlpha = body.alpha;
      pg.drawImage(body.img, body.sx, body.sy, body.sw, body.sh, body.dx, body.dy, body.dw, body.dh);
      const painted = pg.getImageData(Math.round(body.e), Math.round(body.f), 1, 1).data;
      let gameDiff = 0;
      for (let i = 0; i < 3; i++) gameDiff = Math.max(gameDiff, Math.abs(game[i] - painted[i]));
      const plateCols = [1280, 1600, 1920, 2240];
      const isPlate = d => /assets\/ships\/[^/]+\.webp/.test(d.src) && plateCols.indexOf(d.sx) >= 0 && d.sw === 320;
    let scrapFrom = ships.scrapFrom;
    if (!scrapFrom) {
      const { ShipCatalog } = await import("/js/core/ShipCatalog.js");
      scrapFrom = (parent, index) => ShipCatalog.scrapFrom(parent, index);
    }
    const parent = { ship: "freighter", look: 2, seed: 99 };
    const bit = scrapFrom(parent, 1);
    const again = scrapFrom(parent, 1);
      const stable = bit.cls === "freighter" && bit.look === 2 && bit.plate === 1
        && again.cls === bit.cls && again.look === bit.look && again.plate === bit.plate;
      const crumb = entities.createEntity(entities.typeById("craft"), 0, 0, 1);
      crumb.ship = "scrap";
      crumb.scrapOf = bit.cls;
      crumb.look = bit.look;
      crumb.plate = bit.plate;
      crumb.wreck = true;
      crumb.steer = false;
      crumb.depthT = 1;
      crumb.radius = 28;
      crumb.rotation = 0.4;
      crumb.x = s.camX;
      crumb.y = s.camY - s.viewH * 0.22;
      s.entities = [crumb];
      bh.debris.clear();
      window.__shipDraws.length = 0;
      bh.scene.draw(performance.now(), 0, true);
      const scrapDraws = window.__shipDraws.filter(isPlate);
      const scrapHit = scrapDraws.some(d => d.src.includes("assets/ships/" + bit.cls + ".webp") && d.sx === 1280 + bit.plate * 320);

      const cruiser = SpriteSheet.for("cruiser");
      cruiser.start();
      const t1 = performance.now();
      while (!cruiser.ready) {
        if (performance.now() - t1 > 8000) return { ok: false, reason: "cruiser sheet did not decode" };
        await new Promise(r => setTimeout(r, 40));
      }
    const eaten = entities.createEntity(entities.typeById("craft"), 0, 0, 1);
    await adopt(eaten, 3, true, false);
      eaten.ship = "cruiser";
      eaten.look = 3;
      eaten.depthT = 1;
      eaten.radius = 30;
      eaten.x = s.playerX + 40;
      eaten.y = s.playerY;
      s.entities = [];
      bh.debris.clear();
      bh.debris.spawn(eaten);
      window.__shipDraws.length = 0;
      bh.scene.draw(performance.now(), 0, true);
      const bite = window.__shipDraws.filter(d => isPlate(d) && d.src.includes("assets/ships/cruiser.webp"));
      const biteCols = {};
      bite.forEach(d => { biteCols[d.sx] = (biteCols[d.sx] || 0) + 1; });
      const debrisOk = plateCols.every(col => biteCols[col] >= 1);

      const ok = centred && diff === 0 && fills === 0 && grads === 0 && want[3] > 200 && painted[3] > 200 && gameDiff <= 2
        && stable && scrapHit && debrisOk;
      return {
        ok,
        reason: ok ? "sheet" : "centre, scrap or debris check failed",
        centred, diff, fills, grads,
        centreAlpha: want[3],
        gameDiff, replayAlpha: painted[3],
        src: body.src,
        drawShip: typeof ships.drawShip === "function",
        paintShip: typeof ships.paintShip === "function",
        scrap: { stable, scrapHit, draws: scrapDraws.length, bit },
        debris: { draws: bite.length, cols: biteCols }
      };
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
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    return { file, bytes: buf.length, w, h };
  }

  static async pictures(page) {
    const base = async (extra) => {
      await page.evaluate(async (extraSrc) => {
        let ships = {}; try { ships = await import("/js/ships.js"); } catch { ships = {}; }
        const entities = await import("/js/entities.js");
        const { SpriteSheet } = await import("/js/core/SpriteSheet.js");
        const bh = window.__bh;
        const s = bh.state;
        Object.assign(bh.dev.cfg, { galaxy: 4, biome: "Ruined Armada", tier: 3, depth: 1, zen: false, wisp: false });
        bh.dev.enter();
        bh.dev.frozen = true;
        s.paused = true;
        const e = entities.createEntity(entities.typeById("craft"), 0, 0, 1);
        if (ships.adoptShip) ships.adoptShip(e, 3, false, true);
        else (await import("/js/core/ShipCatalog.js")).ShipCatalog.adopt(e, 3, false, true);
        e.ship = "cruiser";
        e.look = 0;
        e.depthT = 1;
        e.consuming = false;
        e.radius = s.radius * 4;
        e.x = s.playerX;
        e.y = s.playerY - s.viewH * 0.16;
        const spec = eval("(" + extraSrc + ")");
        spec(e, s);
        const sheet = SpriteSheet.for(e.ship);
        sheet.start();
        const t0 = performance.now();
        while (!sheet.ready && performance.now() - t0 < 8000) await new Promise(r => setTimeout(r, 40));
        s.entities = [e];
        bh.scene.draw(performance.now(), 0, true);
      }, extra.toString());
    };
    const out = [];
    await base(e => {
      e.wreck = false; e.steer = true; e.bigFish = false; e.rotation = 0; e.consuming = false;
    });
    out.push(await this.shot(page, "01-living.png"));
    await base(e => {
      e.wreck = false; e.steer = true; e.bigFish = false; e.rotation = Math.PI; e.consuming = false;
    });
    out.push(await this.shot(page, "02-facing-left.png"));
    await base(e => {
      e.wreck = true; e.steer = false; e.bigFish = false; e.rotation = 0.6;
      e.consuming = true; e.consumeProgress = 0.42; e.swallow = false;
    });
    out.push(await this.shot(page, "03-wreck-plates.png"));
    await base((e, s) => {
      e.ship = "capital";
      e.wreck = false; e.steer = true; e.bigFish = true; e.rotation = 0; e.consuming = false;
      const eat = s.eatRatio || 0.88;
      e.radius = s.radius / (eat * 1.02);
      e.x = s.playerX + s.viewW * 0.22;
      e.y = s.playerY;
    });
    out.push(await this.shot(page, "04-big-catch-edge.png"));
    const edge = await page.evaluate(() => window.__shipDraws.filter(d =>
      d.src.includes("assets/ships/capital.webp") && d.sx === 640).length);
    await page.evaluate(async () => {
      const entities = await import("/js/entities.js");
      let ships = {}; try { ships = await import("/js/ships.js"); } catch { ships = {}; }
      const { SpriteSheet } = await import("/js/core/SpriteSheet.js");
      const bh = window.__bh;
      const s = bh.state;
      Object.assign(bh.dev.cfg, { galaxy: 4, biome: "Ruined Armada", tier: 3, depth: 1, zen: false, wisp: false });
      bh.dev.enter();
      bh.dev.frozen = true;
      s.paused = true;
      s.radius = 4;
      s.anchorSmooth = 4;
      bh.camera.updateScale(bh.display.w, bh.display.h, true);
      const e = entities.createEntity(entities.typeById("craft"), 0, 0, 1);
      if (ships.adoptShip) ships.adoptShip(e, 3, true, false);
      else (await import("/js/core/ShipCatalog.js")).ShipCatalog.adopt(e, 3, true, false);
      e.ship = "cruiser";
      e.look = 0;
      e.depthT = 1;
      e.radius = 36;
      e.x = s.playerX + s.viewW * 0.2;
      e.y = s.playerY - s.viewH * 0.08;
      const sheet = SpriteSheet.for("cruiser");
      sheet.start();
      const t0 = performance.now();
      while (!sheet.ready && performance.now() - t0 < 8000) await new Promise(r => setTimeout(r, 40));
      s.entities = [];
      bh.debris.clear();
      bh.debris.spawn(e);
      for (const p of bh.debris.pieces) if (p.on) p.age = p.life * 0.08;
      bh.scene.draw(performance.now(), 0, true);
    });
    out.push(await this.shot(page, "05-bite-debris.png"));
    return { out, edgeDraws: edge };
  }

  static async sweep(page) {
    return page.evaluate(async (galaxies) => {
      const bh = window.__bh;
      const notes = [];
      for (const [galaxy, biome, tier] of galaxies) {
        Object.assign(bh.dev.cfg, { galaxy, biome, tier, depth: 1, zen: false, wisp: false });
        let error = "";
        try {
          bh.dev.enter();
          bh.dev.frozen = true;
          bh.scene.draw(performance.now(), 0, true);
          await new Promise(r => setTimeout(r, 80));
          bh.scene.draw(performance.now(), 0, true);
        } catch (err) { error = String(err && err.message || err); }
        notes.push({ galaxy, biome, tier, entities: bh.state.entities.length, error });
      }
      return notes;
    }, this.galaxies);
  }

  /** A 404 on the first shuttle sheet must be retried, then the craft can be drawn and eaten. */
  static async retry(page) {
    const before = await page.evaluate(async () => {
      const { SpriteSheet } = await import("/js/core/SpriteSheet.js");
      const { Ship } = await import("/js/core/Ship.js");
      const entities = await import("/js/entities.js");
      let ships = {}; try { ships = await import("/js/ships.js"); } catch { ships = {}; }
      const sheet = SpriteSheet.for("shuttle");
      const e = entities.createEntity(entities.typeById("craft"), 0, 0, 1);
      if (ships.adoptShip) ships.adoptShip(e, 2, false, false);
      else (await import("/js/core/ShipCatalog.js")).ShipCatalog.adopt(e, 2, false, false);
      e.ship = "shuttle";
      e.look = 0;
      e.depthT = 1;
      const edible = Ship.for(e).ready();
      sheet.start();
      const t0 = performance.now();
      while (sheet.started && !sheet.ready && performance.now() - t0 < 2000) {
        await new Promise(r => setTimeout(r, 20));
      }
      return {
        ready: sheet.ready,
        started: sheet.started,
        edible,
        failedAt: sheet.failedAt,
        retryMs: SpriteSheet.RETRY_MS,
        now: performance.now()
      };
    });
    if (before.ready || before.edible || before.started) {
      return { ok: false, reason: "shuttle stayed failed and was not fetched again during backoff", before, hits: this.shuttleHits };
    }
    const hitsAfterFail = this.shuttleHits;
    await page.waitForTimeout(Math.max(0, before.retryMs - (before.now - before.failedAt) + 80));
    this.allowShuttle = true;
    const after = await page.evaluate(async () => {
      const { SpriteSheet } = await import("/js/core/SpriteSheet.js");
      const { Ship } = await import("/js/core/Ship.js");
      const entities = await import("/js/entities.js");
      let ships = {}; try { ships = await import("/js/ships.js"); } catch { ships = {}; }
      const bh = window.__bh;
      const s = bh.state;
      const sheet = SpriteSheet.for("shuttle");
      const e = entities.createEntity(entities.typeById("craft"), 0, 0, 1);
      if (ships.adoptShip) ships.adoptShip(e, 2, false, false);
      else (await import("/js/core/ShipCatalog.js")).ShipCatalog.adopt(e, 2, false, false);
      e.ship = "shuttle";
      e.look = 0;
      e.steer = false;
      e.wreck = false;
      e.depthT = 1;
      e.rotation = 0;
      e.radius = 20;
      e.x = s.camX;
      e.y = s.camY - s.viewH * 0.18;
      sheet.start();
      const t0 = performance.now();
      while (!sheet.ready && performance.now() - t0 < 8000) await new Promise(r => setTimeout(r, 40));
      s.entities = [e];
      window.__shipDraws.length = 0;
      bh.scene.draw(performance.now(), 0, true);
      const drew = window.__shipDraws.some(d => d.src.includes("assets/ships/shuttle.webp"));
      return { ready: sheet.ready, edible: Ship.for(e).ready(), drew };
    });
    const retried = this.shuttleHits > hitsAfterFail;
    const ok = after.ready && after.edible && after.drew && retried;
    return {
      ok,
      reason: ok ? "retried" : "failed load was not retried",
      before: { ready: before.ready, edible: before.edible, started: before.started },
      after,
      hits: this.shuttleHits
    };
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
    this.shuttleHits = 0;
    this.allowShuttle = false;
    await page.route("**/assets/ships/shuttle.json", route => {
      this.shuttleHits++;
      if (!this.allowShuttle) route.fulfill({ status: 404, contentType: "application/json", body: "" });
      else route.continue();
    });
    await page.addInitScript(OoShip.hook);
    const errors = [];
    page.on("pageerror", err => errors.push(String(err)));
    let result;
    try {
      await this.boot(page);
      result = await this.proof(page);
      if (result && result.ok) {
        result.retry = await this.retry(page);
        if (!result.retry.ok) {
          result.ok = false;
          result.reason = result.retry.reason;
        }
      }
      if (SHOTS && result && result.ok) {
        result.shots = await this.pictures(page);
        result.sweep = await this.sweep(page);
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
}

OoShip.run();
