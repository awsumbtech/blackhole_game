// v9.7 checks and phone-size captures.
// Usage: node tools/v97-qa.cjs <beforePort> <afterPort> <outDir>
// Needs playwright-core resolvable from /tmp/pw or node_modules, and Chrome.

const fs = require("fs");
const path = require("path");
const { chromium } = require("/tmp/pw/node_modules/playwright-core");

const BEFORE = process.argv[2] || "8090";
const AFTER = process.argv[3] || "8091";
const OUT = process.argv[4] || path.join(__dirname, "..", "qa", "v9.7");
const CHROME = process.env.CHROME || "/usr/local/bin/google-chrome";
const LA = fs.readFileSync("/home/ubuntu/.cursor/projects/workspace/uploads/layout-audit_c8c5.js", "utf8");
const GA = fs.readFileSync("/home/ubuntu/.cursor/projects/workspace/uploads/geometry-audit_5e3a.js", "utf8");

const BIOMES = [
  ["reef", "Debris Reef", 2],
  ["current", "Comet Current", 3],
  ["nursery", "Planet Nursery", 4],
  ["armada", "Ruined Armada", 5],
  ["void", "Void Rift", 3],
  ["meadow", "Star Meadow", 6],
  ["forge", "Neutron Forge", 7]
];

const VPS = {
  phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  small: { width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  land: { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desk: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false }
};

function mkdir(p) { fs.mkdirSync(p, { recursive: true }); }

async function launch() {
  return chromium.launch({
    executablePath: CHROME,
    args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--disable-dev-shm-usage", "--no-sandbox"]
  });
}

async function newPage(browser, vp) {
  const { width, height, deviceScaleFactor, isMobile, hasTouch } = vp;
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor, isMobile, hasTouch
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e.message || e).slice(0, 240)));
  page.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0, 240)); });
  page._errs = errs;
  return page;
}

async function boot(page, port) {
  page._errs.length = 0;
  await page.goto(`http://127.0.0.1:${port}/?dev&debug`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => window.__bh && window.__bh.dev, { timeout: 20000 });
  await page.waitForTimeout(400);
}

async function hideChrome(page) {
  await page.evaluate(() => {
    const t = document.getElementById("hint-toast");
    if (t) t.classList.add("hidden");
  });
}

async function sandbox(page, cfg) {
  page._errs.length = 0;
  await page.evaluate(c => {
    const d = window.__bh.dev;
    Object.assign(d.cfg, { galaxy: 3, biome: "", tier: 2, depth: 1, zen: false, wisp: false }, c);
    d.enter();
  }, cfg);
  await page.waitForTimeout(cfg.zen ? 1600 : 900);
  await hideChrome(page);
}

async function nearLandmark(page) {
  await page.evaluate(() => {
    const w = window.__bh.worlds && window.__bh.worlds();
    const lm = w && w.landmarks && w.landmarks[0];
    if (!lm) return;
    const s = window.__bh.state;
    // Stand off the landmark so a huge sun or flagship does not swallow the hole.
    const off = Math.max(s.viewW * 0.28, 60);
    s.playerX = lm.x + off;
    s.playerY = lm.y + off * 0.08;
    s.camX = s.playerX;
    s.camY = s.playerY;
    s.playerVX = 0; s.playerVY = 0;
  });
  await page.waitForTimeout(500);
  await hideChrome(page);
}

async function shot(page, file) {
  await hideChrome(page);
  await page.screenshot({ path: file });
}

async function titleAndSettings(page, dir, tag) {
  // Fresh boot is the intro. Skip it, wait out the birth, then pause to the title.
  const skip = page.locator("#btn-skip-intro");
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.waitForFunction(() => {
    const s = window.__bh.state;
    return s.screen === "play" && !(s.birth > 0);
  }, { timeout: 20000 }).catch(() => {});
  // If we are already on the title (second call), don't go through pause.
  const onTitle = await page.locator("#title-screen:not(.hidden)").count();
  if (!onTitle) {
    await page.waitForSelector("#btn-pause", { state: "visible", timeout: 8000 });
    await page.click("#btn-pause");
    await page.waitForSelector("#pause-menu:not(.hidden)", { timeout: 5000 });
    await page.click("#btn-pause-title");
    await page.waitForSelector("#title-screen:not(.hidden)", { timeout: 8000 });
  }
  await page.waitForTimeout(1200);
  await shot(page, path.join(dir, `${tag}-title.png`));
  await page.click("#btn-title-settings");
  await page.waitForSelector("#stats:not(.hidden)", { timeout: 5000 });
  await page.waitForTimeout(400);
  await shot(page, path.join(dir, `${tag}-settings.png`));
  await page.click("#btn-stats-close");
  await page.waitForTimeout(250);
}

