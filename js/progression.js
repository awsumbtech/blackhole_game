// ─── PROGRESSION ───
// Run records and number formatting. (v9: the stardust shop is gone. Growth is
// the progression inside a run; Dark Matter and the constellation are the only
// meta layer, see ascension.js.)

// Base gameplay modifiers before constellation perks (what the old shop's level 0 was).
export function baseMods() {
  return {
    thrust: 1, eatRatio: 0.88, reachBonus: 0, pullRange: 1, pullStrength: 1,
    comboWindow: 75, surgeDuration: 1, surgeFrequency: 1
  };
}

/** Food shrinks a little each galaxy (relative to you), down to 85% (was 70%). */
export function foodScaleFor(galaxy) {
  // v5: the scale ladder is the progression now, so food only shrinks a touch
  return Math.max(0.92, 1 - 0.01 * (galaxy - 1));
}

export function freshRun(stats) {
  return { time: 0, eaten: 0, bestCombo: 0, bigFish: 0, powerups: 0, bumps: 0, found: 0, foundNames: [], bestCatch: null, startBestCombo: stats.bestCombo || 0 };
}

/** Called once when a galaxy is passed: personal records only. */
export function finishGalaxy(state) {
  const run = state.run, rec = state.records;
  if (run.eaten > rec.mostEaten) rec.mostEaten = run.eaten;
  if (run.bigFish > rec.mostBigFish) rec.mostBigFish = run.bigFish;
}

export function fmtTime(sec) {
  if (sec == null || !isFinite(sec)) return "--:--";
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

const SUFFIX = ["", "k", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
export function fmtMass(n) {
  n = Math.floor(n);
  if (n < 1000) return String(n);
  const e = Math.min(SUFFIX.length - 1, Math.floor(Math.log10(n) / 3));
  if (e === SUFFIX.length - 1 && n >= 1e36) return n.toExponential(1);
  const v = n / Math.pow(1000, e);
  return (v < 10 ? v.toFixed(1) : Math.round(v)) + SUFFIX[e];
}
