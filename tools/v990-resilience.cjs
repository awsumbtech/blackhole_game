// v9.9.0 resilience: boot survives a missing art index; a missing debris
// file does not block a body from drawing or being eaten.
//   node tools/v990-resilience.cjs [port]
// Exit 0 when every check passed. Viewport 390x844.

const { playwrightCore, chromePath } = require("./_browser.cjs");
const { chromium } = playwrightCore();

const PORT = process.argv[2] || "8099";
const CHROME = chromePath(chromium);
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

async function bootSurvivesMissingIndex() {
  const browser = await launch();
  const page = await newPage(browser);
  await page.route("**/assets/planets/manifest.json", route => route.abort());
  await boot(page);
  const first = await screenUp(page);
  if (!first.ok) {
    await browser.close();
    return { ok: false, reason: "boot did not reach a title, intro or play screen when the planet index failed", first, pageErrors: page._errs };
  }
  await page.unroute("**/assets/planets/manifest.json");
  const recovered = await page.evaluate(async () => {
    const { Theme } = await import("/js/core/Theme.js");
    const { Body } = await import("/js/core/Body.js");
    const entities = await import("/js/entities.js");
    const bh = window.__bh;
    const s = bh.state;
    const t0 = performance.now();
    while (!Theme.planets.ready && performance.now() - t0 < 15000) {
      await new Promise(r => setTimeout(r, 80));
    }
    if (!Theme.planets.ready) {
      return { ok: false, reason: "planet index did not recover after the route came back", ready: Theme.ready, planets: Theme.planets.ready };
    }
    Object.assign(bh.dev.cfg, { galaxy: 3, biome: "Planet Nursery", tier: 5, depth: 1, zen: false, wisp: false });
    bh.dev.enter();
    bh.dev.frozen = true;
    s.paused = true;
    const type = Theme.planets.playable()[0];
    const e = entities.createEntity(entities.typeById("planet"), s.playerX, s.playerY - s.viewH * 0.12, 1);
    e.artType = type;
    e.depthT = 1;
    e.radius = 22;
    const art = Theme.planets.get(type);
    if (art) art.start();
    const t1 = performance.now();
    while (!Body.for(e).ready() && performance.now() - t1 < 8000) await new Promise(r => setTimeout(r, 40));
    s.entities = [e];
    const drew = Body.for(e).draw(
      document.createElement("canvas").getContext("2d"),
      40, 40, 16, 1
    );
    return { ok: !!Body.for(e).ready() && !!drew, type, ready: Body.for(e).ready(), drew, catalog: Theme.planets.ready };
  });
  await browser.close();
  const ok = !!(first.ok && recovered.ok && !page._errs.length);
  return { ok, reason: ok ? "boot recovered" : (recovered.reason || "bodies did not appear after the index recovered"), first, recovered, pageErrors: page._errs };
}

async function missingDebrisStillEdible() {
  const browser = await launch();
  const page = await newPage(browser);
  await page.route("**/assets/planets/rust-desert/v1/debris0.png", route => route.fulfill({ status: 404, body: "missing" }));
  await boot(page);
  const result = await page.evaluate(async () => {
    const { Theme } = await import("/js/core/Theme.js");
    const { Body } = await import("/js/core/Body.js");
    const { Feeding } = await import("/js/core/Feeding.js");
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
  const boot = await bootSurvivesMissingIndex();
  const debris = await missingDebrisStillEdible();
  const ok = boot.ok && debris.ok;
  const out = { ok, boot, debris };
  console.log(JSON.stringify(out, null, 2));
  process.exit(ok ? 0 : 1);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
