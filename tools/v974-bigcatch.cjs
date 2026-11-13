// The big-catch cue is a gold outline from the sprite, not a filled disc.
//   node tools/v974-bigcatch.cjs [port] [out.json]
// Exit 0 on the outline. Exit 1 on the v9.7.3 filled halo.

const fs = require("fs");
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "/tmp/pw/node_modules/playwright-core");

const PORT = process.argv[2] || "8091";
const OUT = process.argv[3] || "";
const CHROME = process.env.CHROME || "/usr/local/bin/google-chrome";

async function boot(page) {
  await page.goto(`http://127.0.0.1:${PORT}/?dev&debug`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => window.__bh && window.__bh.dev, { timeout: 20000 });
  const skip = page.locator("#btn-skip-intro");
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

async function run(page) {
  return page.evaluate(async () => {
    const render = await import("/js/render.js");
    const entities = await import("/js/entities.js");
    const ships = await import("/js/ships.js");
    const bh = window.__bh;
    const s = bh.state;
    s.paused = true;
    Object.assign(bh.dev.cfg, { galaxy: 4, biome: "Ruined Armada", tier: 3, depth: 1, zen: false, wisp: false });
    bh.dev.enter();
    s.paused = true;

    const e = entities.createEntity(entities.typeById("craft"), 0, 0, 1);
    ships.adoptShip(e, 3, true, true);
    e.bigFish = true;
    e.depthT = 1;
    e._spawnAlpha = 1;
    e.radius = 36;
    e.rotation = 0.7;
    e.x = 0;
    e.y = 0;
    e.vx = 0;
    e.vy = 0;

    const W = 420, H = 420;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    const proto = CanvasRenderingContext2D.prototype;
    const orig = {
      grad: proto.createRadialGradient,
      arc: proto.arc,
      begin: proto.beginPath,
      fill: proto.fill,
      draw: proto.drawImage
    };
    const bag = { radials: 0, arcFills: 0, outlines: [] };
    proto.createRadialGradient = function () {
      if (this.canvas === canvas) bag.radials++;
      return orig.grad.apply(this, arguments);
    };
    proto.beginPath = function () {
      this.__arc = false;
      return orig.begin.apply(this, arguments);
    };
    proto.arc = function () {
      this.__arc = true;
      return orig.arc.apply(this, arguments);
    };
    proto.fill = function () {
      if (this.canvas === canvas && this.__arc) bag.arcFills++;
      return orig.fill.apply(this, arguments);
    };
    proto.drawImage = function (img) {
      if (this.canvas === canvas && img && img.__bigCatchOutline) {
        const m = this.getTransform();
        bag.outlines.push({ img, alpha: this.globalAlpha, ang: Math.atan2(m.b, m.a) });
      }
      return orig.draw.apply(this, arguments);
    };

    const eat = 0.88;
    const nearlyP = 0.90 * e.radius * eat;
    const fitsP = 1.2 * e.radius * eat;
    const draw = (playerR, breath) => {
      bag.radials = 0;
      bag.arcFills = 0;
      bag.outlines = [];
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      render.drawEntities(ctx, [e], W, H, 0, 0, playerR, 0, eat, 1, 1, breath, W / 2, H / 2, true, 1);
      return {
        radials: bag.radials,
        arcFills: bag.arcFills,
        n: bag.outlines.length,
        alpha: bag.outlines.length ? +bag.outlines[0].alpha.toFixed(4) : null,
        ang: bag.outlines.length ? +bag.outlines[0].ang.toFixed(4) : null,
        id: bag.outlines.length ? bag.outlines[0].img : null
      };
    };

    e.bigFish = false;
    draw(nearlyP, 0.5);
    const bare = ctx.getImageData(W / 2 - 2, H / 2 - 2, 5, 5).data;
    e.bigFish = true;
    const cover = (() => {
      draw(nearlyP, 0.5);
      const on = ctx.getImageData(W / 2 - 2, H / 2 - 2, 5, 5).data;
      let diff = 0, opaque = 0;
      for (let i = 0; i < bare.length; i += 4) {
        if (bare[i + 3] < 200) continue;
        opaque++;
        diff += Math.abs(bare[i] - on[i]) + Math.abs(bare[i + 1] - on[i + 1]) + Math.abs(bare[i + 2] - on[i + 2]);
      }
      return { opaque, diff };
    })();

    const n0 = draw(nearlyP, 0);
    const n1 = draw(nearlyP, 1);
    const f0 = draw(fitsP, 0);
    const f1 = draw(fitsP, 1);
    const same = n0.id && n0.id === n1.id && n0.id === f0.id && f0.id === f1.id;

    proto.createRadialGradient = orig.grad;
    proto.arc = orig.arc;
    proto.beginPath = orig.begin;
    proto.fill = orig.fill;
    proto.drawImage = orig.draw;

    const angErr = n0.ang == null ? 9 : Math.abs(Math.atan2(Math.sin(n0.ang - e.rotation), Math.cos(n0.ang - e.rotation)));
    const result = {
      galaxy: 4, biome: "Ruined Armada", tier: 3, tierName: "Comets & Ice",
      ship: e.ship, wreck: !!e.wreck,
      nearly: { a0: n0.alpha, a1: n1.alpha, radials: n0.radials + n1.radials, arcFills: n0.arcFills + n1.arcFills, drawn: n0.n + n1.n },
      fits: { a0: f0.alpha, a1: f1.alpha, radials: f0.radials + f1.radials, arcFills: f0.arcFills + f1.arcFills, drawn: f0.n + f1.n },
      cacheReused: !!same,
      center: cover,
      rotErr: +angErr.toFixed(4)
    };
    const noDisc = result.nearly.radials === 0 && result.nearly.arcFills === 0
      && result.fits.radials === 0 && result.fits.arcFills === 0;
    const outlined = result.nearly.drawn >= 2 && result.fits.drawn >= 2 && result.cacheReused;
    const pulse = n0.alpha != null && n1.alpha != null && Math.abs(n0.alpha - n1.alpha) > 0.05;
    const steady = f0.alpha != null && f1.alpha != null && Math.abs(f0.alpha - f1.alpha) < 0.001 && f0.alpha > n0.alpha && f0.alpha > n1.alpha;
    const clean = cover.opaque >= 4 && cover.diff === 0;
    const turned = angErr < 0.05;
    result.ok = noDisc && outlined && pulse && steady && clean && turned;
    result.checks = { noDisc, outlined, pulse, steady, clean, turned };
    return result;
  });
}

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  const page = await (await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  })).newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 400)));
  await boot(page);
  let result;
  try {
    result = await run(page);
  } catch (e) {
    result = { ok: false, error: String(e).slice(0, 500) };
  }
  result.errs = errs;
  if (errs.length) result.ok = false;
  const text = JSON.stringify(result, null, 2);
  console.log(text);
  if (OUT) fs.writeFileSync(OUT, text + "\n");
  await browser.close();
  process.exit(result.ok ? 0 : 1);
}

main();