async function taps(page) {
  return page.evaluate(() => {
    const vis = e => {
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      const cs = getComputedStyle(e);
      return cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity !== 0;
    };
    return [...document.querySelectorAll("button, a[href], [role=button], input:not([type=hidden]), select")]
      .filter(vis)
      .map(e => {
        const r = e.getBoundingClientRect();
        return {
          t: (e.getAttribute("aria-label") || e.id || e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40),
          w: Math.round(r.width), h: Math.round(r.height)
        };
      })
      .filter(b => b.w < 44 || b.h < 44);
  });
}

async function playShots(page, dir, tag, full) {
  const names = [];
  for (const [key, biome, tier] of BIOMES) {
    if (!full && key !== "nursery") continue;
    await sandbox(page, { biome, tier, galaxy: tier, zen: false });
    await nearLandmark(page);
    const file = path.join(dir, `${tag}-play-${key}.png`);
    await shot(page, file);
    names.push(file);
    const probe = await page.evaluate(() => {
      const bh = window.__bh;
      const inflow = bh.inflow ? bh.inflow.info() : null;
      const backdrop = bh.backdrop ? { ready: !!bh.backdrop.ready, key: bh.backdrop.key } : null;
      const debris = bh.debris ? bh.debris.live : null;
      return { biome: bh.state.biome.name, mode: bh.state.mode, debris, inflow, backdrop, errs: null };
    });
    probe.console = page._errs.slice();
    page._probe = page._probe || {};
    page._probe[key] = probe;
  }
  if (full) {
    await sandbox(page, { biome: "Planet Nursery", tier: 4, galaxy: 4, zen: false });
    await page.evaluate(() => window.__bh.dev.h && window.__bh.nearNextTier && window.__bh.nearNextTier(1.05));
    // Cross the tier line so the next landmark set is The Greater Cradle.
    await page.evaluate(() => {
      const bh = window.__bh;
      if (bh.nearNextTier) bh.nearNextTier(1.02);
    });
    await page.waitForTimeout(2800);
    await nearLandmark(page);
    await hideChrome(page);
    await shot(page, path.join(dir, `${tag}-play-greater-cradle.png`));
    await sandbox(page, { biome: "Debris Reef", tier: 2, galaxy: 2, zen: false });
    await page.evaluate(() => { try { window.__bh.fireEvent("meteorShower"); } catch (e) {} });
    await page.waitForTimeout(1600);
    await hideChrome(page);
    await shot(page, path.join(dir, `${tag}-play-busy.png`));
    await sandbox(page, { biome: "Planet Nursery", tier: 4, galaxy: 3, zen: true });
    await page.waitForTimeout(600);
    await shot(page, path.join(dir, `${tag}-zen.png`));
    page._probe.zen = await page.evaluate(() => {
      const bh = window.__bh;
      return {
        mode: bh.state.mode,
        debris: bh.debris ? bh.debris.live : null,
        inflow: bh.inflow ? bh.inflow.info() : null
      };
    });
    page._probe.zen.console = page._errs.slice();
  }
  return names;
}

async function checks(page) {
  return page.evaluate(() => {
    const bh = window.__bh;
    const out = { ok: true, notes: [] };
    const fail = m => { out.ok = false; out.notes.push(m); };
    if (!bh.debris) fail("no debris field");
    // One real bite through Feeding.update. The idle check lives in tools/v97-review.cjs.
    bh.debris.clear();
    const s = bh.state;
    const e = s.entities.find(ent => !ent.powerup && !ent.consumed && s.radius > ent.radius * s.eatRatio);
    if (!e) fail("no edible for a real bite");
    else {
      const mass0 = s.mass;
      const n0 = s.entities.length;
      e.x = s.playerX; e.y = s.playerY; e.vx = 0; e.vy = 0;
      bh.feeding.update(1);
      const gone = !s.entities.includes(e);
      const liveAfterBite = bh.debris.live;
      const maxLife = bh.debris.pieces.reduce((m, p) => p.on ? Math.max(m, p.life) : m, 0);
      if (!(s.mass > mass0)) fail("bite did not gain mass");
      if (!gone) fail("bitten entity still in the list");
      if (liveAfterBite < 1) fail("debris did not start");
      for (let f = 0; f < maxLife; f++) bh.debris.update(1, false);
      if (bh.debris.live !== 0) fail("debris still live after its life: " + bh.debris.live);
      out.bite = { massGained: s.mass - mass0, gone, liveAfterBite, liveAfter: bh.debris.live, removed: n0 - s.entities.length };
    }
    const info = bh.inflow.info();
    if (info.inflow !== 0) fail("circling grain cloud still on: " + info.inflow);
    out.finished = bh.debris.finished;
    out.inflow = info;
    return out;
  });
}

