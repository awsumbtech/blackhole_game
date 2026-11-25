// v9.15.1 loop friction.
// Birth accepts a drag, the steer hint meets that drag, the old Zen line is
// gone, hints wait 2.5s, Skip is a 44px target, and a rebirth skips the wordmark.
//   node tools/v9151-loop-friction.cjs [port]
// Exit 0 when every check passed.

const fs = require("fs");
const path = require("path");
const { Browser } = require("./lib/browser.cjs");
const { releaseAgrees } = require("./lib/release.cjs");
const { chromium } = Browser.playwrightCore();

const PORT = process.argv[2] || "8765";
const CHROME = Browser.chromePath(chromium);
const ART = fs.existsSync("/opt/cursor/artifacts")
  ? "/opt/cursor/artifacts"
  : path.join(require("os").tmpdir(), "v9151");
const ZEN = "Zen mode is on";
const STEER = /drag to steer|Move with the mouse or WASD/;

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
    procedural: /fillRect|strokeRect|beginPath|createLinearGradient|createRadialGradient|\.arc\s*\(|\.stroke\s*\(|createElement\(\s*["']canvas["']\)/.test(stripped)
  };
}

function zenHits() {
  const hits = [];
  const walk = dir => {
    for (const name of fs.readdirSync(dir)) {
      if (name === "node_modules") continue;
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (name.endsWith(".js") && fs.readFileSync(p, "utf8").includes(ZEN)) hits.push(p);
    }
  };
  walk("js");
  return hits;
}

function filesGate() {
  const owners = [
    "js/core/Hud.js",
    "js/core/ScreenFlow.js",
    "js/core/CollapseFlow.js",
    "js/core/Lifecycle.js",
    "js/core/ZenSession.js"
  ].map(ownerGate);
  const flow = fs.readFileSync("js/core/ScreenFlow.js", "utf8");
  const collapse = fs.readFileSync("js/core/CollapseFlow.js", "utf8");
  const release = releaseAgrees("9.15.1");
  const birthFrames = /static BIRTH_FRAMES = 170/.test(flow);
  const steerAtBirth = /state\.birth = 0\.001;[\s\S]{0,400}game\.input\.setEnabled\(true\)/.test(flow);
  const noBirthEndUnlock = !/state\.birth = 0;\s*game\.input\.setEnabled\(true\)/.test(flow);
  const noZen = !flow.includes(ZEN) && !flow.includes("Tap Zen below") && zenHits().length === 0;
  const wordmark = /wordmark:\s*false/.test(collapse) && /o\.wordmark !== false/.test(flow);
  const hold = /static HOLD_MS = 2500/.test(fs.readFileSync("js/core/Hud.js", "utf8"));
  const ok = release.ok && birthFrames && steerAtBirth && noBirthEndUnlock && noZen && wordmark && hold
    && owners.every(o => o.classes === 1 && !o.looseFn && !o.looseState && !o.procedural);
  return { ok, release, birthFrames, steerAtBirth, noBirthEndUnlock, noZen, wordmark, hold, owners };
}

async function launch() {
  return chromium.launch({
    executablePath: CHROME,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
}

async function phone(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    reducedMotion: "no-preference",
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
  });
  const page = await context.newPage();
  const errs = [];
  page.on("pageerror", err => errs.push(String(err).slice(0, 300)));
  page._errs = errs;
  return { context, page };
}

const WATCH = () => {
  window.__friction = { markOn: [], introAt: 0, birthAt: 0 };
  const arm = () => {
    const intro = document.getElementById("intro-screen");
    const mark = document.getElementById("intro-mark");
    if (!intro || !mark || intro.dataset.v9151 === "1") return;
    intro.dataset.v9151 = "1";
    const note = () => {
      const rec = window.__friction;
      const now = performance.now();
      if (!intro.classList.contains("hidden") && !rec.introAt) rec.introAt = now;
      if (mark.classList.contains("on")) rec.markOn.push(now);
      if (intro.classList.contains("birth") && !rec.birthAt) rec.birthAt = now;
    };
    new MutationObserver(note).observe(intro, { attributes: true, attributeFilter: ["class"] });
    new MutationObserver(note).observe(mark, { attributes: true, attributeFilter: ["class"] });
    note();
  };
  const iv = setInterval(arm, 5);
  const stop = setInterval(() => {
    const intro = document.getElementById("intro-screen");
    if (intro && intro.dataset.v9151 === "1") { clearInterval(iv); clearInterval(stop); }
  }, 20);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arm);
  else arm();
};

function readHint() {
  const el = document.getElementById("hint-toast");
  if (!el || el.classList.contains("hidden")) return { ok: false, why: "hidden", text: el ? el.textContent : "" };
  const text = el.textContent || "";
  const steer = /steer|WASD/.test(text);
  const op = parseFloat(getComputedStyle(el).opacity) || 0;
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  const hit = !!(top && (top === el || el.contains(top)));
  return {
    ok: steer && op > 0.8 && hit,
    steer, op, hit, text,
    top: top ? (top.id || top.className || top.tagName) : ""
  };
}

async function pointer(page, type, x, y) {
  await page.evaluate(({ type, x, y }) => {
    const c = document.getElementById("game");
    c.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: "touch",
      clientX: x,
      clientY: y,
      buttons: type === "pointerup" ? 0 : 1,
      isPrimary: true
    }));
  }, { type, x, y });
}

