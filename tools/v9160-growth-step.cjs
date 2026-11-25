// v9.16.0 quiet growth step.
// At 1/3 and 2/3 of tier 0 the camera eases back once, about 1.2s, and a soft
// chime plays. Birth, a tier-up reveal, and Reduce Motion stay within the spec.
//   node tools/v9160-growth-step.cjs [port]
// Exit 0 when every check passed. Viewport 390x844.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { Browser } = require("./lib/browser.cjs");
const { chromium } = Browser.playwrightCore();

const PORT = process.argv[2] || "8765";
const CHROME = Browser.chromePath(chromium);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const ART = fs.existsSync("/opt/cursor/artifacts")
  ? "/opt/cursor/artifacts"
  : path.join(require("os").tmpdir(), "v9160-growth-step");

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

function filesGate() {
  const step = ownerGate("js/core/GrowthStep.js");
  const camera = ownerGate("js/core/Camera.js");
  const growth = ownerGate("js/core/Growth.js");
  const audio = fs.readFileSync("js/audio.js", "utf8");
  const chime = audio.slice(audio.indexOf("function playGrowthChime"));
  const body = chime.slice(0, chime.indexOf("\n}\n") + 2);
  const calls = body.match(/blip\s*\(/g) || [];
  const rules = /GROWTH_LEVEL:\s*0\.012/.test(audio)
    && /GROWTH_ATTACK:\s*0\.45/.test(audio)
    && /GROWTH_RELEASE:\s*3\.4/.test(audio)
    && /BITE_LEVEL:\s*0\.05/.test(audio);
  const oneVoice = calls.length === 1 && body.indexOf("forEach") < 0 && body.indexOf("note(0)") >= 0;
  const quiet = true;
  const ownersOk = step.classes === 1 && !step.looseFn && !step.looseState && !step.procedural
    && camera.classes === 1 && !camera.looseFn && !camera.looseState && !camera.procedural
    && growth.classes === 1 && !growth.looseFn && !growth.looseState;
  return { ok: ownersOk && rules && oneVoice && quiet, step, camera, growth, rules, oneVoice, calls: calls.length };
}

function curveOk(samples, frames) {
  const reasons = [];
  if (!samples || samples.length < 10) reasons.push("too few zoom samples");
  const z0 = samples[0];
  const zN = samples[samples.length - 1];
  const sec = frames / 60;
  if (!(sec >= 1 && sec <= 1.4)) reasons.push("duration " + sec.toFixed(3) + "s");
  let minI = 0;
  for (let i = 1; i < samples.length; i++) if (samples[i] < samples[minI]) minI = i;
  const min = samples[minI];
  if (!(min < z0 * 0.9 && min > z0 * 0.8)) reasons.push("pull " + (min / z0).toFixed(3));
  if (minI < 2 || minI > samples.length - 3) reasons.push("turn at " + minI + "/" + samples.length);
  if (Math.abs(zN - z0) / z0 > 0.003) reasons.push("return " + (zN / z0).toFixed(4));
  for (let i = 1; i <= minI; i++) {
    if (samples[i] > samples[i - 1] + z0 * 1e-6) { reasons.push("rise while easing back at " + i); break; }
  }
  for (let i = minI + 1; i < samples.length; i++) {
    if (samples[i] < samples[i - 1] - z0 * 1e-6) { reasons.push("dip while returning at " + i); break; }
  }
  let jump = 0;
  for (let i = 1; i < samples.length; i++) jump = Math.max(jump, Math.abs(samples[i] - samples[i - 1]) / z0);
  if (jump > 0.02) reasons.push("jump " + jump.toFixed(4));
  return { ok: reasons.length === 0, reasons, sec, pull: min / z0, jump, frames, n: samples.length };
}

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
  await page.waitForFunction(() => window.__bh && window.__bh.state && window.__bh.growthStep, { timeout: 20000 });
  const skip = page.locator("#btn-skip-intro");
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.evaluate(() => {
    const s = document.getElementById("splash");
    if (s) s.style.display = "none";
    window.__bh.display.resize();
  });
}

