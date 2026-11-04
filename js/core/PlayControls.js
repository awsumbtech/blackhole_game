// ─── PlayControls ───
// Pausing and the in-play controls: the pause menu, the controls bar
// (js/core/HudControls.js; this supplies its actions), the stats view and
// the P / Escape keys.

import * as audio from "../audio.js";
import * as ui from "../ui.js";
import { save } from "../save.js";
import { COLLAPSE_MIN_CLEARED } from "../ascension.js";
import { HudControls } from "./HudControls.js";

const $ = id => document.getElementById(id);

export class PlayControls {
  constructor(game) {
    this.game = game;
    this.state = game.state;
    const state = this.state;
    this.bar = new HudControls($, {
      pause: () => this.setPaused(!state.paused),
      restart: () => { if (state.paused) this.setPaused(false); this.restartGalaxy(); },
      canRestart: () => {
        if (state.screen !== "play" || state.mode === "zen") return false;
        if (state.transitioning) { game.hud.show("Hang on, drifting on…"); return false; }
        return true;
      },
      galaxy: () => state.galaxy,
      toggleAudio: () => {
        state.audioEnabled = !state.audioEnabled;
        audio.setEnabled(state.audioEnabled);
        if (state.audioEnabled) { audio.init(); audio.startDrone(state.biome); }
        save(state);
        return state.audioEnabled;
      },
      setVolume: v => { state.volume = v; audio.setVolume(v); save(state); },
      stats: () => this.toggleStatsView(),
      hold: open => {   // the confirm holds the world still, like a menu
        state.menuOpen = open;
        game.input.setEnabled(!open && !state.paused);
        if (!open) game.loop.resync();
      },
      click: () => audio.playClick(),
    }).bind();
  }

  /** Pause-menu buttons and the collapse pill. */
  bind() {
    const state = this.state, game = this.game;
    $("btn-resume").addEventListener("click", () => { audio.playClick(); this.setPaused(false); });
    $("btn-pause-settings").addEventListener("click", () => {
      audio.playClick();
      ui.showStats(state, () => {}, { settingsOnly: true });
    });
    $("btn-pause-title").addEventListener("click", () => {
      audio.playClick();
      this.setPaused(false);
      if (state.mode === "zen") { game.zen.restore(); }
      game.screens.showTitle();
    });
    $("btn-pause-collapse").addEventListener("click", () => { audio.playClick(); game.collapse.open(); });
    $("btn-pause-starmap").addEventListener("click", () => state.openStarMap());
    $("collapse-pill").addEventListener("click", () => {
      if (state.screen !== "play" || state.transitioning) return;
      audio.playClick();
      this.setPaused(true);
      game.collapse.open();
    });
    $("btn-pause-endzen").addEventListener("click", () => { audio.playClick(); this.setPaused(false); game.zen.beginExit(); });
  }

  setPaused(p) {
    const state = this.state, game = this.game;
    if (state.screen !== "play" || state.drift || state.birth > 0) return;
    state.paused = p;
    game.input.setEnabled(!p);
    this.bar.setPaused(p);
    $("pause-menu").classList.toggle("hidden", !p);
    $("btn-pause-collapse").classList.toggle("hidden", !(state.mode !== "zen" && state.asc.run.cleared >= COLLAPSE_MIN_CLEARED));
    $("btn-pause-endzen").classList.toggle("hidden", state.mode !== "zen");
    if (p) {
      save(state);
    } else {
      if (ui.isStatsOpen()) ui.closeStats();
      game.loop.resync();
    }
  }

  restartGalaxy() {
    const state = this.state, game = this.game;
    game.galaxy.init(state.galaxy);
    save(state);
    game.hud.show("Galaxy restarted");
  }

  toggleStatsView() {
    const state = this.state, game = this.game;
    if (ui.isStatsOpen()) { ui.closeStats(); return; }
    state.menuOpen = true;
    game.input.setEnabled(false);
    ui.showStats(state, () => {
      state.menuOpen = false;
      game.input.setEnabled(!state.paused);
      game.loop.resync();
    });
  }

  // P / Escape pause (Escape also closes the stats view)
  onKey(e) {
    const state = this.state;
    if (e.key === "Escape" && this.bar.isConfirmOpen()) {
      this.bar.closeConfirm();
      e.preventDefault();
      return;
    }
    if (this.bar.isConfirmOpen()) return;
    if (e.key === "Escape" && ui.isStatsOpen()) {
      ui.closeStats();
      e.preventDefault();
      return;
    }
    if ((e.key === "Escape" || e.key === "p" || e.key === "P") && state.screen === "play") {
      this.setPaused(!state.paused);
      e.preventDefault();
    }
  }
}
