// ─── RunTracker ───
// What the run records as you play: galaxy goals and their stars, Ascension run
// time and depth, the Hungry Wisp perk, rivals, and discoveries.

import * as audio from "../audio.js";
import { save } from "../save.js";
import { worldFlags, worldMassMul } from "../worlds.js";
import { wispInfo, wispReact } from "../wisp.js";
import { updateRivals } from "../rivals.js";
import { starsFor, noteGoalStar, hasMilestone, RARE_FIND_CHANCE } from "../ascension.js";
import { tierIndexForR } from "../tiers.js";

const hypot = (x, y) => Math.sqrt(x * x + y * y);   // 2-arg Math.hypot without the varargs cost

export class RunTracker {
  constructor(game) {
    this.game = game;
    this.state = game.state;
    // passed to the per-frame updaters, so bound once
    this.onRivalSwallow = rv => game.feeding.onRivalSwallow(rv);
    this.onDiscovery = this.onDiscovery.bind(this);
  }

  /** Per-galaxy goal: count the bites (or seconds) that use this galaxy's mechanic. */
  trackGoal(e) {
    const state = this.state;
    const g = state.goal;
    if (!g || state.mode === "zen") return;
    let hit = false;
    switch (g.metric) {
      case "reef": hit = e.reef != null; break;
      case "orbit": hit = !!e.orbit; break;
      case "crumb": hit = !!e.crumb; break;
      case "aurora": hit = !!e.auroraItem; break;
      case "bloom": hit = e.meadow != null && !e.bloom; break;
      case "beam": hit = worldMassMul() > 1; break;
    }
    if (hit) this.bumpGoal(1);
  }

  bumpGoal(n) {
    const state = this.state, game = this.game;
    state.goalCount += n;
    const st = starsFor(state.goal, state.goalCount);
    if (st > state.goalStarsShown) {
      state.goalStarsShown = st;
      audio.playGoalStar(st);
      game.fx.floater(state.playerX, state.playerY - state.radius * 2.2, "★".repeat(st) + "☆".repeat(3 - st), "#ffe3a0", 18);
      // v9: goals are optional discoveries. A new best star for this galaxy type gives a little Dark Matter.
      const dm = noteGoalStar(state.asc, state.ascMods, state.biome.name, st);
      if (dm) setTimeout(() => game.fx.floater(state.playerX, state.playerY - state.radius * 2.2, `New best · +${dm} Dark Matter`, "#d9ccff", 15), 700);
      game.hud.hint("goal_star", `A goal star: ${state.goal.name.toLowerCase()}. Each galaxy type has its own optional goal, written in your logbook.`, 4600);
    }
  }

  update(dt) {
    const state = this.state;
    if (state.mode === "zen") return;
    if (state.goal && state.goal.metric === "ride" && worldFlags().riding) this.bumpGoal(dt / 60);
    state.asc.run.time = (state.asc.run.time || 0) + dt / 60;
    // Hungry Wisp perk: every ~4s the wisp nudges a nearby crumb into you
    if (state.ascMods.wispFeed) {
      state.wispFeedT = (state.wispFeedT || 0) + dt;
      const wi = wispInfo();
      if (state.wispFeedT > 240 && wi) {
        state.wispFeedT = 0;
        let best = null, bd = hypot(state.viewW, state.viewH) * 0.3;
        for (const e of state.entities) {
          if (e.consuming || e.powerup || state.radius <= e.radius * state.eatRatio) continue;
          const d = hypot(e.x - wi.x, e.y - wi.y);
          if (d < bd) { bd = d; best = e; }
        }
        if (best) {
          const dx = state.playerX - best.x, dy = state.playerY - best.y, d = hypot(dx, dy) || 1;
          const sp = 2.2 * Math.sqrt(state.speedScale);
          best.vx = dx / d * sp; best.vy = dy / d * sp;
        }
      }
    }
    updateRivals(state, dt, this.onRivalSwallow);
  }

  /** After a galaxy is passed: run depth, peak scale, golden count. */
  onAscensionClear() {
    const state = this.state;
    const a = state.asc, r = a.run;
    r.cleared += 1;
    r.peakTier = Math.max(r.peakTier || 0, state.tier, tierIndexForR(state.radius));
    a.bestDepth = Math.max(a.bestDepth || 0, r.cleared);
    if (state.golden) r.goldenCleared = (r.goldenCleared || 0) + 1;
  }

  // v6: discoveries
  onDiscovery(def, f) {
    const state = this.state, game = this.game;
    const log = state.records.discoveries || (state.records.discoveries = {});
    const first = !log[def.id];
    log[def.id] = { g: first ? state.galaxy : log[def.id].g, d: first ? Date.now() : log[def.id].d, n: (log[def.id]?.n || 0) + 1 };
    state.run.found = (state.run.found || 0) + 1;
    if (state.mode !== "zen") {
      state.asc.run.finds = (state.asc.run.finds || 0) + 1;
      // Rare, shining finds: +3 Dark Matter on the spot
      if (hasMilestone(state.asc, "golden") && Math.random() < RARE_FIND_CHANCE * state.ascMods.rareMul) {
        state.asc.dm += 3; state.asc.dmTotal += 3;
        setTimeout(() => { game.fx.floater(state.playerX, state.playerY - state.radius * 2, "Shining find · +3 Dark Matter", "#d9ccff", 17); audio.playGoalStar(3); }, 900);
      }
    }
    (state.run.foundNames || (state.run.foundNames = [])).push(def.name);
    game.fx.floater(f.x, f.y, first ? "Discovered" : "Found again", "#fff0c8", 17);
    game.hud.show(`${def.name}. ${def.line}`, 5200);
    audio.playDiscovery();
    wispReact(state, "discovery");
    if (first) setTimeout(() => game.hud.hint("logbook", "Written in your logbook (title screen or Stats)", 3600), 5600);
    save(state);
  }
}
