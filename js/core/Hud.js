// ─── Hud ───
// The DOM heads-up display: galaxy, scale, biome, progress, goal stars, and the
// hint toast. One-time hints are remembered in state.seenHints. A new toast
// waits until the one on screen has been up for at least 2.5s. Duplicates are
// dropped and the queue stays short. Nothing else in the game waits on it.

import { tierName } from "../tiers.js";
import { starsFor } from "../ascension.js";
import { EVENT_INFO } from "../living-world.js";
import { eventPairText } from "../worlds.js";

export class Hud {
  static HOLD_MS = 2500;   // a hint stays at least this long before the next one replaces it
  static QUEUE_MAX = 3;

  constructor(game) {
    this.game = game;
    this.state = game.state;
    this.galaxy = this.el("hud-galaxy");
    this.goal = this.el("hud-goal");
    this.mass = this.el("hud-mass");
    this.biome = this.el("hud-biome");
    this.progressBar = this.el("hud-progress-bar");
    this.toast = this.el("hint-toast");
    this.toastT = 0;
    this.queue = [];
    this.current = "";
    this.currentMs = 0;
    this.currentKey = "";
    this.shownAt = 0;
    this.wireEventHints();
  }

  el(id) { return document.getElementById(id); }

  /** A one-time hint (key) or a plain one (no key). The seen flag is set when it is actually shown. */
  hint(key, msg, ms) {
    if (key && this.state.seenHints[key]) return;
    this.show(msg, ms, { key: key || "" });
  }

  /**
   * opts.urgent: direct-tap feedback. It shows now and the line it covered
   * waits its turn behind it. opts.key: a one-time hint, marked seen in present().
   */
  show(msg, ms = 2800, opts) {
    if (!msg) return;
    const urgent = !!(opts && opts.urgent);
    const key = (opts && opts.key) || "";
    if (urgent) {
      if (this.current && this.current !== msg) {
        this.queue.unshift({ msg: this.current, ms: this.currentMs || 2800, key: "" });
        while (this.queue.length > Hud.QUEUE_MAX) this.queue.pop();
      }
      this.present(msg, ms, "", true);
      return;
    }
    if (msg === this.current) return;
    for (let i = 0; i < this.queue.length; i++) if (this.queue[i].msg === msg) return;
    if (!this.current) {
      this.present(msg, ms, key, false);
      return;
    }
    if (this.queue.length >= Hud.QUEUE_MAX) this.queue.shift();
    this.queue.push({ msg, ms, key });
    this.arm();
  }

  /** Drop a hint the player has already followed (a steer, for example). */
  dismiss(msg) {
    if (!msg) return;
    const next = [];
    for (let i = 0; i < this.queue.length; i++) if (this.queue[i].msg !== msg) next.push(this.queue[i]);
    this.queue = next;
    if (this.current !== msg) return;
    clearTimeout(this.toastT);
    this.current = "";
    this.currentKey = "";
    this.toast.classList.add("hidden");
    if (!this.queue.length) return;
    const item = this.queue.shift();
    this.present(item.msg, item.ms, item.key || "", false);
  }

  present(msg, ms, key = "", urgent = false) {
    if (key) this.state.seenHints[key] = true;
    this.current = msg;
    this.currentMs = ms;
    this.currentKey = key || "";
    this.shownAt = performance.now();
    const el = this.toast;
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(this.toastT);
    const hold = urgent ? ms : Math.max(ms, Hud.HOLD_MS);
    const wait = (!urgent && this.queue.length) ? Math.min(hold, Hud.HOLD_MS) : hold;
    this.toastT = setTimeout(() => this.advance(), wait);
  }

  arm() {
    if (!this.current || !this.queue.length) return;
    const wait = this.shownAt + Hud.HOLD_MS - performance.now();
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => this.advance(), wait > 0 ? wait : 0);
  }

  clear() {
    clearTimeout(this.toastT);
    this.queue = [];
    this.current = "";
    this.currentMs = 0;
    this.currentKey = "";
    this.shownAt = 0;
    if (this.toast) this.toast.classList.add("hidden");
  }

  advance() {
    const elapsed = performance.now() - this.shownAt;
    if (this.queue.length && elapsed < Hud.HOLD_MS) {
      this.toastT = setTimeout(() => this.advance(), Hud.HOLD_MS - elapsed);
      return;
    }
    if (!this.queue.length) {
      this.current = "";
      this.toast.classList.add("hidden");
      return;
    }
    const item = this.queue.shift();
    this.present(item.msg, item.ms, item.key || "", false);
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
