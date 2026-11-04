// ─── ZenSession ───
// Zen session: a separate, calm space. Your journey is saved first and comes
// back exactly as it was. Nothing in a session is saved or rewarded.

import * as audio from "../audio.js";
import * as zen from "../zen.js";
import { save, load } from "../save.js";
import { BREATH_MS } from "./breath.js";
import { TITLE_ZOOM } from "./ScreenFlow.js";

const $ = id => document.getElementById(id);

export class ZenSession {
  constructor(game) {
    this.game = game;
    this.state = game.state;
    this.snap = null;
  }

  /** Wire the title's Zen button. */
  bind() {
    $("btn-title-zen").addEventListener("click", () => {
      audio.playClick();
      zen.openPicker(min => { audio.playClick(); this.start(min); }, () => audio.playClick());
    });
  }

  start(min, galaxy = 0) {
    const state = this.state, game = this.game;
    save(state);
    this.snap = { galaxy: state.galaxy, run: (load() || {}).run || null };
    state.mode = "zen";
    document.body.classList.add("mode-zen");
    const zg = galaxy || 1 + Math.floor(Math.random() * 7);
    state.galaxy = zg;
    state.zen = { dur: min * 3600, t: 0, wound: false, ending: false, min };
    game.galaxy.init(zg);
    state.densityK = zen.zenDensity(0);
    $("zen-arc").classList.remove("hidden");
    zen.setArc(0);
    state.camMul = TITLE_ZOOM;
    game.updateCameraScale(true);
    game.screens.startDrift("zen");
  }

  update(dt, now) {
    const state = this.state;
    const z = state.zen;
    if (!z || z.ending) return;
    z.t += dt;
    const p = Math.min(1, z.t / z.dur);
    state.densityK = zen.zenDensity(p);
    state.breathPull = zen.zenBreathPull(now, BREATH_MS);
    zen.setArc(p);
    // v7.1 optional "breathe in / out" words (off by default)
    const cue = $("zen-cue");
    if (cue) {
      const on = !!state.settings.zenBreathCue && !z.wound;
      cue.classList.toggle("hidden", !on);
      if (on) {
        const ph = (now % BREATH_MS) / BREATH_MS * 10;
        cue.textContent = ph < 4 ? "breathe in" : "breathe out";
        cue.style.opacity = (ph < 4 ? Math.sin(Math.PI * ph / 4) : Math.sin(Math.PI * (ph - 4) / 6)) * 0.55;
      }
    }
    if (!z.wound && p >= zen.ARC.WIND) {
      z.wound = true;
      audio.setMusicLayers(0, state.biome);
      audio.playZenResolve();
    }
    if (p >= 1) this.beginExit();
  }

  beginExit() {
    const state = this.state, game = this.game;
    const z = state.zen;
    if (!z || z.ending) return;
    z.ending = true;
    game.input.setEnabled(false);
    state.screen = "zenexit";
    $("zen-arc").classList.add("hidden");
    $("zen-cue")?.classList.add("hidden");
    setTimeout(() => {
      audio.stopDrone();
      zen.runExit({
        reduceMotion: state.settings.reduceMotion,
        onBreath: () => audio.playBreathTone(),
        onDone: text => {
          this.restore();
          if (text) { state.zenNotes = [...(state.zenNotes || []), { t: Date.now(), text }].slice(-20); save(state); }
          game.screens.showTitle();
        }
      });
    }, state.settings.reduceMotion ? 300 : 1200);
  }

  restore() {
    const state = this.state, game = this.game;
    if (state.mode !== "zen") return;
    state.mode = "ascension";
    state.zen = null;
    state.breathPull = 1;
    document.body.classList.remove("mode-zen");
    $("zen-arc").classList.add("hidden");
    state.galaxy = this.snap ? this.snap.galaxy : state.galaxy;
    const resume = this.snap && this.snap.run && this.snap.run.galaxy === state.galaxy ? this.snap.run : null;
    this.snap = null;
    game.galaxy.init(state.galaxy, resume);
    state.camMul = TITLE_ZOOM;
    game.updateCameraScale(true);
  }
}