function writeDataUrl(file, url) {
  const i = url.indexOf(",");
  fs.writeFileSync(file, Buffer.from(url.slice(i + 1), "base64"));
}

async function firstLaunch(browser) {
  const { context, page } = await phone(browser);
  await page.addInitScript(WATCH);
  await page.goto(`http://127.0.0.1:${PORT}/?dev&debug`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => {
    const intro = document.getElementById("intro-screen");
    return intro && !intro.classList.contains("hidden");
  }, { timeout: 20000 });

  const skip = await page.locator("#btn-skip-intro").boundingBox();
  const mark = await page.waitForFunction(() => {
    const el = document.getElementById("intro-mark");
    if (!el || !el.classList.contains("on")) return false;
    const op = parseFloat(getComputedStyle(el).opacity);
    return op > 0.5 ? { text: el.innerText, opacity: op } : false;
  }, { timeout: 8000 }).then(h => h.jsonValue());

  await page.waitForFunction(() => window.__bh && window.__bh.state.birth > 0, { timeout: 20000 });
  const hintAtBirth = await page.evaluate(() => {
    const el = document.getElementById("hint-toast");
    return {
      text: el.textContent,
      hidden: el.classList.contains("hidden"),
      coarse: matchMedia("(pointer: coarse)").matches,
      birth: window.__bh.state.birth
    };
  });
  const first = await page.evaluate(() => {
    const rec = window.__friction;
    return { introAt: rec.introAt, birthAt: rec.birthAt, dur: rec.birthAt - rec.introAt, marks: rec.markOn.length };
  });

  await page.waitForFunction(() => {
    const b = window.__bh.state.birth;
    return b > 0.01 && b < 0.25;
  }, { timeout: 8000 });
  const beforeHint = await page.evaluate(readHint);
  const box = await page.locator("#game").boundingBox();
  const x0 = box.x + box.width * 0.42;
  const y0 = box.y + Math.min(box.height * 0.55, 480);
  const before = await page.evaluate(() => ({
    x: window.__bh.state.playerX, y: window.__bh.state.playerY, b: window.__bh.state.birth
  }));
  await pointer(page, "pointerdown", x0, y0);
  await pointer(page, "pointermove", x0 + 48, y0 - 12);
  const gone = await page.evaluate(() => new Promise(resolve => {
    const start = performance.now();
    const tick = () => {
      const el = document.getElementById("hint-toast");
      const text = el ? el.textContent || "" : "";
      const hidden = !el || el.classList.contains("hidden") || !/steer|WASD/.test(text);
      const ms = performance.now() - start;
      if (hidden) resolve({ ms, text, hidden: true });
      else if (ms > 300) resolve({ ms, text, hidden: false });
      else setTimeout(tick, 20);
    };
    tick();
  }));
  await page.waitForTimeout(700);
  const mid = await page.evaluate(() => ({
    x: window.__bh.state.playerX, y: window.__bh.state.playerY, b: window.__bh.state.birth
  }));
  await pointer(page, "pointerup", x0 + 48, y0 - 12);
  const moved = Math.hypot(mid.x - before.x, mid.y - before.y);

  await page.evaluate(() => {
    const flow = window.__bh.screens;
    window.__bh.input.setTouchMode("follow");
    flow.steered = false;
    flow.firstPlayStart = true;
    flow.introKind = "fresh";
    flow.showSteerHint();
  });
  const followBefore = await page.evaluate(readHint);
  await pointer(page, "pointerdown", box.x + box.width * 0.84, box.y + box.height * 0.42);
  const followGone = await page.evaluate(() => new Promise(resolve => {
    const start = performance.now();
    const tick = () => {
      const el = document.getElementById("hint-toast");
      const text = el ? el.textContent || "" : "";
      const hidden = !el || el.classList.contains("hidden") || !/steer|WASD/.test(text);
      const ms = performance.now() - start;
      if (hidden) resolve({ ms, hidden: true, text });
      else if (ms > 300) resolve({ ms, hidden: false, text });
      else setTimeout(tick, 20);
    };
    tick();
  }));
  await pointer(page, "pointerup", box.x + box.width * 0.84, box.y + box.height * 0.42);
  await page.evaluate(() => window.__bh.input.setTouchMode("joystick"));

  await page.evaluate(() => {
    const dev = window.__bh.dev;
    dev.cfg.galaxy = 1;
    dev.cfg.biome = "";
    dev.cfg.tier = 0;
    dev.cfg.depth = 1;
    dev.cfg.zen = false;
    dev.cfg.wisp = false;
    dev.enter();
  });
  await page.waitForFunction(() => window.__bh.state.screen === "play" && window.__bh.state.birth === 0, { timeout: 8000 });
  await page.evaluate(() => {
    window.__bh.dev.open();
    const btn = document.querySelector('#dev-panel button[data-a="collapse"]');
    if (!btn) throw new Error("dev collapse button missing");
    btn.click();
  });
  await page.waitForSelector("#collapse:not(.hidden)", { timeout: 5000 });
  await page.click("#btn-collapse-yes");
  await page.waitForSelector("#singularity:not(.hidden)", { timeout: 5000 });
  await page.waitForTimeout(1600);
  await page.click("#singularity");
  await page.waitForSelector("#constellation:not(.hidden)", { timeout: 6000 });
  await page.evaluate(() => {
    window.__rebirth = { markOn: false, line: "", introAt: 0, birthAt: 0 };
    const intro = document.getElementById("intro-screen");
    const mark = document.getElementById("intro-mark");
    const line = document.getElementById("intro-line");
    const note = () => {
      const rec = window.__rebirth;
      const now = performance.now();
      if (!intro.classList.contains("hidden") && !rec.introAt) rec.introAt = now;
      if (mark.classList.contains("on")) rec.markOn = true;
      if (line.textContent) rec.line = line.textContent;
      if (intro.classList.contains("birth") && rec.introAt && !rec.birthAt) rec.birthAt = now;
    };
    new MutationObserver(note).observe(intro, { attributes: true, attributeFilter: ["class"] });
    new MutationObserver(note).observe(mark, { attributes: true, attributeFilter: ["class"] });
    new MutationObserver(note).observe(line, { attributes: true, childList: true, characterData: true, subtree: true });
    document.getElementById("btn-const-back").click();
  });
  await page.waitForFunction(() => window.__rebirth && window.__rebirth.birthAt > 0, { timeout: 16000 });
  const rebirth = await page.evaluate(() => window.__rebirth);
  rebirth.dur = rebirth.birthAt - rebirth.introAt;

  const savedMs = first.dur - rebirth.dur;
  const steerDuringBirth = moved > 8 && mid.b > 0 && before.b > 0 && before.b < 1;
  const hintOk = !hintAtBirth.hidden && STEER.test(hintAtBirth.text) && hintAtBirth.birth > 0 && hintAtBirth.birth < 0.9;
  const dragOk = !!(beforeHint && beforeHint.ok && gone.hidden && gone.ms <= 300);
  const followOk = !!(followBefore && followBefore.ok && followGone.hidden && followGone.ms <= 300);
  const result = {
    skip: skip && { w: +skip.width.toFixed(1), h: +skip.height.toFixed(1) },
    mark,
    hintAtBirth,
    beforeHint,
    gone,
    followBefore,
    followGone,
    first,
    move: { before, mid, moved: +moved.toFixed(1) },
    rebirth: { dur: rebirth.dur, markOn: rebirth.markOn, line: rebirth.line, introAt: rebirth.introAt, birthAt: rebirth.birthAt },
    savedMs: +savedMs.toFixed(0),
    errs: page._errs
  };
  result.ok = !!(skip && skip.height >= 44)
    && mark && /black hole/i.test(mark.text)
    && first.marks > 0 && first.dur > 10000
    && hintOk
    && dragOk
    && followOk
    && steerDuringBirth
    && rebirth.markOn === false
    && rebirth.dur > 7000 && rebirth.dur < first.dur - 2500
    && /Collapse|Reborn|Grow|supernova/.test(rebirth.line || "")
    && savedMs > 2800 && savedMs < 5000
    && page._errs.length === 0;
  await context.close();
  return { ok: result.ok, result };
}

