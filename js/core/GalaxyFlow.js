// ─── GalaxyFlow ───
// In-play galaxy transition (v9): soft veil out, swap, soft veil in. Collapse
// nudge when growth slows. Swap this class to change how galaxies connect.

import { getBiome } from "../entities.js";
import { finishGalaxy } from "../progression.js";
import { rForMass, tierIndexForR } from "../tiers.js";
import { COLLAPSE_MIN_CLEARED } from "../ascension.js";

export const FLOW_OUT = 90, FLOW_IN = 130;

export class GalaxyFlow {
  /**
   * @param {object} state shared game state
   * @param {object} hooks { audio, hint, save, onAscensionClear, initGalaxy }
   */
  constructor(state, hooks) {
    this.state = state;
    this.hooks = hooks;
  }

  complete() {
    const state = this.state, h = this.hooks;
    state.transitioning = true;
    state.transitionPhase = "flowout";
    state.transitionTimer = 0;
    h.audio.playGalaxyComplete();
    state.stats.galaxiesCleared += 1;
    finishGalaxy(state);
    h.onAscensionClear();
    state.floorMass = Math.max(state.floorMass, state.mass);
    state.records.galaxyLog[Math.max(state.stats.galaxiesCleared, state.galaxy)] = {
      b: state.biome.name, gold: state.golden || undefined, d: Date.now(),
      t: Math.max(state.tier, tierIndexForR(rForMass(state.mass)))
    };
    state.galaxyCredited = true;
    const nb = getBiome(state.galaxy + 1).nebula[0];
    state.flowRgb = `${Math.round(nb[0] * 0.25)}, ${Math.round(nb[1] * 0.25)}, ${Math.round(nb[2] * 0.25)}`;
    h.save(state);
  }

  update(dt) {
    const state = this.state, h = this.hooks;
    state.transitionTimer += dt;
    if (state.transitionPhase === "flowout") {
      if (state.transitionTimer > FLOW_OUT) {
        state.floorMass = Math.max(state.floorMass, Math.min(state.mass, state.targetMass * 1.05));
        state.galaxy += 1;
        state.galaxyCredited = false;
        state.bestGalaxy = Math.max(state.bestGalaxy, state.galaxy);
        h.initGalaxy(state.galaxy, null, true);
        h.audio.playRitual();
        state.transitionPhase = "flowin";
        state.transitionTimer = 0;
        const b = state.biome;
        state.tierBanner = { age: 0, head: `GALAXY ${state.galaxy}${state.golden ? " · GOLDEN" : ""}`, name: b.name, line: b.description };
        if (state.mode !== "zen" && state.stats.galaxiesCleared >= 1) {
          setTimeout(() => h.hint("starmap_v9", "Each galaxy you pass becomes a star. Your star map is in the pause menu and on the title screen.", 5200), 6500);
        }
        h.save(state);
      }
    } else if (state.transitionPhase === "flowin") {
      if (state.transitionTimer > FLOW_IN) {
        state.transitioning = false;
        state.transitionPhase = "";
      }
    }
  }

  /** Soft offer to collapse when growth has clearly slowed. Never forced. */
  checkNudge() {
    const state = this.state;
    if (state.collapseNudge || state.mode === "zen" || state.transitioning) return;
    if (state.asc.run.cleared < COLLAPSE_MIN_CLEARED) return;
    const t = state.run.time, p = Math.max(0.04, state.galaxyProgress);
    const br = !!state.biome.breather;
    if (t < (br ? 120 : 180) || t / p < (br ? 270 : 540)) return;
    state.collapseNudge = true;
    const pill = document.getElementById("collapse-pill");
    if (pill) pill.classList.remove("hidden");
    this.hooks.hint("collapse_nudge", "Growth is slowing. When it feels like a wall, you can collapse for Dark Matter and be reborn stronger. Or keep going: no rush.", 6500);
  }

  /** Draw the soft veil. Returns true if a veil was drawn. */
  drawVeil(ctx, w, h) {
    const state = this.state;
    if (!state.transitioning) return false;
    const ph = state.transitionPhase, t = state.transitionTimer;
    let a = ph === "flowout" ? Math.min(1, t / FLOW_OUT) : ph === "flowin" ? 1 - Math.min(1, t / FLOW_IN) : 0;
    a = a * a * (3 - 2 * a) * 0.82;
    if (a <= 0.004) return false;
    ctx.fillStyle = `rgba(${state.flowRgb || "2, 3, 8"}, ${a})`;
    ctx.fillRect(0, 0, w, h);
    return true;
  }
}
