// v9.9.0 resilience: boot survives a missing art index; crafts spawned
// while the ship index is down pick a class once it returns; a missing
// debris file does not block a body from drawing or being eaten.
//   node tools/v990-resilience.cjs [port]
// Exit 0 when every check passed. Viewport 390x844.

const { Browser } = require("./lib/browser.cjs");
const { chromium } = Browser.playwrightCore();

const PORT = process.argv[2] || "8099";
const CHROME = Browser.chromePath(chromium);
const ORIGIN = `http://127.0.0.1:${PORT}`;

async function launch() {
  return chromium.launch({
    executablePath: CHROME,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
}

async function newPage(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
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

async function boot(page) {
  await page.goto(`${ORIGIN}/?dev&debug`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => window.__bh && window.__bh.state && window.__bh.scene, { timeout: 20000 });
  const skip = page.locator("#btn-skip-intro");
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

async function screenUp(page) {
  return page.evaluate(() => {
    const splash = document.getElementById("splash");
    const title = document.getElementById("title-screen");
    const intro = document.getElementById("intro-screen");
    const visible = el => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0" && !el.classList.contains("hidden");
    };
    const splashGone = !splash || !visible(splash) || splash.style.display === "none";
    const screen = window.__bh && window.__bh.state && window.__bh.state.screen;
    const play = screen === "play";
    const titleUp = visible(title);
    const introUp = visible(intro);
    return {
      ok: !!(window.__bh && window.__bh.scene && (play || titleUp || introUp)),
      screen,
      splashGone,
      titleUp,
      introUp
    };
  });
}

async function bootSurvivesMissingBodyIndex(kind) {
  const path = kind === "moon" ? "**/assets/moons/manifest.json" : "**/assets/planets/manifest.json";
  const catalog = kind === "moon" ? "moons" : "planets";
  const typeId = kind === "moon" ? "moon" : "planet";
  const browser = await launch();
  const page = await newPage(browser);
  await page.route(path, route => route.abort());
  await boot(page);
  const first = await screenUp(page);
  if (!first.ok) {
    await browser.close();
    return { ok: false, reason: `boot did not reach a title, intro or play screen when the ${kind} index failed`, first, pageErrors: page._errs };
  }
  await page.unroute(path);
  const recovered = await page.evaluate(async ({ catalog, typeId, kind }) => {
    const { Theme } = await import("/js/core/Theme.js");
    const { Body } = await import("/js/core/Body.js");
    const entities = await import("/js/entities.js");
    const bh = window.__bh;
    const s = bh.state;
    const bag = Theme[catalog];
    const t0 = performance.now();
    while (!bag.ready && performance.now() - t0 < 15000) {
      await new Promise(r => setTimeout(r, 80));
    }
    if (!bag.ready) {
      return { ok: false, reason: `${kind} index did not recover after the route came back`, ready: Theme.ready, catalog: bag.ready };
    }
    Object.assign(bh.dev.cfg, { galaxy: 3, biome: "Planet Nursery", tier: 5, depth: 1, zen: false, wisp: false });
    bh.dev.enter();
    bh.dev.frozen = true;
    s.paused = true;
    const type = bag.playable()[0];
    const e = entities.createEntity(entities.typeById(typeId), s.playerX, s.playerY - s.viewH * 0.12, 1);
    e.artType = type;
    e.depthT = 1;
    e.radius = 22;
    const art = bag.get(type);
    if (art) art.start();
    const t1 = performance.now();
    while (!Body.for(e).ready() && performance.now() - t1 < 8000) await new Promise(r => setTimeout(r, 40));
    s.entities = [e];
    const drew = Body.for(e).draw(
      document.createElement("canvas").getContext("2d"),
      40, 40, 16, 1
    );
    return { ok: !!Body.for(e).ready() && !!drew, type, ready: Body.for(e).ready(), drew, catalog: bag.ready };
  }, { catalog, typeId, kind });
  const pageErrors = page._errs.slice();
  await browser.close();
  const ok = !!(first.ok && recovered.ok && !pageErrors.length);
  return { ok, reason: ok ? "boot recovered" : (recovered.reason || `${kind} bodies did not appear after the index recovered`), first, recovered, pageErrors };
}

async function shipsSpawnedDuringOutageRecover() {
  const browser = await launch();
  const page = await newPage(browser);
  await page.route("**/assets/ships/manifest.json", route => route.abort());
  await boot(page);
  const first = await screenUp(page);
  if (!first.ok) {
    await browser.close();
    return { ok: false, reason: "boot did not reach a screen when the ship index failed", first, pageErrors: page._errs };
  }
  const spawned = await page.evaluate(async () => {
    const { ShipCatalog } = await import("/js/core/ShipCatalog.js");
    const bh = window.__bh;
    const s = bh.state;
    Object.assign(bh.dev.cfg, { galaxy: 4, biome: "Ruined Armada", tier: 4, depth: 1, zen: false, wisp: false });
    bh.dev.enter();
    bh.dev.frozen = true;
    s.paused = true;
    const crafts = s.entities.filter(e => e.type === "craft");
    return {
      catalogReady: ShipCatalog.ready,
      n: crafts.length,
      empty: crafts.filter(e => !e.ship).length,
      named: crafts.filter(e => e.ship).map(e => e.ship)
    };
  });
  await page.unroute("**/assets/ships/manifest.json");
  const recovered = await page.evaluate(async () => {
    const { Theme } = await import("/js/core/Theme.js");
    const { ShipCatalog } = await import("/js/core/ShipCatalog.js");
    const { Ship } = await import("/js/core/Ship.js");
    const { onWorldBump } = await import("/js/worlds.js");
    const bh = window.__bh;
    const s = bh.state;
    const t0 = performance.now();
    while (!ShipCatalog.ready && performance.now() - t0 < 15000) {
      await new Promise(r => setTimeout(r, 80));
    }
    if (!ShipCatalog.ready) {
      return { ok: false, reason: "ship index did not recover after the route came back", theme: Theme.ready };
    }
    const crafts = s.entities.filter(e => e.type === "craft" && e.ship !== "scrap");
    const t1 = performance.now();
    while (performance.now() - t1 < 8000) {
      const ready = crafts.filter(e => Ship.for(e).ready());
      if (ready.length) break;
      await new Promise(r => setTimeout(r, 40));
    }
    const recoveredCrafts = crafts.filter(e => e.ship && Ship.for(e).ready());
    if (!recoveredCrafts.length) {
      return { ok: false, reason: "no recovered craft became ready", classes: crafts.map(e => e.ship) };
    }
    const e = recoveredCrafts[0];
    const c = document.createElement("canvas");
    c.width = c.height = 160;
    const drew = Ship.for(e).draw(c.getContext("2d"), 80, 80, 40, 1, 0.5, true, 0, 1, 0.82);
    const smallest = recoveredCrafts.reduce((a, b) => a.radius < b.radius ? a : b);
    s.radius = smallest.radius / (s.eatRatio || 0.88) + 2;
    s.anchorSmooth = s.radius;
    const edible = s.radius > smallest.radius * s.eatRatio && Ship.for(smallest).ready();
    const before = s.goalCount || 0;
    const goalName = s.goal && s.goal.name;
    const hull = recoveredCrafts.find(h => h.hull) || recoveredCrafts[0];
    onWorldBump(s, hull);
    const crumbs = s.entities.filter(x => x.crumb);
    const t2 = performance.now();
    while (performance.now() - t2 < 8000) {
      if (crumbs.some(x => Ship.for(x).ready())) break;
      await new Promise(r => setTimeout(r, 40));
    }
    const crumb = crumbs.find(x => Ship.for(x).ready()) || crumbs[0];
    let crumbReady = false, crumbDrew = false, progressed = false;
    if (crumb) {
      crumbReady = Ship.for(crumb).ready();
      crumb.x = s.playerX;
      crumb.y = s.playerY;
      crumb.depthT = 1;
      crumb.consuming = false;
      s.radius = Math.max(s.radius, crumb.radius / (s.eatRatio || 0.88) + 2);
      s.anchorSmooth = s.radius;
      crumbDrew = !!Ship.for(crumb).draw(c.getContext("2d"), 80, 80, 20, 1, 0.5, true, 0, 1, 0.82);
      if (bh.feeding) bh.feeding.update(1);
      progressed = (s.goalCount || 0) > before && goalName === "Salvage the hulls";
    }
    return {
      ok: recoveredCrafts.length > 0 && !!drew && !!edible && !!crumb && crumbReady && progressed,
      ship: e.ship,
      drew: !!drew,
      edible,
      ready: recoveredCrafts.length,
      emptyLeft: crafts.filter(x => !x.ship).length,
      crumbs: crumbs.length,
      crumbReady,
      crumbDrew,
      goalName,
      goalBefore: before,
      goalAfter: s.goalCount || 0,
      progressed
    };
  });
  const pageErrors = page._errs.slice();
  await browser.close();
  const ok = !!(first.ok && spawned.empty > 0 && recovered.ok && !pageErrors.length);
  return {
    ok,
    reason: ok ? "ships recovered" : (recovered.reason || "crafts spawned during the outage did not recover"),
    first,
    spawned,
    recovered,
    pageErrors
  };
}

async function missingDebrisStillEdible() {
  const browser = await launch();
  const page = await newPage(browser);
  await page.route("**/assets/planets/rust-desert/v1/debris0.png", route => route.fulfill({ status: 404, body: "missing" }));
  await boot(page);
  const result = await page.evaluate(async () => {
    const { Theme } = await import("/js/core/Theme.js");
    const { Body } = await import("/js/core/Body.js");
    const entities = await import("/js/entities.js");
    const bh = window.__bh;
    const s = bh.state;
    Object.assign(bh.dev.cfg, { galaxy: 3, biome: "Planet Nursery", tier: 5, depth: 1, zen: false, wisp: false });
    bh.dev.enter();
    bh.dev.frozen = true;
    s.paused = true;
    s.radius = 40;
    s.anchorSmooth = 40;
    s.eatRatio = 0.88;
    const e = entities.createEntity(entities.typeById("planet"), s.playerX, s.playerY, 1);
    e.artType = "rust-desert";
    e.depthT = 1;
    e.radius = 16;
    const art = Theme.planets.get("rust-desert");
    if (art) art.start();
    const t0 = performance.now();
    while (!Body.for(e).ready() && performance.now() - t0 < 8000) await new Promise(r => setTimeout(r, 40));
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const drew = Body.for(e).draw(c.getContext("2d"), 64, 64, 16, 1);
    const frames = art && art.debrisFrames();
    const edible = Body.for(e).ready() && s.radius > e.radius * s.eatRatio;
    return {
      ready: Body.for(e).ready(),
      drew: !!drew,
      edible,
      debrisCount: frames ? frames.length : 0,
      debrisNull: frames == null
    };
  });
  const pageErrors = page._errs.slice();
  await browser.close();
  const ok = !!(result.ready && result.drew && result.edible);
  return { ok, reason: ok ? "body drew without debris" : "a missing debris file blocked the body", ...result, pageErrors };
}

(async () => {
  const planets = await bootSurvivesMissingBodyIndex("planet");
  const moons = await bootSurvivesMissingBodyIndex("moon");
  const ships = await shipsSpawnedDuringOutageRecover();
  const debris = await missingDebrisStillEdible();
  const ok = planets.ok && moons.ok && ships.ok && debris.ok;
  const out = { ok, planets, moons, ships, debris };
  console.log(JSON.stringify(out, null, 2));
  process.exit(ok ? 0 : 1);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
