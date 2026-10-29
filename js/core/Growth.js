// ─── Growth ───
// Tier-ups and depth-layer merges: the felt progression inside a run.
// Upgrade this class to change how growth feels (banner, merge spectacle, reveal).

import { tier, tierIndexForR, tierName } from "../tiers.js";
import { startMerge, layerName, MERGE_FRAMES } from "../depth.js";
import { spawnFood } from "../living-world.js";
import { REVEAL_FRAMES } from "./Camera.js";

export class Growth {
  /**
   * @param {object} state
   * @param {object} hooks { camera, audio, hint, onWorldTier, screenW, screenH, fx }
   */
  constructor(state, hooks) {
    this.state = state;
    this.hooks = hooks;
    // Soft "world opens" pulse drawn over the merge (0..1 while active)
    this.mergePulse = 0;
    this.mergePulseMax = 0;
  }

  /** If the hole outgrew its tier, start the reveal + merge spectacle. */
  check() {
    const state = this.state, h = this.hooks;
    const t = tierIndexForR(state.radius);
    if (t <= state.tier) return;
    state.tier = t;
    state.bestTier = Math.max(state.bestTier || 0, t);
    h.camera.beginReveal(!!state.settings.reduceMotion);
    // Banner: name the scale, and (v9.1) what is drifting closer
    const arrived = layerName(t);
    state.tierBanner = {
      age: 0,
      head: "A WIDER VIEW",
      name: tierName(t),
      line: tier(t).line,
      sub: arrived ? `${arrived.charAt(0).toUpperCase() + arrived.slice(1)} drift closer` : ""
    };
    state.stats.tierReveals = (state.stats.tierReveals || 0) + 1;
    h.audio.playTierChime();
    h.audio.setMusicLayers(t, state.biome);

    let merged = 0;
    if (state.screen === "play") {
      const z = state.zoom, hp = state.anchorSmooth * z;
      const n = startMerge(state, h.screenW(), h.screenH(), hp, (id, sx, sy, rad) => this.mergeSpawn(id, sx, sy, rad));
      merged = n;
      if (n) {
        // Soft pulse: a calm inhale as the next layer arrives (Reduce Motion: skip)
        this.mergePulseMax = state.settings.reduceMotion ? 0 : 1;
        this.mergePulse = this.mergePulseMax;
        state.gulp = Math.min(1, state.gulp + 0.35);
        h.hint("merge_" + t, `You're big enough now. The ${arrived} drift closer.`, 4600);
      }
    }
    h.onWorldTier(state);
    h.onGrowth?.(t, merged);
    state.onTierReveal?.(t);
  }

  mergeSpawn(id, sx, sy, rad) {
    const state = this.state, h = this.hooks;
    const z = state.zoom, w = h.screenW(), hh = h.screenH();
    const e = spawnFood(state, false, {
      type: id,
      pos: { x: state.camX + (sx - w / 2) / z, y: state.camY + (sy - hh / 2) / z }
    });
    e.depthT = 0;
    e.depthK0 = Math.min(2.5, Math.max(0.3, rad / (e.radius * z)));
    e.vx *= 0.4; e.vy *= 0.4;
    e._spawnAge = 60; e._spawnAlpha = 1;
    // Soft arrival ring (drawn while depthT < 1)
    e.mergeGlow = 1;
    state.entities.push(e);
  }

  update(dt) {
    if (this.mergePulse > 0) {
      this.mergePulse = Math.max(0, this.mergePulse - dt / (MERGE_FRAMES * 0.85));
    }
    // Fade per-entity merge glow with depthT (set each frame from living-world)
    const ents = this.state.entities;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.mergeGlow && e.depthT >= 1) e.mergeGlow = 0;
    }
  }

  /** Soft radial veil as the world opens. Drawn above the world, under the HUD. */
  drawPulse(ctx, w, h) {
    const p = this.mergePulse;
    if (p <= 0.004) return;
    const q = p * p * (3 - 2 * p);          // smoothstep
    // Calm: a dark edge that lifts (the universe opening), not a flash
    const a = q * 0.22;
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.15, w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, `rgba(180, 200, 255, ${a * 0.15})`);
    g.addColorStop(0.55, `rgba(20, 24, 48, 0)`);
    g.addColorStop(1, `rgba(4, 6, 18, ${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

export { REVEAL_FRAMES };
