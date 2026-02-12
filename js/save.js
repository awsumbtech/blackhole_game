// ─── SAVE SYSTEM ───
// localStorage persistence, stats tracking

const SAVE_KEY = "blackhole_galaxy_v3";

export function save(state) {
  try {
    const data = {
      galaxy: state.galaxy,
      bestGalaxy: state.bestGalaxy,
      totalConsumed: state.totalConsumed,
      audioEnabled: state.audioEnabled,
      volume: state.volume,
      stats: state.stats
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {}
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}

export function defaultStats() {
  return {
    totalConsumed: 0,
    galaxiesCleared: 0,
    highestMass: 0,
    bestCombo: 0,
    timePlayed: 0
  };
}
