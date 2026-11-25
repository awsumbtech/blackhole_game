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

export class ScreenFlow {
  static TITLE_AFTER_MS = 10 * 60 * 1000;
  static TITLE_ZOOM = 3.4;          // camera close-up on the hole behind the title
  static INTRO_LINES = ["Drift.", "Eat what's smaller.", "Grow."];
  static INTRO_MARK_MS = 3400;
  static INTRO_LINE_MS = 3000;
  static BIRTH_FRAMES = 170;         // birth length; do not retune for input
  static LEAD_MS = 500;              // quiet beat before the first intro words
  static MARK_GAP_MS = 300;          // beat between the wordmark and the lines

  static el(id) { return document.getElementById(id); }

  static showEl(el) {
    el.classList.remove("hidden", "fading");
  }

  static fadeEl(el, ms = 1400) {
    if (el.classList.contains("hidden")) return;
    el.classList.add("fading");
    setTimeout(() => { if (el.classList.contains("fading")) el.classList.add("hidden"); }, ms);
  }

  constructor(game) {
    this.game = game;
    this.state = game.state;
    this.titleEl = ScreenFlow.el("title-screen");
    this.introEl = ScreenFlow.el("intro-screen");
    this.firstPlayStart = true;
    this.introTimers = [];
    this.introKind = "fresh";
    this.steered = false;
    this.steerHint = "";
    this.steerTimer = 0;
    this.steerStop = 0;
  }

  /** Wire the title and intro buttons. */
  bind() {
    const state = this.state;
    ScreenFlow.el("btn-skip-intro").addEventListener("click", () => { audio.playClick(); this.endIntro(); });
    ScreenFlow.el("btn-title-continue").addEventListener("click", () => { audio.playClick(); this.startDrift("continue"); });
    ScreenFlow.el("btn-title-new").addEventListener("click", () => {
      audio.playClick();
      ScreenFlow.el("newgame-confirm").classList.remove("hidden");
    });
    ScreenFlow.el("btn-newgame-no").addEventListener("click", () => {
      audio.playClick();
      ScreenFlow.el("newgame-confirm").classList.add("hidden");
    });
    ScreenFlow.el("btn-newgame-yes").addEventListener("click", () => {
      audio.playClick();
      ScreenFlow.el("newgame-confirm").classList.add("hidden");
      this.startCompletelyOver();
    });
    ScreenFlow.el("btn-title-settings").addEventListener("click", () => {
      audio.playClick();
      ui.showStats(state, () => {}, { settingsOnly: true });
    });
  }

  showTitle() {
    const state = this.state, game = this.game;
    state.screen = "title";
    state.drift = null;
    state.camMul = ScreenFlow.TITLE_ZOOM;
    game.input.setEnabled(false);
    document.body.classList.add("on-title");
    document.body.classList.remove("hint-front");
    ScreenFlow.el("newgame-confirm").classList.add("hidden");
    game.hud.clear();
    const depthTxt = state.asc.run.cleared ? `Run depth ${state.asc.run.cleared} · ` : "";
    ScreenFlow.el("title-continue-sub").textContent = `${depthTxt}Galaxy ${state.galaxy} · ${state.biome ? state.biome.name : ""}`;
    ScreenFlow.el("btn-title-constellation").classList.toggle("glow", (state.asc.dm || 0) >= 6);
    if (state.v7Welcome) {
      state.v7Welcome = false;
      setTimeout(() => game.hud.show(`New: Ascension. Your journey is now a run, ${state.asc.run.cleared} galaxies deep. Collapse any time (pause menu) to earn Dark Matter for permanent perks.`, 7000), 1200);
    }
    if (state.v9Refund) {
      const r = state.v9Refund; state.v9Refund = null;
      if (r.dm > 0) setTimeout(() => game.hud.show(`New in v9: one loop. Stardust and its shop are gone; what you had came back as ${r.dm} Dark Matter for the constellation.`, 8000), 1400);
    }
    if (game.lifecycle.applyUpdateIfCalm()) return;
    ScreenFlow.showEl(this.titleEl);
    warmHole(state.radius * game.zoomTarget() * ScreenFlow.TITLE_ZOOM * game.display.dpr);
    save(state);
  }

