// ─── Hud ───
// The DOM heads-up display: galaxy, scale, biome, progress, goal stars, and the
// hint toast (one-time hints remembered in state.seenHints).

import { tierName } from "../tiers.js";
import { starsFor } from "../ascension.js";
import { EVENT_INFO } from "../living-world.js";
import { eventPairText } from "../worlds.js";

const $ = id => document.getElementById(id);

export class Hud {
  constructor(game) {
    this.game = game;
    this.state = game.state;
    this.galaxy = $("hud-galaxy");
    this.goal = $("hud-goal");
    this.mass = $("hud-mass");
    this.biome = $("hud-biome");
    this.progressBar = $("hud-progress-bar");
    this.toast = $("hint-toast");
    this.toastT = 0;
    this.wireEventHints();
  }

  /** A one-time hint (key) or a plain one (no key). */
  hint(key, msg, ms) {
    const state = this.state;
    if (key) {
      if (state.seenHints[key]) return;
      state.seenHints[key] = true;
    }
    this.show(msg, ms);
  }

  show(msg, ms = 2800) {
    const el = this.toast;
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => el.classList.add("hidden"), ms);
  }

  sync(force = false) {
    const state = this.state;
    const progress = this.game.galaxy.progress();
    this.galaxy.textContent = state.galaxy;
    const tn = tierName(state.tier);
    if (this.mass.textContent !== tn) this.mass.textContent = tn;
    this.biome.textContent = state.biome ? state.biome.name : "";
    this.progressBar.style.width = (progress * 100).toFixed(1) + "%";
    const hudGoal = this.goal;
    if (state.goal) {
      const st = starsFor(state.goal, state.goalCount);
      const nextNeed = state.goal.stars[Math.min(2, st)];
      const txt = `${state.goal.name} <span class="st">${"★".repeat(st)}${"☆".repeat(3 - st)}</span> ${Math.floor(state.goalCount)}/${nextNeed}`;
      if (hudGoal._t !== txt) { hudGoal._t = txt; hudGoal.innerHTML = txt; }
    } else if (hudGoal._t) { hudGoal._t = ""; hudGoal.innerHTML = ""; }
  }

  // Every event starts with a 2.5s warning: explain it calmly the first time,
  // afterwards just name it.
  wireEventHints() {
    const state = this.state;
    state.onEventWarn = id => {
      const info = EVENT_INFO[id];
      if (!info) return;
      // v4.1: a galaxy's signature event also feeds its mechanic; say so softly
      const pair = eventPairText(id);
      if (pair) {
        const key = "pair_" + state.biome.name + "_" + id;
        const first = !state.seenHints[key];
        state.seenHints[key] = true;
        state.seenHints["ev_" + id] = true;
        this.show(first ? `${info.name}: ${pair}.` : `${info.name}: ${pair}`, first ? 4200 : 2400);
        return;
      }
      if (!state.seenHints["ev_" + id]) {
        state.seenHints["ev_" + id] = true;
        this.show(info.first, 4800);
      } else {
        this.show(info.name, 2000);
      }
    };
    state.worldHint = (key, msg, ms) => this.hint(key, msg, ms);
  }
}
