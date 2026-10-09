// ─── PROGRESSION ───
// Stardust economy, permanent upgrades, galaxy targets and personal records.

import { isBreather } from "./entities.js";

export const MAX_LEVEL = 5;

// Stardust cost to buy level 1..5 (scaled per upgrade by costMult).
const BASE_COSTS = [25, 50, 85, 130, 190];

const START_MASS = [20, 50, 100, 180, 300, 480];

export const UPGRADES = [
  {
    id: "startMass", name: "Seed Mass", costMult: 1.2,
    desc: l => `Start each galaxy at ${START_MASS[l]} mass`
  },
  {
    id: "thrusters", name: "Thrusters", costMult: 1,
    desc: l => `+${l * 8}% move speed`
  },
  {
    id: "reach", name: "Event Horizon", costMult: 1.3,
    desc: l => `Swallow things up to ${Math.round(100 / eatRatioFor(l))}% of your size`
  },
  {
    id: "gravity", name: "Gravity Well", costMult: 1,
    desc: l => `+${l * 20}% pull range, +${l * 15}% pull strength`
  },
  {
    id: "combo", name: "Momentum", costMult: 1,
    desc: l => `Combo window ${(comboWindowFor(l) / 60).toFixed(2)}s (combos add up to +25% mass)`
  },
  {
    id: "surge", name: "Power Surge", costMult: 1,
    desc: l => `Power-ups last +${l * 15}% and show up ${l * 10}% more often`
  }
];

export function eatRatioFor(level) { return 0.88 - 0.03 * level; }
export function comboWindowFor(level) { return 75 * (1 + 0.2 * level); }
export function startMassFor(level) { return START_MASS[Math.min(level, MAX_LEVEL)]; }

export function upgradeCost(upg, level) {
  if (level >= MAX_LEVEL) return null;
  return Math.round(BASE_COSTS[level] * upg.costMult);
}

/** Derived gameplay modifiers from upgrade levels. */
export function computeMods(upgrades) {
  const u = upgrades;
  return {
    startMass: startMassFor(u.startMass || 0),
    thrust: 1 + 0.08 * (u.thrusters || 0),
    eatRatio: eatRatioFor(u.reach || 0),
    reachBonus: 0.1 * (u.reach || 0),
    pullRange: 1 + 0.2 * (u.gravity || 0),
    pullStrength: 1 + 0.15 * (u.gravity || 0),
    comboWindow: comboWindowFor(u.combo || 0),
    surgeDuration: 1 + 0.15 * (u.surge || 0),
    surgeFrequency: 1 + 0.1 * (u.surge || 0)
  };
}

/** Mass needed to clear a galaxy. Growth is roughly exponential, so time per
 *  galaxy scales with log(target / startMass); targets rise ~75% per galaxy
 *  to keep pace with upgrades. */
export const BREATHER_TARGET = 0.55;  // breather galaxies need 55% of the usual mass

export function targetMassFor(galaxy) {
  const k = isBreather(galaxy) ? BREATHER_TARGET : 1;
  return Math.round((15000 * Math.pow(1.75, galaxy - 1) * k) / 500) * 500;
}

/** Food shrinks a little each galaxy (relative to you), down to 85% (was 70%). */
export function foodScaleFor(galaxy) {
  return Math.max(0.85, 1 - 0.03 * (galaxy - 1));
}

/** Par time (seconds) for the speed bonus. */
export function parTimeFor(galaxy) {
  return 200 + galaxy * 10;
}

export function freshRun(stats) {
  return { time: 0, eaten: 0, bestCombo: 0, bigFish: 0, powerups: 0, bumps: 0, startBestCombo: stats.bestCombo || 0 };
}

/** Called once when a galaxy is cleared. Updates records + stardust, returns summary. */
export function finishGalaxy(state) {
  const g = state.galaxy;
  const run = state.run;
  const rec = state.records;
  const time = Math.round(run.time * 10) / 10;

  // Zen mode: no clock pressure, so no speed bonus or time records
  const zen = !!(state.settings && state.settings.zen);
  const prevFast = rec.fastest[g] ?? null;
  const newFast = !zen && (prevFast == null || time < prevFast);
  if (newFast) rec.fastest[g] = time;

  const newCombo = run.bestCombo > run.startBestCombo && run.bestCombo > 0;
  const newEaten = run.eaten > rec.mostEaten;
  if (newEaten) rec.mostEaten = run.eaten;
  const newBig = run.bigFish > rec.mostBigFish;
  if (newBig) rec.mostBigFish = run.bigFish;

  const par = parTimeFor(g);
  const parts = [
    ["Galaxy bonus", 12 + g * 4],
    ["Objects eaten", Math.floor(run.eaten / 4)],
    ["Best combo", Math.floor(run.bestCombo / 2)],
    ["Big catches", run.bigFish],
    ["Speed bonus", !zen && time < par ? Math.round((par - time) / 5) : 0],
    ["New record", newFast && prevFast != null ? 10 : 0],
    ["Zen bonus", zen ? 10 : 0]
  ].filter(p => p[1] > 0);
  const earned = parts.reduce((s, p) => s + p[1], 0);

  state.stardust += earned;
  state.stats.stardustEarned += earned;
  if (earned > rec.bestStardust) rec.bestStardust = earned;

  return {
    galaxy: g,
    biome: state.biome ? state.biome.name : "",
    time, prevFast, newFast, par, zen, mass: state.mass,
    breather: !!(state.biome && state.biome.breather),
    eaten: run.eaten, newEaten,
    bestCombo: run.bestCombo, newCombo,
    bigFish: run.bigFish, newBig,
    powerups: run.powerups,
    parts, earned
  };
}

export function fmtTime(sec) {
  if (sec == null || !isFinite(sec)) return "--:--";
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function fmtMass(n) {
  n = Math.floor(n);
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1) + "k";
  if (n < 1e6) return Math.round(n / 1000) + "k";
  return (n / 1e6).toFixed(1) + "M";
}