  // v8.6: a real beginning. The intro is a dark void (the galaxy is hidden):
  // the wordmark, three lines, then the void lifts and a newborn hole is born
  // in place, in the play view. Used on first launch and after "Start completely over".
  // A rebirth passes wordmark: false. The lines stay; only the title mark is skipped.
  showIntro(o = {}) {
    const state = this.state, game = this.game;
    this.introKind = o.kind || "fresh";
    const lines = o.lines || ScreenFlow.INTRO_LINES;
    const wordmark = o.wordmark !== false;
    this.introTimers.forEach(clearTimeout);
    this.introTimers = [];
    this.steered = false;
    this.steerHint = "";
    this.stopSteerWatch();
    document.body.classList.remove("hint-front");
    state.screen = "intro";
    state.drift = null;
    state.birth = 0;
    state.camMul = ScreenFlow.TITLE_ZOOM;
    game.updateCameraScale(true);
    game.input.setEnabled(false);
    document.body.classList.add("on-title");
    this.introEl.classList.remove("birth");
    ScreenFlow.showEl(this.introEl);
    const line = ScreenFlow.el("intro-line"), mark = ScreenFlow.el("intro-mark");
    line.classList.remove("on");
    line.textContent = "";
    mark.classList.remove("on");
    const lead = ScreenFlow.LEAD_MS;
    let first = lead;
    if (wordmark) {
      this.introTimers.push(setTimeout(() => mark.classList.add("on"), lead));
      this.introTimers.push(setTimeout(() => mark.classList.remove("on"), lead + ScreenFlow.INTRO_MARK_MS - 900));
      first = lead + ScreenFlow.INTRO_MARK_MS + ScreenFlow.MARK_GAP_MS;
    }
    lines.forEach((txt, i) => {
      const at = first + i * ScreenFlow.INTRO_LINE_MS;
      this.introTimers.push(setTimeout(() => { line.textContent = txt; line.classList.add("on"); }, at));
      this.introTimers.push(setTimeout(() => line.classList.remove("on"), at + ScreenFlow.INTRO_LINE_MS - 900));
    });
    this.introTimers.push(setTimeout(() => this.endIntro(), first + lines.length * ScreenFlow.INTRO_LINE_MS));
  }

  endIntro() {
    const state = this.state, game = this.game;
    if (state.screen !== "intro") return;
    this.introTimers.forEach(clearTimeout);
    this.introTimers = [];
    ScreenFlow.el("intro-mark").classList.remove("on");
    state.seenHints.intro = true;   // only once the beginning has actually played
    // Swap to the play camera under the void, then lift it while the hole is born
    state.screen = "play";
    state.camMul = 1;
    game.updateCameraScale(true);
    document.body.classList.remove("on-title");
    this.titleEl.classList.add("hidden");
    state.birth = 0.001;
    // Steering answers from the first moment of birth. Food is already being
    // eaten; the lock taken in showIntro used to hold until birth ended.
    game.input.setEnabled(true);
    game.loop.resync();
    this.introEl.classList.add("birth");
    ScreenFlow.fadeEl(this.introEl, 2600);
    this.showSteerHint();
    save(state);
  }

  updateBirth(dt) {
    const state = this.state;
    state.birth += dt / (state.settings.reduceMotion ? 60 : ScreenFlow.BIRTH_FRAMES);
    if (state.birth >= 1) {
      state.birth = 0;
      document.body.classList.remove("hint-front");
      this.onPlayStart(this.introKind === "reborn" ? "newrun" : "fresh");
    }
  }

