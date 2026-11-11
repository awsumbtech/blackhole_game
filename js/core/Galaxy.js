// ─── Galaxy ───
// Sets up a galaxy (fresh, resumed or flowed into) and measures progress through it.

import * as audio from "../audio.js";
import * as ui from "../ui.js";
import { setShipLight } from "../ships.js";
import { getBiome, biomeCatalog } from "../entities.js";
import { setNebulaPalette, setHaloFrom } from "../render.js";
import { initWorlds } from "../worlds.js";
import { resetDepth } from "../depth.js";
import { initLivingWorld, fillAround, DENSITY } from "../living-world.js";
import { initRivals } from "../rivals.js";
import { initDiscoveries } from "../discoveries.js";
import { wisp, resetWisp } from "../wisp.js";
import { initPowerups, freshActive } from "../powerups.js";
import { baseMods, freshRun } from "../progression.js";
import { ascMods, depthInfo, rollGolden, GOALS, starsFor } from "../ascension.js";
import { START_R, tierIndexForR, massForR, targetMassFrom } from "../tiers.js";

const $ = id => document.getElementById(id);
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

function tintNebula(neb, rgb, k) {
  return neb.map(c => Array.isArray(c) ? c.map((v, i) => Math.round(v + (rgb[i] - v) * k)) : c);
}

export class Galaxy {
  constructor(game) {
    this.game = game;
    this.state = game.state;
  }

  init(galaxyNum, resume = null, flow = false) {
    const state = this.state, game = this.game;
    // v9.3: a dev sandbox can pick the biome once (the next galaxy is back to normal)
    const biome = (state.devBiome && biomeCatalog.find(b => b.name === state.devBiome)) || getBiome(galaxyNum);
    state.devBiome = null;

    state.mods = baseMods();
    // v7 Ascension: permanent perks (the only upgrades since v9)
    const zen = state.mode === "zen";
    const am = state.ascMods = ascMods(state.asc);
    if (!zen) {
      state.mods.pullRange *= am.pullRange;
      state.mods.pullStrength *= am.pullStrength;
      state.mods.eatRatio = Math.max(0.7, state.mods.eatRatio - am.eatRatioAdd);
      state.mods.reachBonus += am.reachAdd;
      state.mods.thrust *= am.speed;
      state.mods.comboWindow *= am.comboWindow;
      state.mods.surgeDuration *= am.puDur;
      state.mods.surgeFrequency *= am.puFreq;
    }
    state.eatRatio = state.mods.eatRatio;
    const dinfo = state.depth = depthInfo(zen ? 1 : galaxyNum);
    state.densityK = zen ? 1 : dinfo.density;
    state.golden = !zen && !resume && rollGolden(state.asc, am);
    state.goal = zen ? null : GOALS[biome.name] || null;
    state.goalCount = resume && typeof resume.goalCount === "number" ? resume.goalCount : 0;
    state.goalStarsShown = starsFor(state.goal, state.goalCount);
    // v5: start where the last galaxy ended (your floor)
    state.floorMass = Math.max(massForR(START_R), state.floorMass || 0);
    state.startMass = state.floorMass;
    state.targetMass = zen ? Infinity : targetMassFrom(state.floorMass, !!biome.breather, dinfo.climbK * (biome.breather ? am.breatherClimb : 1));
    state.startMass = Math.min(state.startMass, state.targetMass * 0.8);

    state.entities = [];
    state.biome = biome;
    state.baseBounds = 1000;
    state.initialCount = DENSITY.regular;

    // Golden galaxies glow warm gold
    const neb = state.golden ? tintNebula(biome.nebula, [255, 200, 90], 0.45) : biome.nebula;
    setNebulaPalette(neb);
    game.backdrop.set(biome.name);
    setShipLight(neb[1] || neb[0], biome.name + (state.golden ? "*" : ""));   // v9.4 ship rim bounce
    if (!state.seenHints["biome_" + biome.name]) state.seenHints["biome_" + biome.name] = true;

    state.mass = resume ? clamp(resume.mass, state.startMass, state.targetMass * 0.97) : state.startMass;
    game.player.updateRadius();
    state.tier = tierIndexForR(state.radius);
    state.bestTier = Math.max(state.bestTier || 0, state.tier);
    state.anchorR = state.anchorSmooth = state.radius;
    resetDepth(state);
    state.reveal = null;
    state.tierBanner = null;
    state.trail = [];
    state.galaxyProgress = this.progress();

    state.run = freshRun(state.stats);
    if (resume) {
      for (const k of ["time", "eaten", "bestCombo", "bigFish", "powerups", "bumps", "startBestCombo", "bestCatch", "found"]) {
        if (typeof resume[k] === "number") state.run[k] = resume[k];
      }
    }

    state.playerX = (Math.random() - 0.5) * 150;
    state.playerY = (Math.random() - 0.5) * 150;
    if (!flow) { state.playerVX = 0; state.playerVY = 0; }   // flowing on: keep your drift
    state.camX = state.playerX;
    state.camY = state.playerY;
    game.camera.updateScale(game.display.w, game.display.h, true);

    state.particles = [];
    state.ripples = [];
    if (!flow) state.floaters = [];
    state.comboCount = 0;
    state.comboTimer = 0;
    state.active = freshActive();
    state.activeMax = freshActive();
    state.invuln = 0;
    state.nearGoalPlayed = false;

    initLivingWorld(state);
    initWorlds(state);
    fillAround(state, Math.max(20, Math.round((biome.breather ? DENSITY.breather : DENSITY.regular) * state.densityK) - state.entities.length));
    initRivals(state, zen ? 0 : dinfo.rivals, dinfo.rivalSize);
    wisp.syncFromAsc(state.asc);   // v9.2: no wisp until Companion is lit
    resetWisp(state);
    initDiscoveries(state);
    initPowerups();
    ui.updatePowerupBar(state);

    setHaloFrom(zen ? 0.82 : am.haloFrom);
    if (state.golden) setTimeout(() => game.hud.show("A golden galaxy. Everything here shines: pass through it for +5 Dark Matter at your next collapse.", 5000), 2500);
    state.collapseNudge = false;
    $("collapse-pill").classList.add("hidden");
    audio.startDrone(biome);
    audio.newPhrase();
    audio.setMusicLayers(state.tier, biome);
    game.hud.sync(true);
    game.perf.grace();
  }

  /** Log-scale progress: growth is roughly exponential, so this fills steadily. */
  progress() {
    const state = this.state;
    const m0 = state.startMass;
    return state.targetMass > m0
      ? clamp(Math.log(Math.max(state.mass, m0) / m0) / Math.log(state.targetMass / m0), 0, 1)
      : 0;
  }
}
