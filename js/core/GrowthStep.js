// ─── GrowthStep ───
// The quiet "I got bigger" between tier-ups. At each third of the way from a
// tier's start radius to the next tier line, one soft chime and (unless Reduce
// Motion is on) one short camera ease-back. No caption, no hint, no new food.
// This class owns that decision. Camera only runs the ease it is given.

import { rForTier } from "../tiers.js";

export class GrowthStep {
  static MARKS = [1 / 3, 2 / 3];
  static EASE_SECONDS = 1.2;
  static EASE_PULL = 0.15;

  /**
   * @param {object} state
   * @param {object} hooks { audio, camera }
   */
  constructor(state, hooks) {
    this.state = state;
    this.hooks = hooks;
    /** tier index -> how many marks are already spent (0, 1, or 2) */
    this.ack = new Map();
    /** tiers whose opening size we have already noted, so a resume does not chime */
    this.based = new Set();
    /** one entry per step that actually played: { tier, mark, chime, camera } */
    this.events = [];
  }

  /** True when a step would be a calm in-play moment, not a ceremony already running. */
  playable() {
    const s = this.state;
    if (s.screen !== "play") return false;
    if (s.birth > 0) return false;
    if (s.mode === "zen") return false;
    if (s.transitioning) return false;
    if (s.reveal) return false;
    // The collapse screen is already excluded above (it is not "play").
    // The confirm card stays on screen "play", so it is checked on its own.
    const ask = document.getElementById("collapse");
    if (ask && !ask.classList.contains("hidden")) return false;
    return true;
  }

  /** 0 at the tier line, 1 at the next tier line. */
  fraction(tier) {
    const start = rForTier(tier);
    const end = rForTier(tier + 1);
    const span = end - start;
    if (!(span > 0)) return 0;
    return (this.state.radius - start) / span;
  }

  /** How many thirds the hole has reached in this tier (0, 1, or 2). */
  reached(tier) {
    const f = this.fraction(tier);
    const marks = GrowthStep.MARKS;
    let n = 0;
    for (let i = 0; i < marks.length; i++) if (f + 1e-9 >= marks[i]) n = i + 1;
    return n;
  }

  /**
   * Call once a frame while the tier is not changing. A tier-up in the same
   * moment is not this method's job: Growth skips the call and cancels any
   * ease so the reveal keeps the camera.
   */
  consider() {
    if (!this.playable()) return;
    const tier = this.state.tier | 0;
    const reached = this.reached(tier);
    if (!this.based.has(tier)) {
      this.based.add(tier);
      this.ack.set(tier, reached);
      return;
    }
    const prev = this.ack.get(tier) || 0;
    if (reached <= prev) return;
    // One ease at a time. The next third waits until this one has returned.
    if (this.state.easeBack) return;
    const mark = prev + 1;
    // A jump that crosses both thirds plays the first one only. The later
    // mark is spent, so the next frame does not add a second chime.
    this.ack.set(tier, reached);
    this.play(tier, mark);
  }

  /**
   * A new run starts clean: collapse rebirth and "start completely over".
   * A galaxy hop in the same run does not call this.
   */
  reset() {
    this.ack.clear();
    this.based.clear();
    this.events.length = 0;
    this.cancel();
  }

  /** Drop a running ease. Does not spend or refund a third. */
  cancel() {
    this.hooks.camera.cancelEaseBack();
  }

  play(tier, mark) {
    const reduce = !!(this.state.settings && this.state.settings.reduceMotion);
    let camera = false;
    if (!reduce) {
      camera = this.hooks.camera.beginEaseBack(GrowthStep.EASE_SECONDS, GrowthStep.EASE_PULL);
    }
    this.hooks.audio.playGrowthChime();
    this.events.push({ tier, mark, chime: true, camera: !!camera });
  }
}