  /** Title -> play: the camera eases into the hole, a breath of dark, then play. */
  startDrift(kind) {
    const state = this.state;
    if (state.drift) return;
    ScreenFlow.fadeEl(this.titleEl);
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
      if (!state.settings.reduceMotion) state.camMul = d.from + (ScreenFlow.TITLE_ZOOM * 2.1 - d.from) * e;
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
    // Queued behind whatever is already up, so a steer hint keeps the toast for
    // at least 2.5s unless the player has already steered it away.
    if (kind === "resume") game.hud.show(`Welcome back! Galaxy ${state.galaxy}: ${state.biome.name}`);
    else game.hud.show(`Galaxy ${state.galaxy}: ${state.biome.name}`);
  }

  /** The steer line, once, when a fresh birth begins. Hidden again after a real drag. */
  showSteerHint() {
    if (this.introKind !== "fresh" || !this.firstPlayStart || this.steered) return;
    this.firstPlayStart = false;
    const touch = matchMedia("(pointer: coarse)").matches;
    this.steerHint = touch
      ? "Touch anywhere and drag to steer. Eat smaller things!"
      : "Move with the mouse or WASD. Eat smaller things!";
    document.body.classList.add("hint-front");
    this.game.hud.show(this.steerHint, 4000);
    this.watchSteer();
  }

  watchSteer() {
    this.stopSteerWatch();
    this.steerTimer = setInterval(() => this.noteInput(), 50);
    this.steerStop = setTimeout(() => this.stopSteerWatch(), 4500);
  }

  stopSteerWatch() {
    if (this.steerTimer) clearInterval(this.steerTimer);
    if (this.steerStop) clearTimeout(this.steerStop);
    this.steerTimer = 0;
    this.steerStop = 0;
  }

  noteInput() {
    if (this.steered) { this.stopSteerWatch(); return; }
    const input = this.game.input;
    const stick = input.getStick();
    if (stick && Math.hypot(stick.kx - stick.bx, stick.ky - stick.by) > 10) {
      this.noteSteer();
      return;
    }
    const keys = input.keys;
    if (keys.up || keys.down || keys.left || keys.right) {
      this.noteSteer();
      return;
    }
    // Follow mode draws no joystick, so getStick() is null. A real touch
    // still steers through getMovement, and that first steer dismisses the hint.
    const follow = input.getTouchMode() === "follow";
    if (follow || !matchMedia("(pointer: coarse)").matches) {
      if (input.getMovement().magnitude > 0.12) this.noteSteer();
    }
  }

  noteSteer() {
    if (this.steered) return;
    this.steered = true;
    this.stopSteerWatch();
    document.body.classList.remove("hint-front");
    if (!this.steerHint) return;
    this.game.hud.dismiss(this.steerHint);
    this.steerHint = "";
  }

  // v8.5: a true fresh game. Progress, Ascension and every first-time caption
  // (onboarding, codex "seen" flags, tier and merge captions) are wiped; settings,
  // lifetime stats (incl. highest galaxy), fastest times, the discovery logbook
  // and Zen notes stay.
  // Then the first-launch intro and drift-in play, into a newborn dust-only start.
  startCompletelyOver() {
    const state = this.state, game = this.game;
    game.growthStep.reset();
    if (state.mode === "zen") game.zen.restore();
    if (ui.isStatsOpen()) ui.closeStats();
    state.paused = false;
    state.menuOpen = false;
    ScreenFlow.el("pause-menu").classList.add("hidden");
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
    this.steered = false;
    game.galaxy.init(1);
    save(state);
    ScreenFlow.fadeEl(this.titleEl);
    this.showIntro();
  }

  /** v9.3 dev sandbox: drop straight into a chosen galaxy, scale and setup. */
  devStart(c) {
    const state = this.state, game = this.game;
    this.introTimers.forEach(clearTimeout); this.introTimers = [];
    this.stopSteerWatch();
    document.body.classList.remove("hint-front");
    ["pause-menu", "collapse", "newgame-confirm", "hint-toast"].forEach(id => ScreenFlow.el(id).classList.add("hidden"));
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
    game.hud.clear();
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
    } else if (awayMs > ScreenFlow.TITLE_AFTER_MS || backToTitle) {
      this.showTitle();
    } else {
      this.onPlayStart(resumeRun ? "resume" : "continue");
    }
  }
}
