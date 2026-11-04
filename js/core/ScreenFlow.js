// ─── ScreenFlow ───
// The screens and the moves between them: title, intro and birth, the drift-in
// from the title, the idle world behind the title, a fresh start, and the
// first screen at boot. Play itself, pause, collapse and Zen hand back here.

import * as audio from "../audio.js";
import * as ui from "../ui.js";
import { save } from "../save.js";
import { updateEntities } from "../entities.js";
import { warmHole } from "../art.js";
import { defaultAsc } from "../ascension.js";
import { START_R, massForR, rForTier, tierName } from "../tiers.js";

const $ = id => document.getElementById(id);
export const TITLE_AFTER_MS = 10 * 60 * 1000;
export const TITLE_ZOOM = 3.4;          // camera close-up on the hole behind the title
const INTRO_LINES = ["Drift.", "Eat what's smaller.", "Grow."];
const INTRO_MARK_MS = 3400, INTRO_LINE_MS = 3000, BIRTH_FRAMES = 170;

function showScreenEl(el) {
  el.classList.remove("hidden", "fading");
}
function fadeOutScreenEl(el, ms = 1400) {
  if (el.classList.contains("hidden")) return;
  el.classList.add("fading");
  setTimeout(() => { if (el.classList.contains("fading")) el.classList.add("hidden"); }, ms);
}

export class ScreenFlow {
  constructor(game) {
    this.game = game;
    this.state = game.state;
    this.titleEl = $("title-screen");
    this.introEl = $("intro-screen");
    this.firstPlayStart = true;
    this.introTimers = [];
    this.introKind = "fresh";
  }

  /** Wire the title and intro buttons. */
  bind() {
    const state = this.state;
    $("btn-skip-intro").addEventListener("click", () => { audio.playClick(); this.endIntro(); });
    $("btn-title-continue").addEventListener("click", () => { audio.playClick(); this.startDrift("continue"); });
    $("btn-title-new").addEventListener("click", () => {
      audio.playClick();
      $("newgame-confirm").classList.remove("hidden");
    });
    $("btn-newgame-no").addEventListener("click", () => {
      audio.playClick();
      $("newgame-confirm").classList.add("hidden");
    });
    $("btn-newgame-yes").addEventListener("click", () => {
      audio.playClick();
      $("newgame-confirm").classList.add("hidden");
      this.startCompletelyOver();
    });
    $("btn-title-settings").addEventListener("click", () => {
      audio.playClick();
      ui.showStats(state, () => {}, { settingsOnly: true });
    });
  }

  showTitle() {
    const state = this.state, game = this.game;
    state.screen = "title";
    state.drift = null;
    state.camMul = TITLE_ZOOM;
    game.input.setEnabled(false);
    document.body.classList.add("on-title");
    $("newgame-confirm").classList.add("hidden");
    $("hint-toast").classList.add("hidden");
    const depthTxt = state.asc.run.cleared ? `Run depth ${state.asc.run.cleared} · ` : "";
    $("title-continue-sub").textContent = `${depthTxt}Galaxy ${state.galaxy} · ${state.biome ? state.biome.name : ""}`;
    $("btn-title-constellation").classList.toggle("glow", (state.asc.dm || 0) >= 6);
    if (state.v7Welcome) {
      state.v7Welcome = false;
      setTimeout(() => game.hud.show(`New: Ascension. Your journey is now a run, ${state.asc.run.cleared} galaxies deep. Collapse any time (pause menu) to earn Dark Matter for permanent perks.`, 7000), 1200);
    }
    if (state.v9Refund) {
      const r = state.v9Refund; state.v9Refund = null;
      if (r.dm > 0) setTimeout(() => game.hud.show(`New in v9: one loop. Stardust and its shop are gone; what you had came back as ${r.dm} Dark Matter for the constellation.`, 8000), 1400);
    }
    if (game.lifecycle.applyUpdateIfCalm()) return;
    showScreenEl(this.titleEl);
    warmHole(state.radius * game.zoomTarget() * TITLE_ZOOM * game.display.dpr);
    save(state);
  }