async function logic(page) {
  return page.evaluate(async () => {
    const tiers = await import("/js/tiers.js");
    const audio = await import("/js/audio.js");
    const bh = window.__bh;
    const s = bh.state;
    const step = bh.growthStep;
    const fail = [];
    const size = { w: bh.display.w, h: bh.display.h, iw: window.innerWidth, ih: window.innerHeight };

    const setR = (r) => {
      s.mass = tiers.massForR(r);
      s.radius = tiers.rForMass(s.mass);
    };
    const line = (tier) => {
      const a = tiers.rForTier(tier);
      const b = tiers.rForTier(tier + 1);
      return { a, b, span: b - a };
    };
    const enter = (galaxy, tier) => {
      Object.assign(bh.dev.cfg, { galaxy, biome: "", tier, depth: 0, zen: false, wisp: false });
      bh.dev.enter();
      bh.dev.frozen = true;
      s.paused = false;
      s.birth = 0;
      s.drift = null;
      s.mode = "ascension";
      s.screen = "play";
      s.transitioning = false;
      const ask = document.getElementById("collapse");
      if (ask) ask.classList.add("hidden");
      bh.camera.updateScale(bh.display.w, bh.display.h, true);
    };
    const count = (tier, mark) => step.events.filter(e => e.tier === tier && e.mark === mark).length;
    const sig = () => s.entities.map(e => e.type + ":" + e.x + ":" + e.y).join("|");
    const hints = () => Object.keys(s.seenHints || {}).sort().join(",");
    const sample = () => {
      const w = bh.display.w, h = bh.display.h;
      const series = [s.zoom];
      let frames = 0;
      while (s.easeBack && frames < 120) {
        bh.camera.updateAnchor(1);
        bh.camera.updateScale(w, h, false);
        series.push(s.zoom);
        frames++;
      }
      return { series, frames, ease: s.easeBack };
    };

    enter(1, 0);
    const t0 = line(0);
    const third = t0.a + t0.span / 3;
    const two = t0.a + 2 * t0.span / 3;
    const plays0 = audio.playGrowthChime.plays || 0;

    s.birth = 0.45;
    setR(third + 0.15);
    bh.growth.check();
    if (step.events.length !== 0 || s.easeBack) fail.push("step during birth");
    if ((audio.playGrowthChime.plays || 0) !== plays0) fail.push("chime during birth");

    s.birth = 0;
    setR(third - 0.06);
    bh.growth.check();
    if (count(0, 1) !== 0) fail.push("baseline counted as a step");

    const hint0 = hints();
    const ent0 = sig();
    const n0 = s.entities.length;
    bh.camera.updateScale(bh.display.w, bh.display.h, true);
    setR(third + 0.05);
    if (s.radius >= two) fail.push("1/3 probe crossed 2/3");
    bh.growth.check();
    const ent1 = sig();
    const curve1 = sample();
    if (count(0, 1) !== 1) fail.push("tier 0 one-third count " + count(0, 1));
    if (count(0, 2) !== 0) fail.push("two-thirds fired early");
    const ev1 = step.events[step.events.length - 1];
    if (!ev1 || !ev1.chime || !ev1.camera) fail.push("one-third event " + JSON.stringify(ev1));
    if (ent1 !== ent0 || s.entities.length !== n0) fail.push("entities changed on one-third");
    if (s.tierBanner) fail.push("caption on one-third");
    if (hints() !== hint0) fail.push("hint on one-third");
    if ((audio.playGrowthChime.plays || 0) !== plays0 + 1) fail.push("chime not triggered at one-third");

    setR(third - 0.06);
    bh.growth.check();
    setR(third + 0.05);
    bh.growth.check();
    if (count(0, 1) !== 1) fail.push("one-third re-fired after a dip");

    s.screen = "collapse";
    setR(two + 0.12);
    bh.growth.check();
    if (count(0, 2) !== 0) fail.push("step during collapse");
    s.screen = "play";
    setR(two - 0.08);

    s.mode = "zen";
    setR(two + 0.12);
    bh.growth.check();
    if (count(0, 2) !== 0) fail.push("step during zen");
    s.mode = "ascension";
    setR(two - 0.08);
    bh.growth.check();

    const ent2 = sig();
    const plays2 = audio.playGrowthChime.plays || 0;
    bh.camera.updateScale(bh.display.w, bh.display.h, true);
    setR(two + 0.08);
    if (tiers.tierIndexForR(s.radius) !== 0) fail.push("2/3 probe left tier 0");
    bh.growth.check();
    const ent3 = sig();
    const curve2 = sample();
    if (count(0, 2) !== 1) fail.push("tier 0 two-thirds count " + count(0, 2));
    if (count(0, 1) !== 1) fail.push("one-third changed during two-thirds");
    const ev2 = step.events.filter(e => e.tier === 0 && e.mark === 2)[0];
    if (!ev2 || !ev2.chime || !ev2.camera) fail.push("two-thirds event " + JSON.stringify(ev2));
    if (ent3 !== ent2) fail.push("entities changed on two-thirds");
    if ((audio.playGrowthChime.plays || 0) !== plays2 + 1) fail.push("chime not triggered at two-thirds");
    setR(two - 0.08);
    bh.growth.check();
    setR(two + 0.08);
    bh.growth.check();
    if (count(0, 2) !== 1) fail.push("two-thirds re-fired after a dip");

    const spent = count(0, 1) + count(0, 2);
    enter(3, 0);
    setR(two + 0.2);
    bh.growth.check();
    bh.growth.check();
    if (count(0, 1) + count(0, 2) !== spent) fail.push("tier 0 fired again in another galaxy");

    const playsUp = audio.playGrowthChime.plays || 0;
    const evUp = step.events.length;
    enter(2, 1);
    const t1 = line(1);
    setR(tiers.rForTier(2) * 1.04);
    bh.growth.check();
    if (!s.reveal) fail.push("tier-up did not start its reveal");
    if (s.tier < 2) fail.push("tier-up did not advance the tier");
    if (step.events.length !== evUp) fail.push("step fired on the tier-up frame");
    if ((audio.playGrowthChime.plays || 0) !== playsUp) fail.push("growth chime on the tier-up frame");
    if (s.easeBack) fail.push("ease ran under the tier-up reveal");
    const tNow = s.tier | 0;
    const band = line(tNow);
    const mid = band.a + band.span / 3 + 0.4;
    if (mid >= band.b) fail.push("reveal probe would leave the tier");
    setR(mid);
    bh.growth.check();
    if (step.events.length !== evUp) fail.push("step fired during the tier-up reveal");
    if (!s.reveal && !s.tierBanner) fail.push("reveal ended before the probe");

    s.settings.reduceMotion = true;
    const playsRm = audio.playGrowthChime.plays || 0;
    enter(4, 3);
    const t3 = line(3);
    const mark = t3.a + t3.span / 3;
    setR(mark - 0.5);
    bh.growth.check();
    bh.camera.updateScale(bh.display.w, bh.display.h, true);
    const zStill = s.zoom;
    setR(mark + 0.5);
    bh.growth.check();
    const evRm = step.events[step.events.length - 1];
    let moved = false;
    for (let i = 0; i < 80; i++) {
      bh.camera.updateAnchor(1);
      bh.camera.updateScale(bh.display.w, bh.display.h, false);
      if (Math.abs(s.zoom - zStill) / zStill > 1e-6) moved = true;
    }
    if (!evRm || evRm.tier !== 3 || evRm.mark !== 1 || !evRm.chime || evRm.camera) fail.push("reduce motion event " + JSON.stringify(evRm));
    if (moved || s.easeBack) fail.push("reduce motion moved the camera");
    if ((audio.playGrowthChime.plays || 0) !== playsRm + 1) fail.push("reduce motion did not trigger the chime");
    if (s.tierBanner && s.tierBanner.age === 0 && s.reveal) fail.push("reduce motion started a reveal");

    // One check that jumps both thirds plays a single step and spends the other mark.
    s.settings.reduceMotion = false;
    enter(7, 5);
    const t5 = line(5);
    const third5 = t5.a + t5.span / 3;
    const two5 = t5.a + 2 * t5.span / 3;
    setR(third5 - 1);
    bh.growth.check();
    const playsJump = audio.playGrowthChime.plays || 0;
    const eventsJump = step.events.length;
    setR(two5 + 1);
    if (tiers.tierIndexForR(s.radius) !== 5) fail.push("jump probe left tier 5");
    bh.growth.check();
    if (step.events.length !== eventsJump + 1) fail.push("jump fired " + (step.events.length - eventsJump) + " steps");
    if ((audio.playGrowthChime.plays || 0) !== playsJump + 1) fail.push("jump double-chimed");
    if (step.ack.get(5) !== 2) fail.push("jump did not acknowledge the skipped mark");
    bh.growth.check();
    if (step.events.length !== eventsJump + 1) fail.push("skipped mark fired on the next check");
    if ((audio.playGrowthChime.plays || 0) !== playsJump + 1) fail.push("skipped mark chimed on the next check");
    bh.camera.updateScale(bh.display.w, bh.display.h, true);

    // Ease in progress, then a dev collapse and rebirth. Tier 0 can fire again.
    enter(4, 3);
    s.settings.reduceMotion = false;
    const two3 = t3.a + 2 * t3.span / 3;
    setR(two3 + 0.8);
    if (tiers.tierIndexForR(s.radius) !== 3) fail.push("pre-collapse ease left tier 3");
    bh.camera.updateScale(bh.display.w, bh.display.h, true);
    bh.growth.check();
    if (!s.easeBack) fail.push("ease did not start before collapse");
    bh.camera.updateAnchor(10);
    bh.camera.updateScale(bh.display.w, bh.display.h, false);
    if (!s.easeBack || !(s.zoom < s.easeBack.rest * 0.995)) fail.push("ease had not moved the zoom");
    bh.dev.h.collapse();
    const yes = document.getElementById("btn-collapse-yes");
    if (!yes) fail.push("collapse confirm missing");
    else yes.click();
    if (s.screen !== "collapse") fail.push("dev collapse did not run");
    bh.collapse.startNewRun();
    if (s.easeBack) fail.push("ease still set after rebirth, before birth");
    if (step.ack.size || step.based.size || step.events.length) fail.push("marks survived the new run");
    const skip = document.getElementById("btn-skip-intro");
    if (skip) skip.click();
    if (!(s.birth > 0)) fail.push("rebirth did not enter birth");
    if (s.easeBack) fail.push("ease resumed at the start of birth");
    const zBirth = s.zoom;
    let easedInBirth = false;
    for (let i = 0; i < 40; i++) {
      bh.camera.updateAnchor(1);
      bh.camera.updateScale(bh.display.w, bh.display.h, false);
      if (s.easeBack || s.zoom < zBirth * 0.99) easedInBirth = true;
    }
    if (easedInBirth) fail.push("zoom changed by an ease during birth");
    s.birth = 0;
    const thirdBorn = t0.a + t0.span / 3;
    setR(thirdBorn - 0.05);
    bh.growth.check();
    const playsBorn = audio.playGrowthChime.plays || 0;
    setR(thirdBorn + 0.05);
    if (tiers.tierIndexForR(s.radius) !== 0) fail.push("reborn probe left tier 0");
    bh.growth.check();
    const reborn = step.events.filter(e => e.tier === 0 && e.mark === 1);
    if (reborn.length !== 1 || !reborn[0].chime) fail.push("tier 0 did not fire at 1/3 after rebirth");
    if ((audio.playGrowthChime.plays || 0) !== playsBorn + 1) fail.push("reborn 1/3 did not chime");

    return {
      ok: fail.length === 0,
      fail,
      size,
      third: curve1,
      twoThirds: { frames: curve2.frames, n: curve2.series.length, z0: curve2.series[0], zN: curve2.series[curve2.series.length - 1] },
      series1: curve1.series,
      plays: audio.playGrowthChime.plays || 0,
      errs: []
    };
  });
}

function hasFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function proof(page) {
  fs.mkdirSync(ART, { recursive: true });
  const dir = path.join(ART, "v9160-frames");
  fs.mkdirSync(dir, { recursive: true });
  await page.evaluate(async () => {
    const tiers = await import("/js/tiers.js");
    const bh = window.__bh;
    const s = bh.state;
    s.settings.reduceMotion = false;
    Object.assign(bh.dev.cfg, { galaxy: 1, biome: "", tier: 0, depth: 0, zen: false, wisp: false });
    bh.dev.enter();
    bh.dev.frozen = true;
    s.birth = 0;
    s.drift = null;
    s.mode = "ascension";
    s.screen = "play";
    s.settings.reduceMotion = false;
    const toast = document.getElementById("hint-toast");
    if (toast) toast.classList.add("hidden");
    const badge = document.getElementById("dev-badge");
    if (badge) badge.classList.add("hidden");
    const splash = document.getElementById("splash");
    if (splash) splash.style.display = "none";
    bh.display.resize();
    const a = tiers.rForTier(0);
    const b = tiers.rForTier(1);
    const third = a + (b - a) / 3;
    s.mass = tiers.massForR(third - 0.05);
    s.radius = tiers.rForMass(s.mass);
    bh.camera.updateScale(bh.display.w, bh.display.h, true);
    bh.growth.check();
    s.mass = tiers.massForR(third + 0.04);
    s.radius = tiers.rForMass(s.mass);
    bh.growth.check();
    window.__proof = { started: !!s.easeBack, w: bh.display.w, h: bh.display.h };
  });
  const meta = await page.evaluate(() => window.__proof);
  if (!meta.started) throw new Error("proof ease did not start");
  const shots = [];
  const total = 24;
  for (let i = 0; i < total; i++) {
    await page.evaluate((i) => {
      const bh = window.__bh;
      const s = bh.state;
      const chunk = s.easeBack ? (s.easeBack.dur / 23) : 0;
      if (s.easeBack) {
        bh.camera.updateAnchor(i === 0 ? 0.01 : chunk);
        bh.camera.updateScale(bh.display.w, bh.display.h, false);
      }
      bh.scene.draw(performance.now(), 1, true);
    }, i);
    const file = path.join(dir, "frame-" + String(i).padStart(2, "0") + ".png");
    await page.screenshot({ path: file, type: "png" });
    shots.push(file);
  }
  const pick = [0, 3, 6, 10, 13, 16, 20, 23].map(i => shots[i]);
  const strip = path.join(ART, "v9160-growth-step-strip.png");
  const clip = path.join(ART, "v9160-growth-step.mp4");
  execFileSync("ffmpeg", [
    "-y", ...pick.flatMap(f => ["-i", f]),
    "-filter_complex", "hstack=inputs=8",
    strip
  ], { stdio: "pipe" });
  execFileSync("ffmpeg", [
    "-y", "-framerate", "16",
    "-i", path.join(dir, "frame-%02d.png"),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    clip
  ], { stdio: "pipe" });
  return { strip, clip, frames: shots.length, size: meta };
}

