// ─── SAVE SYSTEM ───
// localStorage persistence, stats, records and mid-galaxy progress.
// v2 keeps the original key so existing v1 saves load and migrate in place.

const SAVE_KEY = "blackhole_galaxy_v3";
export const SAVE_VERSION = 9;   // v7: asc (Ascension). v8: no stardust or shop (refunded as Dark Matter). v9: wisp is an unlock (Companion)
import { normalizeAsc } from "./ascension.js";
import { floorMassForLegacyGalaxy } from "./tiers.js";

export function defaultStats() {
  return {
    totalConsumed: 0,
    galaxiesCleared: 0,
    highestMass: 0,
    bestCombo: 0,
    timePlayed: 0,        // seconds
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
    galaxyLog: {},        // v5.2: galaxy number -> { b: biome, d: date, t: tier, est? } for the star map
    discoveries: {}       // v6: discovery id -> { g: galaxy first found, d: date, n: times found }
  };
}

// ─── v8 migration: the stardust shop is gone ───
// Everything a save had in stardust (unspent, plus what its upgrade levels
// cost) comes back as Dark Matter at 25 stardust each. Galaxy perks (3-star
// rewards) were folded into constellation nodes; each one owned gives 8 DM.
const OLD_COSTS = [25, 50, 85, 130, 190];
const OLD_MULT = { startMass: 1.2, thrusters: 1, reach: 1.3, gravity: 1, combo: 1, surge: 1 };
export const STARDUST_PER_DM = 25;
export const GALAXY_PERK_DM = 8;
export function stardustRefund(raw) {
  let spent = 0;
  const u = raw.upgrades || {};
  for (const k in OLD_MULT) {
    const lvl = Math.max(0, Math.min(5, Number(u[k]) | 0));
    for (let l = 0; l < lvl; l++) spent += Math.round(OLD_COSTS[l] * OLD_MULT[k]);
  }
  const unspent = Math.max(0, Math.floor(Number(raw.stardust) || 0));
  const gperks = Object.keys((raw.asc && raw.asc.perks) || {}).filter(id => id.startsWith("g_") && raw.asc.perks[id]).length;
  const dm = Math.round((spent + unspent) / STARDUST_PER_DM) + gperks * GALAXY_PERK_DM;
  return { dm, spent, unspent, gperks };
}

// v9.3: the dev sandbox suspends every write to the real save (DevMode owns this).
let suspended = false;
export function setSaveSuspended(on) { suspended = !!on; }
export function isSaveSuspended() { return suspended; }
export const SAVE_STORAGE_KEY = SAVE_KEY;

export function save(state) {
  if (suspended) return;
  // v7: a Zen session never touches your journey; it was saved before the session began
  if (state.mode === "zen") return;
  try {
    // Once a galaxy is credited (flowing into the next), save as if already in the
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
      seenHints: state.seenHints,
      settings: state.settings,
      lastActive: Date.now(),
      floorMass: state.floorMass,
      bestTier: state.bestTier || 0,
      asc: state.asc,
      zenNotes: state.zenNotes || [],
      run: (!credited && inPlay && state.run) ? {
        galaxy: state.galaxy,
        mass: state.mass,
        time: state.run.time,
        eaten: state.run.eaten,
        bestCombo: state.run.bestCombo,
        bigFish: state.run.bigFish,
        powerups: state.run.powerups,
        bumps: state.run.bumps,
        startBestCombo: state.run.startBestCombo,
        goalCount: state.goalCount || 0
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
    seenHints: raw.seenHints || {},
    settings: raw.settings || {},
    run: raw.run || null,
    lastActive: raw.lastActive || 0,
    // v5: your size carries over between galaxies. Older saves start at a
    // tier that matches how far they'd got; a half-played galaxy restarts.
    floorMass: raw.floorMass > 0 ? raw.floorMass : floorMassForLegacyGalaxy(Math.max(1, raw.galaxy | 0 || 1)),
    bestTier: raw.bestTier || 0,
    // v7 migration: older saves get a fresh Ascension block; the journey carries on as the current run
    asc: normalizeAsc(raw.asc),
    zenNotes: Array.isArray(raw.zenNotes) ? raw.zenNotes.slice(-20) : [],
    v7Welcome: (raw.version || 1) < 7 && !raw.asc
  };
  if ((raw.version || 1) < 5) data.run = null;
  data.records.fastest = { ...(data.records.fastest || {}) };
  data.records.galaxyLog = { ...(data.records.galaxyLog || {}) };
  // v6 migration: older saves have no logbook yet; start it empty
  const disc = data.records.discoveries;
  data.records.discoveries = disc && typeof disc === "object" && !Array.isArray(disc) ? { ...disc } : {};

  // v1 saves got a thank-you for galaxies cleared before stardust existed;
  // it becomes part of the refund below.
  const sd = { stardust: Number(raw.stardust) || 0, upgrades: raw.upgrades, asc: raw.asc };
  if (fromV1) sd.stardust += Math.min(400, Math.max(stats.galaxiesCleared, data.galaxy - 1) * 20);

  // v8: stardust and the shop are gone. Refund them (and folded galaxy perks) as Dark Matter.
  if ((raw.version || 1) < 8) {
    const r = stardustRefund(sd);
    for (const id of Object.keys(data.asc.perks)) if (id.startsWith("g_")) delete data.asc.perks[id];
    if (r.dm > 0) {
      data.asc.dm = (data.asc.dm || 0) + r.dm;
      data.asc.dmTotal = (data.asc.dmTotal || 0) + r.dm;
    }
    data.v9Refund = r;
  }
  // v9 (game v9.2): the wisp is the Companion perk. Anyone who has collapsed, or
  // owned Hungry Wisp, already earned it: grant it free so nobody is stranded.
  if ((raw.version || 1) < 9 && ((data.asc.collapses || 0) > 0 || data.asc.perks.a2)) {
    data.asc.perks.aw = true;
    data.v92Companion = true;
  }
  return data;
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
  if (suspended) return;
  localStorage.setItem(SAVE_KEY, json);
}
