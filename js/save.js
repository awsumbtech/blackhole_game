// ─── SAVE SYSTEM ───
// localStorage persistence, stats, records, upgrades and mid-galaxy progress.
// v2 keeps the original key so existing v1 saves load and migrate in place.

const SAVE_KEY = "blackhole_galaxy_v3";
export const SAVE_VERSION = 5;
import { floorMassForLegacyGalaxy } from "./tiers.js";

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
    bestStardust: 0,      // most stardust from one galaxy
    galaxyLog: {}         // v5.2: galaxy number -> { b: biome, d: date, t: tier, est? } for the star map
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
      lastActive: Date.now(),
      floorMass: state.floorMass,
      bestTier: state.bestTier || 0,
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
  return normalize(raw);
}

function normalize(raw) {
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
    legacyBonus: raw.legacyPending || 0,  // only used for the one-time summary note
    lastActive: raw.lastActive || 0,
    // v5: your size carries over between galaxies. Older saves start at a
    // tier that matches how far they'd got; a half-played galaxy restarts.
    floorMass: raw.floorMass > 0 ? raw.floorMass : floorMassForLegacyGalaxy(Math.max(1, raw.galaxy | 0 || 1)),
    bestTier: raw.bestTier || 0
  };
  if ((raw.version || 1) < 5) data.run = null;
  data.records.fastest = { ...(data.records.fastest || {}) };
  data.records.galaxyLog = { ...(data.records.galaxyLog || {}) };

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

// ─── SAVE BACKUP (v5.2) ───
// A backup code is "BHSAVE1." + base64(JSON) + "." + checksum, so a pasted
// code that got cut off or mangled is caught before it can replace anything.
const CODE_PREFIX = "BHSAVE1.";

function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}
function toB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function fromB64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Save now, then return the backup code for the current journey. */
export function exportCode(state) {
  save(state);
  const json = localStorage.getItem(SAVE_KEY) || "{}";
  return CODE_PREFIX + toB64(json) + "." + fnv(json);
}

/** Check a pasted/loaded code. Returns { ok, data, json } or { ok: false, err }. */
export function parseCode(code) {
  const c = String(code || "").replace(/\s+/g, "");
  if (!c) return { ok: false, err: "Paste a backup code or load a backup file first." };
  if (!c.startsWith(CODE_PREFIX)) return { ok: false, err: "That doesn't look like a Black Hole backup code." };
  const body = c.slice(CODE_PREFIX.length);
  const dot = body.lastIndexOf(".");
  if (dot < 1) return { ok: false, err: "The code looks cut off. Copy the whole thing." };
  let json;
  try { json = fromB64(body.slice(0, dot)); } catch { return { ok: false, err: "The code looks damaged. Copy the whole thing." }; }
  if (fnv(json) !== body.slice(dot + 1)) return { ok: false, err: "The code doesn't check out (part of it may be missing)." };
  let raw;
  try { raw = JSON.parse(json); } catch { return { ok: false, err: "The code looks damaged." }; }
  if (!raw || typeof raw !== "object" || !(raw.galaxy >= 1 && raw.galaxy < 100000)) return { ok: false, err: "That backup has no journey in it." };
  if ((raw.version || 1) > SAVE_VERSION) return { ok: false, err: "That backup is from a newer version of the game. Update first." };
  const data = normalize(raw);
  if (!data) return { ok: false, err: "That backup has no journey in it." };
  return { ok: true, data, json };
}

/** Replace the stored save with a checked backup (caller reloads). */
export function writeBackup(json) {
  localStorage.setItem(SAVE_KEY, json);
}
