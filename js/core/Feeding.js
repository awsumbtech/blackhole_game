// ─── Feeding ───
// Eating, bumping and pickups: how much a bite is worth (the pacing constants),
// the calm bump off things too big, power-up pickups and swallowed rivals.

import * as audio from "../audio.js";
import * as ui from "../ui.js";
import { rand } from "../entities.js";
import { onWorldBump, worldMassMul } from "../worlds.js";
import { wispReact } from "../wisp.js";
import { POWERUPS, activatePowerup } from "../powerups.js";
import { getArtQuality } from "../art.js";

const hypot = (x, y) => Math.sqrt(x * x + y * y);   // 2-arg Math.hypot without the varargs cost
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

// Largest single bite as a share of your mass. Growth is exponential, so this
// (more than the galaxy target) sets the pace: ~6% => roughly 2.5-4 min per galaxy for a person.
const MAX_BITE = 0.042;     // v4.1: worlds add food (reefs, rivers, aurora), so bites are a little smaller
const MAX_BIG_BITE = 0.056;  // outgrown "bigger fish" are a slightly bigger treat
const BREATHER_BITE = 0.055; // breathers: food is big and everywhere, so a smaller cap keeps it ~1-1.5 min
const MIN_BITE_CAP = 6;
const REGULAR_GAIN = 0.26;   // v4.1: share of a bite's mass you keep in regular galaxies (breathers 0.5)
// v5: each galaxy now climbs only ~1 tier (instead of ~14x in size), so every
// bite counts for less: "very small increments". These scale all of the above.
const PACE = 0.16;
const BREATHER_PACE = 0.095;
// v6 "meatier bites": food is bigger and sparser, so each bite carries more but
// the total time per galaxy is unchanged (tuned with the playtest bot).
// gain scales what a bite gives, cap lifts the per-bite ceiling so big morsels count.
// Per-galaxy factors keep each galaxy's v5.2 clear time (bot-measured, within ~10%).
const MEATY = { gain: 1, breatherGain: 1, cap: 2, byBiome: {
  "Debris Reef": 0.75, "Comet Current": 0.63, "Planet Nursery": 0.56, "Ruined Armada": 0.53,
  "Void Rift": 0.85, "Star Meadow": 0.56, "Neutron Forge": 0.62 },
  // bite ceiling per galaxy (breathers and Armada are ceiling-bound, so this sets their pace)
  // v9: Nursery, Void Rift and Meadow a little quicker (first collapse ~30 min); Comet and Armada stay the walls
  capBiome: { "Planet Nursery": 1.15, "Star Meadow": 1.15, "Ruined Armada": 1.2 } };
// Calm bump: a soft, eased nudge away from something too big. No shake, the
// combo just pauses, and it never costs mass.
const BUMP_PUSH = 2.4;          // was a hard 7x speed kick
const COMBO_PAUSE = 120;        // combo holds for 2s instead of resetting

export class Feeding {
  constructor(game) {
    this.game = game;
    this.state = game.state;
  }

  meatyK() {
    const state = this.state;
    return (MEATY.byBiome[state.biome.name] ?? 0.62) * (state.biome.breather ? MEATY.breatherGain : MEATY.gain);
  }

