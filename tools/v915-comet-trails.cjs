// v9.15.0 fluid curved comet trails.
// The painted plume follows the comet's world path, slice by slice.
//   node tools/v915-comet-trails.cjs [port]
// Exit 0 when every check passed.

const fs = require("fs");
const path = require("path");
const { Browser } = require("./lib/browser.cjs");
const { releaseAgrees } = require("./lib/release.cjs");
const { chromium } = Browser.playwrightCore();

const PORT = process.argv[2] || "8765";
const CHROME = Browser.chromePath(chromium);
const SHOT_DIR = fs.existsSync("/opt/cursor/artifacts")
  ? "/opt/cursor/artifacts"
  : path.join(require("os").tmpdir(), "v915-shots");

const OWNERS = [
  "js/core/CometTail.js",
  "js/core/CometSparkle.js",
  "js/core/Comet.js",
  "js/core/PictureCatalog.js"
];
const PROC = /fillRect|strokeRect|beginPath|createLinearGradient|createRadialGradient|\.arc\s*\(|\.stroke\s*\(|createElement\(\s*["']canvas["']\)/;

function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function ownerGate(rel) {
  const src = fs.readFileSync(rel, "utf8");
  const stripped = strip(src);
  const classes = stripped.match(/export class /g) || [];
  const head = stripped.replace(/export class [\s\S]*$/, "");
  return {
    file: rel,
    classes: classes.length,
    looseFn: /^\s*(export\s+)?(async\s+)?function\s+/m.test(head),
    looseState: /^\s*(export\s+)?(const|let|var)\s+/m.test(head),
    procedural: PROC.test(stripped)
  };
}

function filesGate() {
  const owners = OWNERS.map(ownerGate);
  const release = releaseAgrees("9.15.0");
  const cat = fs.readFileSync("js/core/PictureCatalog.js", "utf8");
  const slice = /blitSlice\s*\(\s*ctx\s*,\s*spr\s*,\s*sx\s*,\s*sy\s*,\s*sw\s*,\s*sh\s*,\s*x\s*,\s*y\s*,\s*w\s*,\s*h\s*\)/.test(cat)
    && cat.indexOf("ctx.drawImage(img, x0, y0, rw, rh, dx, dy, dw, dh)") >= 0
    && cat.indexOf("if (!(rw > 0) || !(rh > 0) || !(dw > 0) || !(dh > 0)) return false;") >= 0;
  const index = JSON.parse(fs.readFileSync("assets/comets/index.json", "utf8"));
  const inkRow = (id) => (index.sprites || []).find(s => s && s.id === id);
  const inkOk = inkRow("tail-cyan") && inkRow("tail-cyan").inkEndPx === 431
    && inkRow("tail-silver") && inkRow("tail-silver").inkEndPx === 457
    && cat.indexOf("inkEndPx") >= 0
    && fs.readFileSync("js/core/CometTail.js", "utf8").indexOf("static INK") < 0;
  const tail = fs.readFileSync("js/core/CometTail.js", "utf8");
  const spark = fs.readFileSync("js/core/CometSparkle.js", "utf8");
  const render = fs.readFileSync("js/render.js", "utf8");
  const finds = fs.readFileSync("js/discoveries.js", "utf8");
  const wired = tail.indexOf("blitSlice") >= 0
    && /static CAP = 128/.test(spark)
    && /static PER = 6/.test(spark)
    && render.indexOf("e.tail.sample(e.x, e.y, dt, Math.hypot(w, h), still)") >= 0
    && render.indexOf("e.consuming ? e.consumeProgress : 0") >= 0
    && finds.indexOf("f.tail.sample(f.x, f.y, dt, Math.hypot(vw, vh), reduceMotion)") >= 0
    && finds.indexOf("reduceMotion)") >= 0;
  const ok = release.ok && slice && inkOk && wired
    && owners.every(o => o.classes === 1 && !o.looseFn && !o.looseState && !o.procedural);
  return { ok, release, slice, inkOk, wired, owners };
}

function wrap(a) {
  const TAU = Math.PI * 2;
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
function diff(a, b) { return Math.abs(wrap(a - b)); }

async function launch() {
  return chromium.launch({
    executablePath: CHROME,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
}

async function boot(page) {
  await page.goto(`http://127.0.0.1:${PORT}/?dev&debug`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => window.__bh && window.__bh.scene, { timeout: 20000 });
  const skip = page.locator("#btn-skip-intro");
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

async function shots(page) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.evaluate(async () => {
    const { CometTail } = await import("/js/core/CometTail.js");
    const { Theme } = await import("/js/core/Theme.js");
    const t0 = performance.now();
    while (!Theme.comets.has("tail-cyan") && performance.now() - t0 < 15000) {
      await new Promise(r => setTimeout(r, 40));
    }
    const nucleus = Theme.comets.sprite("nucleus-1");
    const coma = Theme.comets.sprite("coma-cyan");
    const R = 46;
    const arc = (n) => {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const theta = (i / n) * Math.PI / 2;
        pts.push({ x: R * Math.sin(theta), y: R * (1 - Math.cos(theta)) });
      }
      return pts;
    };
    const paint = (g, pts, hx, hy, r, still) => {
      const tail = new CometTail(0);
      for (const p of pts) tail.sample(p.x, p.y, 1, 10000, !!still);
      const head = pts[pts.length - 1];
      const origin = pts[0];
      g.save();
      g.globalAlpha = 0.35;
      g.strokeStyle = "rgba(180, 220, 255, 0.45)";
      g.lineWidth = 1;
      g.beginPath();
      pts.forEach((p, i) => {
        const x = hx + (p.x - head.x);
        const y = hy + (p.y - head.y);
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      });
      g.stroke();
      g.restore();
      tail.drawComet(g, hx, hy, r, 1, "", r, tail.speed, 0, !!still, 0);
      if (coma) {
        g.save();
        g.globalCompositeOperation = "screen";
        g.globalAlpha = 0.9;
        Theme.comets.blit(g, coma, hx, hy, r * 3.8, r * 3.8);
        g.restore();
      }
      if (nucleus) Theme.comets.blit(g, nucleus, hx, hy, r * 1.45, r * 1.45);
      return { head, origin, speed: tail.speed };
    };

    const strip = document.createElement("canvas");
    strip.id = "v915-strip";
    strip.width = 1320;
    strip.height = 320;
    strip.style.cssText = "position:fixed;left:0;top:0;z-index:50;width:1320px;height:320px";
    document.body.appendChild(strip);
    const sg = strip.getContext("2d");
    sg.fillStyle = "#070910";
    sg.fillRect(0, 0, strip.width, strip.height);
    const full = arc(84);
    for (let f = 0; f < 6; f++) {
      const n = 8 + Math.round((full.length - 1) * (f / 5));
      const pts = full.slice(0, n);
      const hx = 110 + f * 210;
      paint(sg, pts, hx, 210, 12, false);
    }

    const close = document.createElement("canvas");
    close.id = "v915-close";
    close.width = 860;
    close.height = 480;
    close.style.cssText = "position:fixed;left:0;top:330px;z-index:50;width:860px;height:480px";
    document.body.appendChild(close);
    const cg = close.getContext("2d");
    cg.fillStyle = "#070910";
    cg.fillRect(0, 0, close.width, close.height);
    paint(cg, full, 560, 340, 22, false);
  });
  const stripPath = path.join(SHOT_DIR, "v915-turning-comet-strip.png");
  const closePath = path.join(SHOT_DIR, "v915-curved-ribbon.png");
  await page.locator("#v915-strip").screenshot({ path: stripPath });
  await page.locator("#v915-close").screenshot({ path: closePath });
  return { stripPath, closePath };
}

async function main() {
  const fail = [];
  const files = filesGate();
  if (!files.ok) fail.push({ reason: "files", files });

  const browser = await launch();
  const page = await (await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  })).newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 300)));
  page.on("console", msg => {
    if (msg.type() === "error") {
      const t = msg.text();
      if (!/Failed to load resource|net::ERR_|favicon/i.test(t)) errs.push(t.slice(0, 300));
    }
  });
  await boot(page);

  const result = await page.evaluate(async () => {
    const TAU = Math.PI * 2;
    const wrap = (a) => {
      a = (a + Math.PI) % TAU;
      if (a < 0) a += TAU;
      return a - Math.PI;
    };
    const diff = (a, b) => Math.abs(wrap(a - b));
    const { CometTail } = await import("/js/core/CometTail.js");
    const { CometSparkle } = await import("/js/core/CometSparkle.js");
    const { Theme } = await import("/js/core/Theme.js");
    const { PictureCatalog } = await import("/js/core/PictureCatalog.js");
    const t0 = performance.now();
    while (!Theme.comets.has("tail-cyan") && performance.now() - t0 < 15000) {
      await new Promise(r => setTimeout(r, 40));
    }

    const orig = CanvasRenderingContext2D.prototype.drawImage;
    const bag = [];
    const hook = () => {
      bag.length = 0;
      CanvasRenderingContext2D.prototype.drawImage = function (img) {
        const src = img && (img.currentSrc || img.src || "");
        if (typeof src === "string" && src.indexOf("comet-tail") >= 0) {
          const m = this.getTransform();
          const nine = arguments.length >= 9;
          bag.push({
            ang: Math.atan2(m.b, m.a),
            x: m.e, y: m.f,
            dx: nine ? arguments[5] : 0,
            dy: nine ? arguments[6] : 0,
            dw: nine ? arguments[7] : 0,
            dh: nine ? arguments[8] : 0,
            alpha: this.globalAlpha
          });
        }
        return orig.apply(this, arguments);
      };
    };
    const unhook = () => { CanvasRenderingContext2D.prototype.drawImage = orig; };
    const extent = (hx, hy) => {
      let max = 0;
      for (const d of bag) {
        const lx = d.dx + d.dw;
        const ly = d.dy + d.dh * 0.5;
        const wx = d.x + Math.cos(d.ang) * lx - Math.sin(d.ang) * ly;
        const wy = d.y + Math.sin(d.ang) * lx + Math.cos(d.ang) * ly;
        max = Math.max(max, Math.hypot(wx - hx, wy - hy));
      }
      return max;
    };
    const nearest = (hx, hy) => {
      let best = null;
      let dd = Infinity;
      for (const d of bag) {
        const q = (d.x - hx) ** 2 + (d.y - hy) ** 2;
        if (q < dd) { dd = q; best = d; }
      }
      return best;
    };
    const farthest = (hx, hy) => {
      let best = null;
      let dd = -1;
      for (const d of bag) {
        const q = (d.x - hx) ** 2 + (d.y - hy) ** 2;
        if (q > dd) { dd = q; best = d; }
      }
      return best;
    };

    const c = document.createElement("canvas").getContext("2d");
    const out = {};

    // --- 90° arc ---
    const R = 48;
    const steps = 90;
    const arc = [];
    const curve = new CometTail(0);
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * Math.PI / 2;
      arc.push({ x: R * Math.sin(theta), y: R * (1 - Math.cos(theta)), theta });
      curve.sample(arc[i].x, arc[i].y, 1, 10000, false);
    }
    const end = arc[arc.length - 1];
    const prev = arc[arc.length - 2];
    const headBack = Math.atan2(-(end.y - prev.y), -(end.x - prev.x));
    const startStep = arc[2];
    const startBack = Math.atan2(-(startStep.y - arc[1].y), -(startStep.x - arc[1].x));
    hook();
    const drewCurve = curve.drawComet(c, 200, 200, 6, 1, "", 6, curve.speed, 0, false, 0);
    unhook();
    const head = nearest(200, 200);
    const tip = farthest(200, 200);
    const headErr = head ? diff(head.ang, headBack) : 9;
    const bend = head && tip ? diff(head.ang, tip.ang) : 0;
    // Where a rigid plank would put the tip, versus the earlier arc.
    const along = tip ? Math.hypot(tip.x - 200, tip.y - 200) : 0;
    const rigidX = 200 + Math.cos(head.ang) * along;
    const rigidY = 200 + Math.sin(head.ang) * along;
    const backDist = along / R;
    const thetaTip = Math.PI / 2 - backDist;
    const early = {
      x: 200 + (R * Math.sin(Math.max(0, thetaTip)) - end.x),
      y: 200 + (R * (1 - Math.cos(Math.max(0, thetaTip))) - end.y)
    };
    const tipToEarly = tip ? Math.hypot(tip.x - early.x, tip.y - early.y) : 99;
    const tipToRigid = tip ? Math.hypot(tip.x - rigidX, tip.y - rigidY) : 0;
    out.curve = {
      drew: !!drewCurve,
      slices: bag.length,
      headErr: +headErr.toFixed(3),
      bend: +bend.toFixed(3),
      tipToEarly: +tipToEarly.toFixed(2),
      tipToRigid: +tipToRigid.toFixed(2),
      count: curve.count,
      speed: +curve.speed.toFixed(3),
      ok: !!drewCurve && bag.length >= 10 && headErr < 0.35 && bend >= 0.45 && tipToEarly + 4 < tipToRigid
    };

    // Straight fallback for callers that never sample.
    const straight = new CometTail(0.4);
    straight.aimed = true;
    hook();
    const drewStraight = straight.drawComet(c, 40, 40, 12, 1, "", 12, 1, 0);
    unhook();
    out.straight = {
      drew: !!drewStraight,
      slices: bag.length,
      ok: !!drewStraight && bag.length >= 10 && straight.count < 2
    };

    // Speed: rest wisp versus a fast run.
    const rest = new CometTail(0.2);
    hook();
    rest.drawComet(c, 80, 80, 6, 1, "", 6, 0, 0, true, 0);
    const restExtent = extent(80, 80);
    const restAlpha = bag[0] ? bag[0].alpha : 0;
    unhook();
    const fast = new CometTail(0);
    for (let i = 1; i <= 90; i++) fast.sample(i * 1.7, 0, 1, 10000, false);
    hook();
    fast.drawComet(c, 80, 80, 6, 1, "", 6, fast.speed, 0, false, 0);
    const fastExtent = extent(80, 80);
    const fastAlpha = bag[0] ? bag[0].alpha : 0;
    unhook();
    out.speed = {
      restExtent: +restExtent.toFixed(2),
      fastExtent: +fastExtent.toFixed(2),
      restAlpha: +restAlpha.toFixed(3),
      fastAlpha: +fastAlpha.toFixed(3),
      fastSpeed: +fast.speed.toFixed(3),
      ok: restExtent < 5 * 6 && fastExtent >= 10 * 6 && restAlpha < 0.55 && restAlpha > 0.25 && fastAlpha > 0.75
    };

    // Consume dissolves the same fast trail.
    const spans = [];
    const alphas = [];
    for (const consume of [0, 0.45, 0.9]) {
      hook();
      fast.drawComet(c, 80, 80, 6, 1, "", 6, fast.speed, 0, false, consume);
      spans.push(+extent(80, 80).toFixed(2));
      alphas.push(+(bag[0] ? bag[0].alpha : 0).toFixed(3));
      unhook();
    }
    out.consume = {
      spans, alphas,
      ok: spans[0] > spans[1] && spans[1] > spans[2] && alphas[0] > alphas[1] && alphas[1] > alphas[2] && spans[2] < spans[0] * 0.25
    };

    // Respawn / wrap drops the path. The old heading stays.
    const jump = new CometTail();
    for (let i = 1; i <= 24; i++) jump.sample(i * 2, 0, 1, 400, false);
    const angBefore = jump.ang;
    jump.sample(9000, -4000, 1, 400, false);
    hook();
    jump.drawComet(c, 30, 30, 6, 1, "", 6, 0, 0, false, 0);
    const jumpExtent = extent(30, 30);
    unhook();
    out.respawn = {
      count: jump.count,
      speed: jump.speed,
      angErr: +diff(jump.ang, angBefore).toFixed(3),
      extent: +jumpExtent.toFixed(2),
      ok: jump.count === 1 && jump.speed === 0 && diff(jump.ang, angBefore) < 0.05 && jumpExtent < 5 * 6
    };

    // Reduce Motion: no billow, no sparkles.
    const mot = new CometTail(0);
    for (let i = 1; i <= 40; i++) mot.sample(i * 1.4, 0, 1, 10000, false);
    mot.phase = Math.PI / 2 + 1.15;
    const perp = (still) => {
      hook();
      mot.drawComet(c, 100, 100, 10, 1, "", 10, mot.speed, 0, still, 0);
      let maxDy = 0;
      for (const d of bag) maxDy = Math.max(maxDy, Math.abs(d.y - 100));
      unhook();
      return maxDy;
    };
    const phaseBefore = mot.phase;
    mot.sample(40 * 1.4, 0, 1, 10000, true);
    const dyStill = perp(true);
    const dyLive = perp(false);
    const e = { x: 0, y: 0, seed: 3, radius: 8, consuming: false, consumed: false };
    for (let i = 0; i < CometSparkle.CAP; i++) {
      CometSparkle.slots[i].on = false;
      CometSparkle.slots[i].e = null;
    }
    CometSparkle.begin(1, true);
    for (let i = 0; i < 8; i++) {
      CometSparkle.note(e);
      CometSparkle.spawn(e, mot.ang, 1.4, 8, mot);
      CometSparkle.begin(1, true);
    }
    let stillMotes = 0;
    for (let i = 0; i < CometSparkle.CAP; i++) if (CometSparkle.slots[i].on) stillMotes++;
    out.still = {
      dyStill: +dyStill.toFixed(3),
      dyLive: +dyLive.toFixed(3),
      phaseHeld: Math.abs(mot.phase - phaseBefore) < 1e-9,
      stillMotes,
      ok: dyStill < 0.08 && dyLive > 0.25 && Math.abs(mot.phase - phaseBefore) < 1e-9 && stillMotes === 0
    };

    // Sparkles follow the curve, then release as the comet is eaten.
    for (let i = 0; i < CometSparkle.CAP; i++) {
      CometSparkle.slots[i].on = false;
      CometSparkle.slots[i].e = null;
    }
    const host = { x: end.x, y: end.y, seed: 9, radius: 6, consuming: false, consumed: false, tail: curve };
    CometSparkle.begin(1, false);
    for (let i = 0; i < 36; i++) {
      CometSparkle.note(host);
      CometSparkle.spawn(host, curve.ang, 1.3, 6, curve);
      CometSparkle.begin(1, false);
    }
    let motes = 0;
    let onCurve = 0;
    let offCurve = 0;
    for (let i = 0; i < CometSparkle.CAP; i++) {
      const s = CometSparkle.slots[i];
      if (!s.on || s.e !== host) continue;
      motes++;
      // A rigid plank would sit on the trailing ray. The wake is the arc.
      const rigid = Math.hypot((s.x - end.x) - Math.cos(curve.ang) * Math.hypot(s.x - end.x, s.y - end.y), (s.y - end.y) - Math.sin(curve.ang) * Math.hypot(s.x - end.x, s.y - end.y));
      let best = 1e9;
      for (const p of arc) best = Math.min(best, Math.hypot(s.x - p.x, s.y - p.y));
      if (best < 10) onCurve++;
      if (rigid > 4) offCurve++;
    }
    host.consuming = true;
    host.consumeProgress = 0.95;
    CometSparkle.note(host);
    CometSparkle.begin(1, false);
    let left = 0;
    for (let i = 0; i < CometSparkle.CAP; i++) if (CometSparkle.slots[i].on) left++;
    out.spark = {
      motes, onCurve, offCurve, left,
      ok: motes >= 3 && onCurve >= 1 && left === 0
    };

    // Zoom does not swing the ribbon. A second draw at another scale keeps angles.
    hook();
    curve.drawComet(c, 200, 200, 6, 1, "", 6, curve.speed, 0, false, 0);
    const before = bag.map(d => ({ ang: d.ang, x: d.x - 200, y: d.y - 200 }));
    unhook();
    c.setTransform(1.85, 0, 0, 1.85, 0, 0);
    hook();
    curve.drawComet(c, 200, 200, 6, 1, "", 6, curve.speed, 0, false, 0);
    let zoomWorst = 0;
    const n = Math.min(before.length, bag.length);
    for (let i = 0; i < n; i++) {
      zoomWorst = Math.max(zoomWorst, diff(bag[i].ang, before[i].ang));
      const ox = (bag[i].x / 1.85) - 200;
      const oy = (bag[i].y / 1.85) - 200;
      zoomWorst = Math.max(zoomWorst, Math.hypot(ox - before[i].x, oy - before[i].y));
    }
    unhook();
    c.setTransform(1, 0, 0, 1, 0, 0);
    out.zoom = {
      n, zoomWorst: +zoomWorst.toFixed(4),
      ok: n >= 10 && zoomWorst < 0.05
    };

    // blitSlice refuses an empty slice and draws a real one.
    const spr = Theme.comets.sprite("tail-cyan");
    const guard = Theme.comets.blitSlice(c, spr, 0, 0, 0, 10, 0, 0, 10, 10);
    const guard2 = Theme.comets.blitSlice(c, null, 0, 0, 4, 4, 0, 0, 4, 4);
    hook();
    const drewSlice = Theme.comets.blitSlice(c, spr, 0, 0, 32, spr.h, 0, 0, 20, 8);
    unhook();
    out.slice = {
      guard: guard === false && guard2 === false && drewSlice === true && bag.length === 1,
      ok: guard === false && guard2 === false && drewSlice === true && bag.length === 1
    };
    const oob = Theme.comets.blitSlice(c, spr, 9000, 0, 20, 20, 0, 0, 20, 20);
    out.slice.oob = oob === false;
    out.slice.ok = out.slice.ok && oob === false;
    out.catalog = PictureCatalog.prototype.blitSlice === Theme.comets.blitSlice;

    // A missing tail picture draws nothing and does not throw.
    const spriteOf = Theme.comets.sprite.bind(Theme.comets);
    Theme.comets.sprite = (id) => (String(id).indexOf("tail") >= 0 ? null : spriteOf(id));
    const bare = new CometTail(0.3);
    bare.aimed = true;
    let threw = false;
    let drewMissing = true;
    try {
      drewMissing = bare.drawComet(c, 16, 16, 8, 1, "", 8, 1, 0, true, 0);
    } catch (err) {
      threw = true;
    }
    Theme.comets.sprite = spriteOf;
    out.missing = { drew: drewMissing, threw, ok: drewMissing === false && !threw };

    // Real pixels at 2 device px per world unit. Floor and ceiling samples
    // at every slice joint, plus a short wisp against one unsliced stamp.
    const seam = (() => {
      const dpr = 2;
      const lumOf = (data, i) => 0.2 * data[i] + 0.7 * data[i + 1] + 0.1 * data[i + 2];
      const med = (arr) => {
        const a = arr.slice().sort((p, q) => p - q);
        const m = a.length >> 1;
        return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
      };
      const pix = (img, W, H, x, y) => {
        const xi = Math.round(x), yi = Math.round(y);
        if (xi < 0 || yi < 0 || xi >= W || yi >= H) return { l: 0, a: 0 };
        const i = (yi * W + xi) * 4;
        return { l: lumOf(img, i), a: img[i + 3] };
      };
      const corners = (x, y) => [
        [Math.floor(x), Math.floor(y)],
        [Math.ceil(x), Math.ceil(y)]
      ];
      const extremes = (img, W, H, points, tx, ty) => {
        let dip = 0, spike = 0, n = 0;
        for (const pt of points) {
          for (const [cx, cy] of corners(pt.x, pt.y)) {
            const neigh = [];
            for (let k = -8; k <= 8; k++) {
              if (Math.abs(k) <= 1) continue;
              neigh.push(pix(img, W, H, cx + tx * k, cy + ty * k).l);
            }
            const m = med(neigh);
            if (!(m > 16)) continue;
            const e = (pix(img, W, H, cx, cy).l - m) / m;
            if (-e > dip) dip = -e;
            if (e > spike) spike = e;
            n++;
          }
        }
        return { dip, spike, n };
      };
      const inkSpr = Theme.comets.sprite("tail-cyan");
      const srcEnd = inkSpr.inkEndPx;
      const sw0 = inkSpr.w;
      const pivot = inkSpr.pivot[0];
      const sh = inkSpr.h;
      const rr = 8;

      const th = Math.PI / 6;
      const straight = document.createElement("canvas");
      straight.width = 1100; straight.height = 800;
      const sg = straight.getContext("2d", { willReadFrequently: true });
      sg.setTransform(dpr, 0, 0, dpr, 0, 0);
      const line = new CometTail(th + Math.PI);
      for (let i = 0; i <= 120; i++) line.sample(Math.cos(th) * i * 1.8, Math.sin(th) * i * 1.8, 1, 1e6, true);
      const hx = 320, hy = 240;
      line.drawComet(sg, hx, hy, rr, 1, "", rr, 1.8, 0, true, 0);
      const simg = sg.getImageData(0, 0, straight.width, straight.height).data;
      const active = rr * line._plume(Math.max(line.speed, 1.8));
      const reach = ((srcEnd - pivot) / sw0) * active;
      const tx = Math.cos(line.ang), ty = Math.sin(line.ang);
      const pxu = -ty, pyu = tx;
      let half = 0;
      const midX = (hx + tx * reach * 0.4) * dpr, midY = (hy + ty * reach * 0.4) * dpr;
      for (let s = 1; s < 60; s++) {
        if (pix(simg, straight.width, straight.height, midX + pxu * s, midY + pyu * s).a < 24) break;
        half = s;
      }
      const off = Math.max(4, Math.round(half * 0.4));
      const rotPts = [];
      const Ns = line.slices;
      for (let i = 1; i < Ns; i++) {
        const dist = ((srcEnd * i / Ns - pivot) / sw0) * active;
        if (dist < reach * 0.2 || dist > reach * 0.62) continue;
        const x = (hx + tx * dist) * dpr, y = (hy + ty * dist) * dpr;
        rotPts.push({ x, y }, { x: x + pxu * off, y: y + pyu * off }, { x: x - pxu * off, y: y - pyu * off });
      }
      const rotRaw = extremes(simg, straight.width, straight.height, rotPts, tx, ty);
      const rot = {
        slices: Ns, joints: rotPts.length, half,
        dip: +rotRaw.dip.toFixed(4), spike: +rotRaw.spike.toFixed(4), n: rotRaw.n
      };

      const bent = document.createElement("canvas");
      bent.width = 1100; bent.height = 1000;
      const bg = bent.getContext("2d", { willReadFrequently: true });
      bg.setTransform(dpr, 0, 0, dpr, 0, 0);
      const R = 48;
      const curveTail = new CometTail(0);
      for (let i = 0; i <= 100; i++) {
        const a = (i / 100) * Math.PI / 2;
        curveTail.sample(R * Math.sin(a), R * (1 - Math.cos(a)), 1, 1e6, true);
      }
      const cx = 340, cy = 400;
      curveTail.drawComet(bg, cx, cy, rr, 1, "", rr, curveTail.speed, 0, true, 0);
      const bimg = bg.getImageData(0, 0, bent.width, bent.height).data;
      const activeB = Math.min(rr * curveTail._plume(curveTail.speed), Math.max(rr * 2.2, curveTail._length() * 1.15));
      const ink = ((srcEnd - pivot) / sw0) * activeB;
      const Nb = curveTail.slices;
      let dip = 0, spike = 0, minA = 255, zeros = 0, nArc = 0, joints = 0;
      for (let i = 1; i < Nb; i++) {
        const dist = ((srcEnd * i / Nb - pivot) / sw0) * activeB;
        if (dist < ink * 0.18 || dist > ink * 0.68) continue;
        const p = { x: 0, y: 0, ang: 0 };
        if (!curveTail.pointAt(dist, p)) continue;
        joints++;
        const ol = Math.hypot(p.x, p.y - R) || 1;
        const nx = p.x / ol, ny = (p.y - R) / ol;
        const dx = (cx + (p.x - R)) * dpr, dy = (cy + (p.y - R)) * dpr;
        let edge = 0;
        for (let k = 1; k < 36; k++) {
          if (pix(bimg, bent.width, bent.height, dx + nx * k, dy + ny * k).a < 20) break;
          edge = k;
        }
        const band = Math.max(2, Math.round(edge * 0.5));
        const outer = pix(bimg, bent.width, bent.height, dx + nx * band, dy + ny * band);
        if (outer.a < minA) minA = outer.a;
        if (outer.a === 0) zeros++;
        const tangX = Math.cos(p.ang), tangY = Math.sin(p.ang);
        const spots = [
          { x: dx, y: dy },
          { x: dx + nx * band, y: dy + ny * band },
          { x: dx - nx * band, y: dy - ny * band }
        ];
        for (const pt of spots) {
          for (const [sx, sy] of corners(pt.x, pt.y)) {
            const neigh = [];
            for (let k = -6; k <= 6; k++) {
              if (Math.abs(k) <= 1) continue;
              neigh.push(pix(bimg, bent.width, bent.height, sx + tangX * k, sy + tangY * k).l);
            }
            const m = med(neigh);
            if (!(m > 16)) continue;
            const e = (pix(bimg, bent.width, bent.height, sx, sy).l - m) / m;
            if (-e > dip) dip = -e;
            if (e > spike) spike = e;
            nArc++;
          }
        }
      }
      const arc = {
        slices: Nb, joints, minA, zeros, n: nArc,
        dip: +dip.toFixed(4), spike: +spike.toFixed(4)
      };

      const restC = document.createElement("canvas");
      restC.width = 800; restC.height = 400;
      const rg = restC.getContext("2d", { willReadFrequently: true });
      rg.setTransform(dpr, 0, 0, dpr, 0, 0);
      const restTail = new CometTail(0);
      const rx = 80, ry = 110;
      restTail.drawComet(rg, rx, ry, rr, 1, "", rr, 0, 0, true, 0);
      const imgS = rg.getImageData(0, 0, restC.width, restC.height).data;
      rg.setTransform(1, 0, 0, 1, 0, 0);
      rg.clearRect(0, 0, restC.width, restC.height);
      rg.setTransform(dpr, 0, 0, dpr, 0, 0);
      const actR = rr * 2.7;
      const baseH = actR * (sh / sw0);
      const py = inkSpr.pivot[1] / sh;
      rg.save();
      rg.translate(rx, ry);
      rg.globalCompositeOperation = "screen";
      rg.globalAlpha = 0.42;
      rg.drawImage(inkSpr.image, 0, 0, srcEnd, sh, ((0 - pivot) / sw0) * actR, -py * baseH, (srcEnd / sw0) * actR, baseH);
      rg.restore();
      const imgR = rg.getImageData(0, 0, restC.width, restC.height).data;
      const reachR = ((srcEnd - pivot) / sw0) * actR;
      const x0 = Math.round((rx + reachR * 0.18) * dpr);
      const x1 = Math.round((rx + reachR * 0.55) * dpr);
      let sumS = 0, sumRef = 0, ns = 0, nr = 0;
      for (let y = 0; y < restC.height; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * restC.width + x) * 4;
          if (imgS[i + 3] > 16) { sumS += lumOf(imgS, i); ns++; }
          if (imgR[i + 3] > 16) { sumRef += lumOf(imgR, i); nr++; }
        }
      }
      const meanS = ns ? sumS / ns : 0;
      const meanRef = nr ? sumRef / nr : 1;
      const rpts = [];
      for (let i = 1; i < restTail.slices; i++) {
        const dist = ((srcEnd * i / restTail.slices - pivot) / sw0) * actR;
        if (dist < reachR * 0.22 || dist > reachR * 0.55) continue;
        rpts.push({ x: (rx + dist) * dpr, y: ry * dpr });
      }
      const restJ = extremes(imgS, restC.width, restC.height, rpts, 1, 0);
      const rest = {
        slices: restTail.slices,
        diff: +((Math.abs(meanS - meanRef) / meanRef).toFixed(4)),
        dip: +restJ.dip.toFixed(4),
        spike: +restJ.spike.toFixed(4)
      };
      const ok = rot.n >= 20 && rot.dip <= 0.05 && rot.spike <= 0.05
        && arc.joints >= 8 && arc.zeros === 0 && arc.minA >= 12
        && arc.dip <= 0.05 && arc.spike <= 0.08
        && rest.slices >= 4 && rest.slices < 20
        && rest.diff <= 0.05 && rest.dip <= 0.05;
      return { rot, arc, rest, ok };
    })();
    out.seam = seam;

    // Live Galaxy 2: a real comet is driven around the same quarter turn.
    const bh = window.__bh;
    const s = bh.state;
    s.paused = true;
    const worlds = await import("/js/worlds.js");
    const entities = await import("/js/entities.js");
    const living = await import("/js/living-world.js");
    Object.assign(bh.dev.cfg, { galaxy: 2, biome: "Comet Current", tier: 3, depth: 1, zen: false, wisp: false });
    bh.dev.enter();
    s.paused = true;
    bh.camera.updateScale(window.innerWidth, window.innerHeight, true);
    const comet = s.entities.find(e => e.hasTail && !e.consumed);
    let live = { ok: false, reason: "no comet" };
    if (comet) {
      const ox = s.playerX;
      const oy = s.playerY;
      if (!comet.tail) comet.tail = new CometTail();
      comet.tail.reset();
      comet._spawnAlpha = 1;
      const dpr = (bh.display && bh.display.dpr) || window.devicePixelRatio || 1;
      for (let i = 0; i <= 70; i++) {
        const theta = (i / 70) * Math.PI / 2;
        living.updateLivingWorld(s, 1, 1);
        worlds.updateWorlds(s, 1, 1);
        entities.updateEntities(s.entities, s.bounds, 1);
        if (s.entities.indexOf(comet) < 0) s.entities.push(comet);
        comet.consumed = false;
        comet.consuming = false;
        comet.vx = 0;
        comet.vy = 0;
        comet.x = ox + R * Math.sin(theta);
        comet.y = oy + R * (1 - Math.cos(theta));
        s.camX = ox + R * 0.5;
        s.camY = oy + R * 0.3;
        s.playerX = s.camX;
        s.playerY = s.camY;
        bh.scene.draw(1000 + i * 16, 1, false);
      }
      hook();
      bh.scene.draw(2200, 1, false);
      unhook();
      const z = s.zoom || 1;
      const hx = (comet.x - s.camX + s.viewW / 2) * z * dpr;
      const hy = (comet.y - s.camY + s.viewH / 2) * z * dpr;
      const cap = (comet.radius * 22 + 48) * z * dpr;
      let near = 0;
      let best = null;
      let bestD = Infinity;
      let far = null;
      let farD = -1;
      for (const d of bag) {
        const q = Math.hypot(d.x - hx, d.y - hy);
        if (q > cap) continue;
        near++;
        if (q < bestD) { bestD = q; best = d; }
        if (q > farD) { farD = q; far = d; }
      }
      const last = arc[arc.length - 1];
      const beforeLast = arc[arc.length - 2];
      const expect = Math.atan2(-(last.y - beforeLast.y), -(last.x - beforeLast.x));
      // The live comet followed the same shape, so the end tangent matches headBack.
      const liveHead = best ? diff(best.ang, headBack) : 9;
      const liveBend = best && far ? diff(best.ang, far.ang) : 0;
      // Natural neighbours still stamp a sliced tail.
      let natural = 0;
      for (const e of s.entities) {
        if (!e.hasTail || e.consumed || e === comet || !e.tail) continue;
        const ex = (e.x - s.camX + s.viewW / 2) * z * dpr;
        const ey = (e.y - s.camY + s.viewH / 2) * z * dpr;
        let n = 0;
        for (const d of bag) if (Math.hypot(d.x - ex, d.y - ey) < 80 * dpr) n++;
        if (n > natural) natural = n;
      }
      const vx = s.playerVX;
      const vy = s.playerVY;
      const z0 = s.zoom;
      s.zoom = z0 * 1.85;
      s.playerVX = -vy || -0.4;
      s.playerVY = vx || 0.4;
      hook();
      bh.scene.draw(2300, 1, false);
      unhook();
      const hx2 = (comet.x - s.camX + s.viewW / 2) * s.zoom * dpr;
      const hy2 = (comet.y - s.camY + s.viewH / 2) * s.zoom * dpr;
      let best2 = null;
      let best2D = Infinity;
      for (const d of bag) {
        const q = Math.hypot(d.x - hx2, d.y - hy2);
        if (q < best2D) { best2D = q; best2 = d; }
      }
      const steerErr = best && best2 ? diff(best.ang, best2.ang) : 9;
      s.zoom = z0;
      s.playerVX = vx;
      s.playerVY = vy;
      live = {
        slices: near,
        natural,
        bestD: +bestD.toFixed(1),
        headErr: +liveHead.toFixed(3),
        bend: +liveBend.toFixed(3),
        steerErr: +steerErr.toFixed(3),
        expect: +expect.toFixed(3),
        ok: near >= 10 && bestD < 24 * dpr && liveHead < 0.4 && liveBend >= 0.45 && steerErr < 0.08
      };
    }
    out.live = live;

    const game = await (await fetch("/js/game.js")).text();
    const sw = await (await fetch("/sw.js")).text();
    const version = (game.match(/const VERSION = "([^"]+)"/) || [])[1];
    const cache = (sw.match(/const CACHE_NAME = "([^"]+)"/) || [])[1];
    out.release = { version, cache };

    out.ok = out.curve.ok && out.straight.ok && out.speed.ok && out.consume.ok
      && out.respawn.ok && out.still.ok && out.spark.ok && out.zoom.ok
      && out.slice.ok && out.missing.ok && out.seam.ok && out.live.ok;
    return out;
  });

  let shot = null;
  try { shot = await shots(page); }
  catch (err) { fail.push({ reason: "shot", err: String(err).slice(0, 300) }); }

  await browser.close();
  if (result && result.release && files.release) {
    result.release.ok = !!(files.release.ok
      && result.release.version === files.release.version
      && result.release.cache === files.release.cache);
    if (!result.release.ok) result.ok = false;
  }
  if (!result.ok) fail.push({ reason: "play", result });
  if (errs.length) fail.push({ reason: "console", errs });
  const ok = fail.length === 0 && files.ok;
  const text = JSON.stringify({ ok, files: { ok: files.ok, release: files.release, slice: files.slice, inkOk: files.inkOk, wired: files.wired, owners: files.owners }, result, errs, shot }, null, 2);
  console.log(text);
  process.exit(ok ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
