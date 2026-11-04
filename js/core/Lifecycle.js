// ─── Lifecycle ───
// The page around the game: restoring the save at boot, autosave, tab hidden /
// shown / closed, applying a downloaded update when it's calm, the keyboard,
// and unlocking audio on the first gesture. This (with Display) is the one
// place that talks to the browser window.

import * as audio from "../audio.js";
import { save, load } from "../save.js";
import { TITLE_AFTER_MS } from "./ScreenFlow.js";

// Audio may only start from an "activation" gesture: touchend/pointerup/click/keydown
// (touchstart and touch pointerdown don't count on mobile browsers).
const UNLOCK_EVENTS = ["pointerup", "touchend", "click", "keydown"];

export class Lifecycle {
  constructor(game) {
    this.game = game;
    this.state = game.state;
    this.resetting = false;     // a reload is under way: don't let the unload save overwrite it
    this.hiddenAt = 0;
    this.applyUpdateIfCalm = this.applyUpdateIfCalm.bind(this);
  }

  bind() {
    const state = this.state, game = this.game;
    window.addEventListener("keydown", e => game.controls.onKey(e));
    // Save often, and whenever the app is backgrounded (phones kill tabs)
    setInterval(() => { if (!this.resetting) save(state); }, 5000);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.hiddenAt = Date.now();
        if (!this.resetting) save(state);
        return;
      }
      game.loop.resync();
      // Back after a long break: greet with the title screen instead of mid-galaxy
      if (this.hiddenAt && Date.now() - this.hiddenAt > TITLE_AFTER_MS && state.screen === "play" && !state.drift &&
          !state.transitioning) {
        if (state.paused) game.controls.setPaused(false);
        game.screens.showTitle();
      }
    });
    window.addEventListener("pagehide", () => { if (!this.resetting) save(state); });
    window.addEventListener("bh-update", this.applyUpdateIfCalm);
    document.addEventListener("visibilitychange", this.applyUpdateIfCalm);
  }

  // v8.6: apply a new version as soon as it's calm: right away on the title or
  // while hidden, otherwise the next time you're back on the title or return to the app.
  // index.html raises window.__bhUpdateReady when a new service worker takes over.
  applyUpdateIfCalm() {
    const state = this.state;
    if (!window.__bhUpdateReady || this.resetting) return false;
    const calm = document.hidden || (state.screen === "title" && !state.drift);
    if (!calm) return false;
    save(state);
    this.resetting = true;
    try { if (state.screen === "title") sessionStorage.setItem("bh-title", "1"); } catch {}
    location.reload();
    return true;
  }

  /** Reload the page (dev sandbox exit). */
  reloadToTitle() {
    this.resetting = true;
    try { sessionStorage.setItem("bh-title", "1"); } catch {}
    location.reload();
  }

  /** Load the save into state. Returns the saved data and the run to resume (if any). */
  restore() {
    const state = this.state, game = this.game;
    const savedData = load();
    let resumeRun = null;
    if (savedData) {
      state.galaxy = savedData.galaxy;
      state.bestGalaxy = Math.max(savedData.bestGalaxy, state.galaxy);
      state.totalConsumed = savedData.totalConsumed;
      state.audioEnabled = savedData.audioEnabled;
      state.volume = savedData.volume;
      state.stats = savedData.stats;
      state.records = savedData.records;
      state.seenHints = savedData.seenHints;
      state.settings = { ...state.settings, ...(savedData.settings || {}) };
      delete state.settings.zen;   // v7: the old Zen/timed toggle is gone (Ascension is always calm)
      if (savedData.v9Refund) state.v9Refund = savedData.v9Refund;
      state.floorMass = savedData.floorMass;
      state.bestTier = savedData.bestTier || 0;
      state.asc = savedData.asc;
      state.zenNotes = savedData.zenNotes || [];
      if (savedData.v7Welcome) {
        // v7: your journey so far becomes the current Ascension run
        state.asc.run.cleared = Math.max(0, state.galaxy - 1);
        state.asc.run.peakTier = state.bestTier || 0;
        state.asc.bestDepth = state.galaxy - 1;
        state.v7Welcome = true;
      }
      if (savedData.run && savedData.run.galaxy === state.galaxy) resumeRun = savedData.run;

      game.controls.bar.setVolume(state.volume);
      game.controls.bar.setAudio(state.audioEnabled);
    }
    return { savedData, resumeRun };
  }

  unlockAudioOnGesture() {
    const state = this.state;
    const initAudio = () => {
      if (state.audioEnabled) {
        audio.init();
        audio.startDrone(state.biome);
      }
      for (const ev of UNLOCK_EVENTS) window.removeEventListener(ev, initAudio, true);
    };
    for (const ev of UNLOCK_EVENTS) window.addEventListener(ev, initAudio, true);
  }
}