  // v8.6: a real beginning. The intro is a dark void (the galaxy is hidden):
  // the wordmark, three lines, then the void lifts and a newborn hole is born
  // in place, in the play view. Used on first launch and after "Start completely over".
  showIntro(o = {}) {
    const state = this.state, game = this.game;
    this.introKind = o.kind || "fresh";
    const lines = o.lines || INTRO_LINES;
    this.introTimers.forEach(clearTimeout);
    this.introTimers = [];
    state.screen = "intro";
    state.drift = null;
    state.birth = 0;
    state.camMul = TITLE_ZOOM;
    game.updateCameraScale(true);
    game.input.setEnabled(false);
    document.body.classList.add("on-title");
    this.introEl.classList.remove("birth");
    showScreenEl(this.introEl);
    const line = $("intro-line"), mark = $("intro-mark");
    line.classList.remove("on");
    line.textContent = "";
    this.introTimers.push(setTimeout(() => mark.classList.add("on"), 500));
    this.introTimers.push(setTimeout(() => mark.classList.remove("on"), 500 + INTRO_MARK_MS - 900));
    const first = 500 + INTRO_MARK_MS + 300;
    lines.forEach((txt, i) => {
      const at = first + i * INTRO_LINE_MS;
      this.introTimers.push(setTimeout(() => { line.textContent = txt; line.classList.add("on"); }, at));
      this.introTimers.push(setTimeout(() => line.classList.remove("on"), at + INTRO_LINE_MS - 900));
    });
    this.introTimers.push(setTimeout(() => this.endIntro(), first + lines.length * INTRO_LINE_MS));
  }

  endIntro() {
    const state = this.state, game = this.game;
    if (state.screen !== "intro") return;
    this.introTimers.forEach(clearTimeout);
    this.introTimers = [];
    $("intro-mark").classList.remove("on");
    state.seenHints.intro = true;   // only once the beginning has actually played
    // Swap to the play camera under the void, then lift it while the hole is born
    state.screen = "play";
    state.camMul = 1;
    game.updateCameraScale(true);
    document.body.classList.remove("on-title");
    this.titleEl.classList.add("hidden");
    state.birth = 0.001;
    game.loop.resync();
    this.introEl.classList.add("birth");
    fadeOutScreenEl(this.introEl, 2600);
    save(state);
  }

  updateBirth(dt) {
    const state = this.state, game = this.game;
    state.birth += dt / (state.settings.reduceMotion ? 60 : BIRTH_FRAMES);
    if (state.birth >= 1) {
      state.birth = 0;
      game.input.setEnabled(true);
      this.onPlayStart(this.introKind === "reborn" ? "newrun" : "fresh");
    }
  }

  /** Title -> play: the camera eases into the hole, a breath of dark, then play. */
  startDrift(kind) {
    const state = this.state;
    if (state.drift) return;
    fadeOutScreenEl(this.titleEl);
    const rm = state.settings.reduceMotion;
    state.drift = { t: 0, phase: 1, kind, veil: 0, from: state.camMul, inDur: rm ? 50 : 110, outDur: rm ? 50 : 80 };
  }

  updateDrift(dt) {
    const state = this.state, game = this.game;
    const d = state.drift;
    d.t += dt;
    if (d.phase === 1) {
      const p = Math.min(1, d.t / d.inDur);
      const e = p * p * (3 - 2 * p);
      if (!state.settings.reduceMotion) state.camMul = d.from + (TITLE_ZOOM * 2.1 - d.from) * e;
      d.veil = e * 0.94;
      if (p >= 1) {
        // Swap to the play camera under the veil
        d.phase = 2;
        d.t = 0;
        state.screen = "play";
        state.camMul = 1;
        game.updateCameraScale(true);
        document.body.classList.remove("on-title");
        this.titleEl.classList.add("hidden");
        this.introEl.classList.add("hidden");
        game.loop.resync();
      }
    } else {
      const p = Math.min(1, d.t / d.outDur);
      d.veil = 0.94 * (1 - p * p * (3 - 2 * p));
      if (p >= 1) {
        state.drift = null;
        game.input.setEnabled(true);
        game.perf.grace();
        this.onPlayStart(d.kind);
      }
    }
  }

  /** The world idles behind the title: things drift slowly, nothing happens. */
  updateBackdrop(dt) {
    const state = this.state, game = this.game;
    game.updateCameraScale();
    state.camX += (state.playerX - state.camX) * 0.05;
    state.camY += (state.playerY - state.camY) * 0.05;
    updateEntities(state.entities, state.bounds, dt * 0.4);
  }