  /** Per frame: combo timer, slurps in progress, bites, bumps, pickups. */
  update(dt) {
    const state = this.state, game = this.game;
    let ateThisFrame = 0;
    let totalTone = 0;
    let totalMassGained = 0;
    const R = state.radius;

    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) {
        state.comboTimer = 0;
        state.comboCount = 0;
      }
    }
    if (state.invuln > 0) state.invuln = Math.max(0, state.invuln - dt);

    for (const e of state.entities) {
      if (e.consumed) continue;
      if (e.consuming) {
        // Slurp toward the center while spinning down
        const pull = 1 - Math.pow(1 - 0.18, dt);
        e.x += (state.playerX - e.x) * pull;
        e.y += (state.playerY - e.y) * pull;
        e.consumeProgress += (e.swallow ? (state.settings.reduceMotion ? 0.035 : 0.016) : 0.06) * dt;
        if (e.consumeProgress >= 1) e.consumed = true;
        continue;
      }
      if (e.depthT < 1) continue;   // v8.3: still drifting in from a back layer

      const dx = e.x - state.playerX;
      const dy = e.y - state.playerY;
      const dist = hypot(dx, dy);

      // Power-up pickup
      if (e.powerup) {
        if (dist < R + e.radius) {
          e.consuming = true;
          e.consumeProgress = 0;
          this.collectPowerup(e);
        }
        continue;
      }

      const edible = R > e.radius * state.eatRatio;
      const touchDist = R + e.radius * (0.4 + state.mods.reachBonus);

      if (edible && dist < touchDist) {
        e.consuming = true;
        e.consumeProgress = 0;

        const comboBonus = 1 + Math.min(state.comboCount, state.mode === "zen" ? 25 : state.ascMods.comboCap) * 0.01;
        const dbl = state.active.double > 0 ? 2 : 1;
        // Small absolute floor keeps the opening seconds snappy
        const biteK = state.biome.breather ? BREATHER_BITE : (e.bigFish ? MAX_BIG_BITE : MAX_BITE);
        const pace = state.biome.breather ? BREATHER_PACE : PACE;
        const cap = Math.max(MIN_BITE_CAP, state.mass * biteK) * pace * (MEATY.capBiome[state.biome.name] ?? MEATY.cap);
        const gk = (state.biome.breather ? 0.5 : REGULAR_GAIN) * this.meatyK() * pace;
        // biome.gainK evens out pacing for galaxies whose mechanic adds a lot of food
        let gain = Math.min(e.mass * e.gainK * gk * (state.biome.gainK || 1) * comboBonus, cap) * dbl * worldMassMul();
        // v7 Ascension: perks (Appetite), supernova runs, and big-catch perks
        if (state.mode !== "zen") {
          gain *= state.ascMods.gain * (state.asc.run.supernova ? 1.5 : 1);
          if (e.bigFish) gain *= state.ascMods.bigCatch;
        }
        game.run.trackGoal(e);
        state.mass += gain;
        game.player.updateRadius();

        state.comboCount += 1;
        state.comboTimer = state.mods.comboWindow;
        state.run.eaten += 1;
        if (state.comboCount > state.run.bestCombo) state.run.bestCombo = state.comboCount;

        ateThisFrame += 1;
        totalTone += e.tone;
        totalMassGained += gain;
        state.gulp = Math.min(1, state.gulp + 0.25 + Math.min(0.5, gain / state.mass));

        game.fx.spawnConsume(e, getArtQuality());
        game.fx.spawnRipple(e);
        game.inflow.feed(Math.atan2(dy, dx), dist / state.radius);

        if (e.bigFish) {
          // v6: a slow, satisfying swallow (about a second) with a soft chime. No shake.
          e.swallow = true;
          state.run.bigFish += 1;
          state.stats.bigFishEaten += 1;
          if (!state.run.bestCatch || e.radius > state.run.bestCatch.r) state.run.bestCatch = { r: e.radius, type: e.type };
          game.fx.floater(e.x, e.y, "Big catch", "#ffcf6e", 19);
          state.gulp = 1;
          audio.playBigCatch();
          game.impact(0.6);
          wispReact(state, "catch");
          game.hud.hint("bigcatch", "Big catch! Golden halos show what's almost in reach.", 3600);
        }
      } else if (!edible && state.invuln <= 0 && (e._spawnAlpha ?? 1) > 0.6 && dist < R + e.radius * 0.85) {
        this.bump(e, dx, dy, dist);
      }
    }

    // Sweep finished/expired entities
    const es = state.entities;
    let keep = 0;
    for (let i = 0; i < es.length; i++) if (!es[i].consumed) es[keep++] = es[i];
    es.length = keep;

    if (ateThisFrame > 0) {
      const avgTone = totalTone / ateThisFrame;
      const massRatio = clamp(totalMassGained / (state.mass * 0.15), 0, 1);
      audio.playConsume(avgTone, massRatio, state.comboCount);
      if (state.comboCount >= 3 && state.comboCount % 3 === 0) audio.playComboChime(state.comboCount);

      state.totalConsumed += ateThisFrame;
      state.stats.totalConsumed += ateThisFrame;
      state.stats.highestMass = Math.max(state.stats.highestMass, state.mass);
      state.stats.bestCombo = Math.max(state.stats.bestCombo, state.comboCount);

      if (state.comboCount === 8) game.hud.hint("combo", "Chain bites quickly: combos add bonus mass", 3200);
    }

    if (!state.nearGoalPlayed && state.mass >= state.targetMass * 0.9) {
      state.nearGoalPlayed = true;
      audio.playNearGoal();
      game.hud.show("Almost there…", 1800);
    }

    if (state.mass >= state.targetMass && !state.transitioning) game.galaxyFlow.complete();
  }

  bump(e, dx, dy, dist) {
    const state = this.state, game = this.game;
    onWorldBump(state, e);           // Ruined Armada: brittle hulls crumble
    const d = Math.max(1, dist);
    const nx = -dx / d;
    const ny = -dy / d;
    const ss = state.speedScale;
    // Blend toward the push instead of overwriting velocity, so it glides
    const into = state.playerVX * -nx + state.playerVY * -ny;
    if (into > 0) {
      state.playerVX += nx * into;
      state.playerVY += ny * into;
    }
    state.playerVX += nx * BUMP_PUSH * ss;
    state.playerVY += ny * BUMP_PUSH * ss;
    e.vx -= nx * 0.15 * e.baseSpeed;
    e.vy -= ny * 0.15 * e.baseSpeed;

    state.invuln = 60;
    if (state.comboCount > 0) state.comboTimer = Math.max(state.comboTimer, COMBO_PAUSE);
    state.run.bumps += 1;
    state.stats.bumps += 1;

    const bx = state.playerX - nx * state.radius;
    const by = state.playerY - ny * state.radius;
    const n = state.settings.reduceMotion ? 4 : 8;
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(-ny, -nx) + rand(-1.2, 1.2);
      const sp = rand(0.4, 1.2) * ss;
      state.particles.push({
        x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        size: (1 + Math.random() * 1.5) * Math.max(1, state.radius * 0.05),
        color: "#cdd8ff", alpha: 0.5, age: 0, maxAge: 40, gravity: 0
      });
    }
    audio.playBump();
    game.hud.hint("bump", "Ringed objects are still too big. Grow a little, then come back for them.", 3800);
  }

  collectPowerup(e) {
    const state = this.state, game = this.game;
    const def = POWERUPS[e.powerup];
    activatePowerup(state, e.powerup);
    state.run.powerups += 1;
    state.stats.powerupsCollected += 1;
    audio.playPowerup(e.powerup);
    game.fx.floater(e.x, e.y, def.label, def.color, 18);
    const pn = state.settings.reduceMotion ? 10 : 20;
    for (let i = 0; i < pn; i++) {
      const a = (i / pn) * Math.PI * 2;
      const sp = rand(0.8, 2) * state.speedScale;
      state.particles.push({
        x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        size: (1.5 + Math.random() * 2) * Math.max(1, state.radius * 0.06),
        color: def.color, alpha: 0.9, age: 0, maxAge: 45, gravity: 0
      });
    }
    ui.updatePowerupBar(state);
    const tips = {
      magnet: "Magnet: nearby food drifts toward you",
      slow: "Slow-Mo: the galaxy slows down, you don't",
      double: "Double Mass: every bite counts twice"
    };
    game.hud.hint("pu_" + e.powerup, tips[e.powerup], 3000);
  }

  onRivalSwallow(rv) {
    const state = this.state, game = this.game;
    const gain = state.mass * 0.035 * state.ascMods.bigCatch * state.ascMods.gain;
    state.mass += gain;
    game.player.updateRadius();
    state.gulp = 1;
    state.run.bigFish += 1;
    if (!state.run.bestCatch || rv.r > state.run.bestCatch.r) state.run.bestCatch = { r: rv.r, type: "rival" };
    game.fx.floater(rv.x, rv.y, "Rival swallowed", "#ffcf6e", 19);
    audio.playBigCatch();
    game.impact(0.6);
    wispReact(state, "catch");
    game.hud.hint("rival_eat", "You outgrew a rival. Another, a little bigger, will drift in later.", 4000);
  }
}

export { MEATY };