async function secondLaunch(browser) {
  const { context, page } = await phone(browser);
  await page.goto(`http://127.0.0.1:${PORT}/?debug`, { waitUntil: "load", timeout: 30000 });
  await page.waitForSelector("#btn-skip-intro", { state: "visible", timeout: 20000 });
  await page.click("#btn-skip-intro");
  await page.waitForFunction(() => {
    const raw = localStorage.getItem("blackhole_galaxy_v3");
    if (!raw) return false;
    try { return JSON.parse(raw).seenHints.intro === true; } catch { return false; }
  }, { timeout: 8000 });
  await page.reload({ waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => window.__bh && window.__bh.state.screen === "play" && !window.__bh.state.birth, { timeout: 20000 });
  const zen = await page.evaluate(() => new Promise(resolve => {
    const bad = "Zen mode is on";
    const start = performance.now();
    const tick = () => {
      const toast = document.getElementById("hint-toast");
      const text = `${document.body.innerText}\n${toast ? toast.textContent : ""}`;
      if (text.includes(bad)) resolve({ found: true, at: Math.round(performance.now() - start), text: text.slice(0, 240) });
      else if (performance.now() - start >= 10000) resolve({ found: false, at: 10000 });
      else setTimeout(tick, 100);
    };
    tick();
  }));
  await page.waitForFunction(() => {
    const el = document.getElementById("hint-toast");
    return el.classList.contains("hidden");
  }, { timeout: 8000 });
  const queue = await page.evaluate(() => new Promise(resolve => {
    const el = document.getElementById("hint-toast");
    const log = [];
    let last = "";
    const sample = () => {
      const on = el && !el.classList.contains("hidden");
      const text = on ? el.textContent : "";
      if (text !== last) {
        log.push({ t: performance.now(), text });
        last = text;
      }
    };
    const obs = new MutationObserver(sample);
    obs.observe(el, { attributes: true, childList: true, characterData: true, subtree: true });
    const a = "Alpha queue hint.";
    const b = "Beta queue hint.";
    window.__bh.hud.show(a, 300);
    window.__bh.hud.show(b, 300);
    window.__bh.hud.show(a, 300);
    sample();
    const started = performance.now();
    const finish = () => {
      sample();
      obs.disconnect();
      resolve({ log, started, ended: performance.now() });
    };
    setTimeout(finish, 6200);
  }));
  const spans = [];
  for (let i = 0; i < queue.log.length; i++) {
    const row = queue.log[i];
    if (!row.text) continue;
    const end = (queue.log[i + 1] && queue.log[i + 1].t) || queue.ended;
    spans.push({ text: row.text, ms: end - row.t });
  }
  const alpha = spans.find(s => s.text.startsWith("Alpha"));
  const beta = spans.find(s => s.text.startsWith("Beta"));
  const dupes = spans.filter(s => s.text.startsWith("Alpha")).length;
  const queueOk = !!(alpha && beta && alpha.ms >= 2500 && beta.ms >= 2500 && dupes === 1);
  const units = await page.evaluate(() => {
    const hud = window.__bh.hud;
    const seen = window.__bh.state.seenHints;
    const fail = [];
    const check = (name, cond) => { if (!cond) fail.push(name); };
    hud.clear();
    ["overflow_a", "overflow_b", "overflow_c", "overflow_d", "cleared_key"].forEach(k => delete seen[k]);
    hud.show("Hold the toast.", 8000);
    hud.hint("overflow_a", "Once A", 8000);
    hud.hint("overflow_b", "Once B", 8000);
    hud.hint("overflow_c", "Once C", 8000);
    hud.hint("overflow_d", "Once D", 8000);
    check("queue cap", hud.queue.length === 3);
    check("dropped oldest", hud.queue.map(q => q.msg).join("|") === "Once B|Once C|Once D");
    check("unshown keys", !seen.overflow_a && !seen.overflow_b && !seen.overflow_c && !seen.overflow_d);
    hud.dismiss("Hold the toast.");
    check("dismiss shows next", hud.current === "Once B" && seen.overflow_b === true);
    check("rest stay queued", hud.queue.length === 2 && !seen.overflow_d);
    hud.dismiss("Once D");
    check("dismiss queued spares seen", !seen.overflow_d && hud.queue.every(q => q.msg !== "Once D") && hud.current === "Once B");
    hud.clear();
    delete seen.cleared_key;
    hud.show("Hold again.", 8000);
    hud.hint("cleared_key", "Kept for later", 8000);
    hud.clear();
    check("clear keeps the key", !seen.cleared_key);
    hud.hint("cleared_key", "Kept for later", 8000);
    check("shows after clear", hud.current === "Kept for later" && seen.cleared_key === true);
    hud.clear();
    hud.show("Sitting.", 8000);
    hud.show("Waiting.", 8000);
    hud.show("Tap now.", 700, { urgent: true });
    check("urgent shows now", hud.current === "Tap now.");
    check("urgent jumped the queue", hud.queue.length > 0 && hud.queue[0].msg === "Sitting.");
    hud.clear();
    return { ok: fail.length === 0, fail, queue: hud.queue.map(q => q.msg), current: hud.current };
  });
  const ok = zen.found === false && queueOk && units.ok && page._errs.length === 0;
  await context.close();
  return { ok, zen, spans, queueOk, units, errs: page._errs };
}

async function noDrag(browser) {
  const { context, page } = await phone(browser);
  await page.goto(`http://127.0.0.1:${PORT}/?debug`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => window.__bh && window.__bh.state.birth > 0, { timeout: 20000 });
  const trace = await page.evaluate(() => new Promise(resolve => {
    const read = () => {
      const el = document.getElementById("hint-toast");
      if (!el || el.classList.contains("hidden")) return { ok: false, why: "hidden", text: el ? el.textContent : "" };
      const text = el.textContent || "";
      const steer = /steer|WASD/.test(text);
      const op = parseFloat(getComputedStyle(el).opacity) || 0;
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const hit = !!(top && (top === el || el.contains(top)));
      return { ok: steer && op > 0.8 && hit, op, hit, text, top: top ? (top.id || String(top.className) || top.tagName) : "" };
    };
    const start = performance.now();
    const samples = [];
    const tick = () => {
      const s = read();
      s.t = Math.round(performance.now() - start);
      samples.push(s);
      if (performance.now() - start >= 2700) resolve(samples);
      else setTimeout(tick, 40);
    };
    tick();
  }));
  let broke = null;
  let end = 0;
  for (const s of trace) {
    if (!s.ok) { broke = s; break; }
    end = s.t;
  }
  const at15 = trace.filter(s => s.t >= 1480 && s.t <= 1600).pop() || trace.find(s => s.t >= 1500);
  const ok = !broke && end >= 2500 && !!(at15 && at15.ok);
  await context.close();
  return {
    ok,
    end,
    n: trace.length,
    at15: at15 && { t: at15.t, ok: at15.ok, op: at15.op, hit: at15.hit },
    broke: broke && { t: broke.t, why: broke.why, op: broke.op, hit: broke.hit, top: broke.top, text: broke.text },
    errs: page._errs
  };
}

async function hintStrip(browser) {
  const { context, page } = await phone(browser);
  await page.goto(`http://127.0.0.1:${PORT}/?dev&debug`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => {
    const b = window.__bh && window.__bh.state.birth;
    return b > 0.02 && b < 0.2;
  }, { timeout: 20000 });
  await page.evaluate(() => {
    const b = document.getElementById("dev-badge");
    if (b) b.style.visibility = "hidden";
  });
  fs.mkdirSync(ART, { recursive: true });
  const frames = [];
  for (let i = 0; i < 8; i++) {
    const shot = await page.evaluate(() => {
      const el = document.getElementById("hint-toast");
      const text = el ? el.textContent || "" : "";
      const hidden = !el || el.classList.contains("hidden");
      const r = el && !hidden ? el.getBoundingClientRect() : null;
      const top = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
      return {
        birth: window.__bh.state.birth,
        text,
        hidden,
        op: el ? parseFloat(getComputedStyle(el).opacity) || 0 : 0,
        hit: !!(el && top && (top === el || el.contains(top))),
        top: top ? (top.id || top.tagName) : ""
      };
    });
    const file = path.join(ART, `birth-hint-${String(i + 1).padStart(2, "0")}.jpg`);
    await page.screenshot({ path: file, type: "jpeg", quality: 55, animations: "disabled" });
    frames.push({ file, ...shot });
  }
  const ok = frames.length === 8 && frames.every(f => f.birth > 0 && f.birth < 1 && !f.hidden && /steer|WASD/.test(f.text) && f.op > 0.8 && f.hit);
  await context.close();
  return { ok, frames };
}

function stitch(frames) {
  const { spawnSync } = require("child_process");
  const out = path.join(ART, "birth-hint-strip.png");
  const py = `
import sys
try:
    from PIL import Image
except Exception:
    print("SKIP no PIL")
    sys.exit(0)
files = sys.argv[1:-1]
out = sys.argv[-1]
ims = [Image.open(f).convert("RGB") for f in files]
w, h = ims[0].size
gap = 6
strip = Image.new("RGB", (len(ims) * w + (len(ims) - 1) * gap, h), (8, 10, 22))
for i, im in enumerate(ims):
    strip.paste(im, (i * (w + gap), 0))
strip.save(out)
print(out, strip.size[0], strip.size[1])
`;
  const r = spawnSync("python3", ["-c", py, ...frames, out], { encoding: "utf8" });
  const note = ((r.stdout || "") + (r.stderr || "")).trim();
  if (/SKIP no PIL|No module named PIL/.test(note)) return { ok: true, skipped: true, reason: "PIL missing; strip skipped" };
  if (r.status !== 0) return { ok: true, skipped: true, reason: note.slice(0, 300) };
  return { ok: true, skipped: false, out, note };
}

async function main() {
  const files = filesGate();
  const fail = [];
  if (!files.ok) fail.push({ reason: "files", files });
  const browser = await launch();
  let birth = null;
  let again = null;
  let calm = null;
  let strip = null;
  let frames = null;
  try {
    calm = await noDrag(browser);
    if (!calm.ok) fail.push({ reason: "readable", calm });
    frames = await hintStrip(browser);
    if (!frames.ok) fail.push({ reason: "strip-frames", frames: frames.frames && frames.frames.map(f => ({ birth: f.birth, text: f.text, op: f.op, hit: f.hit })) });
    if (frames.frames && frames.frames.length === 8) strip = stitch(frames.frames.map(f => f.file));
    birth = await firstLaunch(browser);
    if (!birth.ok) fail.push({ reason: "birth", result: birth.result });
    again = await secondLaunch(browser);
    if (!again.ok) fail.push({ reason: "second", again });
  } catch (err) {
    fail.push({ reason: "throw", err: String(err).slice(0, 800) });
  }
  await browser.close();
  const ok = fail.length === 0 && files.ok;
  const text = JSON.stringify({
    ok,
    files: { ok: files.ok, release: files.release, birthFrames: files.birthFrames, steerAtBirth: files.steerAtBirth, noZen: files.noZen, wordmark: files.wordmark, hold: files.hold, owners: files.owners },
    calm,
    strip,
    birth: birth && birth.result,
    again: again && { ok: again.ok, zen: again.zen, spans: again.spans, units: again.units, errs: again.errs },
    fail
  }, null, 2);
  console.log(text);
  process.exit(ok ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