  onPlayStart(kind) {
    const state = this.state, game = this.game;
    if (kind === "zen") {
      game.hud.show("Breathe with the pull: things drift out as you breathe in, and come to you as you breathe out.", 6000);
      return;
    }
    if (kind === "newrun") {
      const sn = state.asc.run.supernova;
      game.hud.show(sn ? "A supernova run! Every bite counts 50% more, all run long." : `Run ${state.asc.runsStarted}. Reborn stronger: your perks travel with you.`, 4500);
      return;
    }
    if (kind === "resume") game.hud.show(`Welcome back! Galaxy ${state.galaxy}: ${state.biome.name}`);
    else game.hud.show(`Galaxy ${state.galaxy}: ${state.biome.name}`);
    if (!this.firstPlayStart) return;
    this.firstPlayStart = false;
    if (kind === "fresh") {
      const touch = matchMedia("(pointer: coarse)").matches;
      setTimeout(() => game.hud.show(touch ? "Touch anywhere and drag to steer. Eat smaller things!" : "Move with the mouse or WASD. Eat smaller things!", 4000), 2600);
    }
    if (kind !== "fresh" && !state.seenHints.v3_zen) {
      state.seenHints.v3_zen = true;
      setTimeout(() => game.hud.show("Zen mode is on (no clock, no penalties). Tap Zen below to switch it off.", 5000), 7000);
    }
  }

  // v8.5: a true fresh game. Progress, Ascension and every first-time caption
  // (onboarding, codex "seen" flags, tier and merge captions) are wiped; settings,
  // lifetime stats (incl. highest galaxy), fastest times, the discovery logbook
  // and Zen notes stay.
  // Then the first-launch intro and drift-in play, into a newborn dust-only start.
  startCompletelyOver() {
    const state = this.state, game = this.game;
    if (state.mode === "zen") game.zen.restore();
    if (ui.isStatsOpen()) ui.closeStats();
    state.paused = false;
    state.menuOpen = false;
    $("pause-menu").classList.add("hidden");
    state.mode = "ascension";
    state.zen = null;
    state.drift = null;
    state.galaxy = 1;
    state.floorMass = massForR(START_R);
    state.bestTier = 0;
    state.asc = defaultAsc();   // v7: a full start-over also clears Ascension
    state.v7Welcome = false;
    state.galaxyCredited = false;
    state.transitioning = false;
    state.transitionPhase = "";
    state.seenHints = {};
    state.records.galaxyLog = {};   // the star map starts over with the journey
    this.firstPlayStart = true;
    game.galaxy.init(1);
    save(state);
    fadeOutScreenEl(this.titleEl);
    this.showIntro();
  }

  /** v9.3 dev sandbox: drop straight into a chosen galaxy, scale and setup. */
  devStart(c) {
    const state = this.state, game = this.game;
    this.introTimers.forEach(clearTimeout); this.introTimers = [];
    ["pause-menu", "collapse", "newgame-confirm", "hint-toast"].forEach(id => $(id).classList.add("hidden"));
    if (ui.isStatsOpen()) ui.closeStats();
    if (state.mode === "zen") game.zen.restore();
    state.paused = false; state.menuOpen = false;
    state.drift = null; state.birth = 0;
    state.transitioning = false; state.transitionPhase = ""; state.galaxyCredited = false;
    state.asc.run.cleared = c.depth;
    state.asc.perks.aw = !!c.wisp;
    state.galaxy = c.galaxy;
    state.floorMass = massForR(rForTier(c.tier) * 1.08);
    state.devBiome = c.biome || null;
    state.seenHints.intro = true;
    if (c.zen) {
      game.zen.start(3, c.galaxy);
      return;
    }
    game.galaxy.init(c.galaxy);
    state.screen = "play";
    state.camMul = 1;
    game.updateCameraScale(true);
    document.body.classList.remove("on-title");
    this.titleEl.classList.add("hidden");
    this.introEl.classList.add("hidden");
    game.input.setEnabled(true);
    game.loop.resync();
    game.perf.grace();
    game.hud.show(`Sandbox: Galaxy ${state.galaxy} · ${state.biome.name} · ${tierName(state.tier)}`, 3200);
  }

  /** Fresh install: short intro. Away > 10 min (or never seen v4): title screen.
   *  Otherwise drop straight back in where you were. */
  firstScreen(savedData, resumeRun) {
    const state = this.state;
  let backToTitle = false;   // v8.6: an update reload from the title comes back to the title
  try { backToTitle = sessionStorage.getItem("bh-title") === "1"; sessionStorage.removeItem("bh-title"); } catch {}
  const awayMs = savedData ? Date.now() - (savedData.lastActive || 0) : Infinity;
  if (!state.seenHints.intro) {
    this.showIntro();
  } else if (awayMs > TITLE_AFTER_MS || backToTitle) {
    this.showTitle();
  } else {
    this.onPlayStart(resumeRun ? "resume" : "continue");
  }
  }
}