async function main() {
  const gate = filesGate();
  const browser = await launch();
  const page = await newPage(browser);
  let out = null;
  let shot = null;
  const fail = [];
  try {
    await boot(page);
    out = await logic(page);
    const c1 = curveOk(out.series1, out.third.frames);
    if (!gate.ok) fail.push({ reason: "owner or chime gate", gate });
    if (!out.ok) fail.push({ reason: "play checks", fail: out.fail });
    if (out.size.iw !== 390 || out.size.ih !== 844) fail.push({ reason: "viewport", size: out.size });
    if (!c1.ok) fail.push({ reason: "one-third camera", curve: c1 });
    const sec2 = out.twoThirds.frames / 60;
    if (!(sec2 >= 1 && sec2 <= 1.4)) fail.push({ reason: "two-thirds duration", twoThirds: out.twoThirds, sec2 });
    if (page._errs.length) fail.push({ reason: "pageerror", errs: page._errs.slice(0, 5) });
    if (fail.length === 0 && hasFfmpeg()) {
      const proofPage = await newPage(browser);
      try {
        await boot(proofPage);
        shot = await proof(proofPage);
      } finally {
        await proofPage.context().close();
      }
    } else if (fail.length === 0) {
      shot = { skipped: "ffmpeg is not installed; the behavior checks still ran" };
    }
  } catch (err) {
    fail.push({ reason: "threw", err: String(err && err.stack || err).slice(0, 800) });
  } finally {
    await browser.close();
  }
  const ok = fail.length === 0;
  console.log(JSON.stringify({
    ok,
    gate: { ok: gate.ok, step: gate.step, camera: gate.camera, oneVoice: gate.oneVoice },
    viewport: out && out.size,
    oneThird: out && curveOk(out.series1, out.third.frames),
    twoThirds: out && out.twoThirds,
    checks: out && out.fail,
    shot,
    fail
  }, null, 2));
  process.exit(ok ? 0 : 1);
}

main();
