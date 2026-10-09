// ─── SAVE SYSTEM ───
// localStorage persistence, stats, records, upgrades and mid-galaxy progress.
// v2 keeps the original key so existing v1 saves load and migrate in place.

const SAVE_KEY = "blackhole_galaxy_v3";
export const SAVE_VERSION = 4;

export function defaultStats() {
  return {
    totalConsumed: 0,
    galaxiesCleared: 0,
    highestMass: 0,
    bestCombo: 0,
    timePlayed: 0,        // seconds
    stardustEarned: 0,
    bigFishEaten: 0,
    powerupsCollected: 0,
    bumps: 0
  };
}

export function defaultRecords() {
  return {
    fastest: {},          // galaxy number -> fastest clear time (seconds)
    mostEaten: 0,         // most objects eaten in one galaxy
    mostBigFish: 0,
    bestStardust: 0       // most stardust from one galaxy
  };
}

export function defaultUpgrades() {
  return { startMass: 0, thrusters: 0, reach: 0, gravity: 0, combo: 0, surge: 0 };
}

export function save(state) {
  try {
    // Once a galaxy is credited (summary showing), save as if already in the
    // next galaxy so a reload can't re-earn the same rewards.
    const credited = !!state.galaxyCredited;
    const inPlay = !state.transitioning || state.transitionPhase === "fadein";
    const data = {
      version: SAVE_VERSION,
      galaxy: credited ? state.galaxy + 1 : state.galaxy,
      bestGalaxy: Math.max(state.bestGalaxy, credited ? state.galaxy + 1 : state.galaxy),
      totalConsumed: state.totalConsumed,
      audioEnabled: state.audioEnabled,
      volume: state.volume,
      stats: state.stats,
      records: state.records,
      stardust: state.stardust,
      upgrades: state.upgrades,
      seenHints: state.seenHints,
      settings: state.settings,
      legacyPending: state.legacyBonusPending || 0,
      run: (!credited && inPlay && state.run) ? {
        galaxy: state.galaxy,
        mass: state.mass,
        time: state.run.time,
        eaten: state.run.eaten,
        bestCombo: state.run.bestCombo,
        bigFish: state.run.bigFish,
        powerups: state.run.powerups,
        bumps: state.run.bumps,
        startBestCombo: state.run.startBestCombo
      } : null
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {}
}

/** Load and migrate. Returns null when there is no save. */
export function load() {
  let raw;
  try {
    const txt = localStorage.getItem(SAVE_KEY);
    if (!txt) return null;
    raw = JSON.parse(txt);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;

  const fromV1 = !raw.version;
  const stats = { ...defaultStats(), ...(raw.stats || {}) };
  const data = {
    version: SAVE_VERSION,
    galaxy: Math.max(1, raw.galaxy | 0 || 1),
    bestGalaxy: Math.max(1, raw.bestGalaxy | 0 || 1, raw.galaxy | 0 || 1),
    totalConsumed: raw.totalConsumed || 0,
    audioEnabled: raw.audioEnabled ?? true,
    volume: raw.volume ?? 0.4,
    stats,
    records: { ...defaultRecords(), ...(raw.records || {}) },
    stardust: raw.stardust || 0,
    upgrades: { ...defaultUpgrades(), ...(raw.upgrades || {}) },
    seenHints: raw.seenHints || {},
    settings: raw.settings || {},
    run: raw.run || null,
    legacyBonus: raw.legacyPending || 0   // only used for the one-time summary note
  };
  data.records.fastest = { ...(data.records.fastest || {}) };

  // Thank-you for galaxies cleared before stardust existed.
  if (fromV1) {
    const cleared = Math.max(stats.galaxiesCleared, data.galaxy - 1);
    data.legacyBonus = Math.min(400, cleared * 20);
    data.stardust += data.legacyBonus;
  }
  return data;
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}