async function perfSample(page) {
  await sandbox(page, { biome: "Planet Nursery", tier: 4, galaxy: 4, zen: false });
  await page.evaluate(() => window.__bh.resetPerf());
  await page.waitForTimeout(8000);
  return page.evaluate(() => window.__bh.perf());
}

async function audits(page) {
  const la = await page.evaluate(LA);
  const ga = await page.evaluate(GA);
  const small = await taps(page);
  return { la, ga, small };
}

(async () => {
  mkdir(OUT);
  const browser = await launch();
  const report = { beforePerf: null, afterPerf: null, checks: null, probes: {}, audits: {}, taps: {}, console: {} };

  // Phone captures: before (main) and after (branch), every galaxy.
  for (const [label, port] of [["before", BEFORE], ["after", AFTER]]) {
    const page = await newPage(browser, VPS.phone);
    await boot(page, port);
    const dir = path.join(OUT, label);
    mkdir(dir);
    await titleAndSettings(page, dir, "phone");
    await playShots(page, dir, "phone", true);
    report.probes[label] = page._probe || {};
    report.console[label] = page._errs.slice();
    if (label === "after") {
      report.checks = await checks(page);
      // Zen ring already probed. Re-enter play and zen explicitly for the mode check.
      await sandbox(page, { biome: "Void Rift", tier: 2, zen: false });
      const playHole = await page.evaluate(() => ({ mode: window.__bh.state.mode, debris: window.__bh.debris.live, inflow: window.__bh.inflow.info() }));
      await sandbox(page, { biome: "Star Meadow", tier: 2, zen: true });
      const zenHole = await page.evaluate(() => ({ mode: window.__bh.state.mode, debris: window.__bh.debris.live, inflow: window.__bh.inflow.info() }));
      report.checks.playHole = playHole;
      report.checks.zenHole = zenHole;
      if (zenHole.mode !== "zen") report.checks.ok = false, report.checks.notes.push("not in zen");
      if (playHole.inflow.inflow !== 0 || zenHole.inflow.inflow !== 0) report.checks.ok = false, report.checks.notes.push("circling cloud in a mode");
    }
    report[label + "Perf"] = await perfSample(page);
    await page.context().close();
  }

  // Other viewports: title, settings, nursery, zen. Audits on title and play.
  for (const [label, port] of [["before", BEFORE], ["after", AFTER]]) {
    for (const vpName of ["small", "land", "desk"]) {
      const page = await newPage(browser, VPS[vpName]);
      await boot(page, port);
      const dir = path.join(OUT, label);
      await titleAndSettings(page, dir, vpName);
      await playShots(page, dir, vpName, false);
      await sandbox(page, { biome: "Planet Nursery", tier: 4, zen: true });
      await shot(page, path.join(dir, `${vpName}-zen.png`));
      report.audits[`${label}-${vpName}-play`] = await audits(page);
      report.taps[`${label}-${vpName}-zen`] = await taps(page);
      await page.context().close();
    }
  }

  // Phone audits on title-equivalent play and settings for the after build.
  {
    const page = await newPage(browser, VPS.phone);
    await boot(page, AFTER);
    await sandbox(page, { biome: "Planet Nursery", tier: 4, zen: false });
    await nearLandmark(page);
    report.audits["after-phone-play"] = await audits(page);
    await titleAndSettings(page, path.join(OUT, "after"), "phone-audit");
    report.audits["after-phone-settings"] = await audits(page);
    await page.context().close();
  }

  const b = report.beforePerf, a = report.afterPerf;
  report.perf = {
    before: b && { avg: b.avg, p95: b.p95, quality: b.quality, entities: b.entities },
    after: a && { avg: a.avg, p95: a.p95, quality: a.quality, entities: a.entities },
    avgDeltaPct: b && a && b.avg > 0 ? +(((a.avg - b.avg) / b.avg) * 100).toFixed(1) : null
  };
  if (report.perf.avgDeltaPct != null && report.perf.avgDeltaPct > 10) {
    report.checks = report.checks || { ok: false, notes: [] };
    report.checks.ok = false;
    report.checks.notes.push("frame time regressed " + report.perf.avgDeltaPct + "%");
  }

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks: report.checks, perf: report.perf, probeKeys: Object.keys(report.probes.after || {}) }, null, 2));
  await browser.close();
  if (!report.checks || report.checks.ok === false) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
