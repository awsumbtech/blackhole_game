// ─── GameState ───
// The one plain state object every system reads and writes (save.js persists part of it).
// Systems add fields as they need them (goal, zen, depth...) and ui.js / worlds.js read
// a few callbacks hung on it (setSetting, openStarMap, onEventWarn...).

import { defaultStats, defaultRecords } from "../save.js";
import { defaultAsc } from "../ascension.js";
import { baseMods } from "../progression.js";
import { freshActive } from "../powerups.js";

export function createState() {
  return {
    galaxy: 1,
    bestGalaxy: 1,

    mass: 20,
    radius: 8,
    playerX: 0, playerY: 0, playerVX: 0, playerVY: 0,

    // Camera (zoom shrinks as you grow so the hole stays a sensible size on screen)
    camX: 0, camY: 0, zoom: 1, viewW: 800, viewH: 600, speedScale: 1,
    bgX: 0, bgY: 0,

    entities: [], bounds: Infinity, baseBounds: 800, biome: null, initialCount: 0,
    targetMass: 15000, startMass: 20,
    // v5 "Vast": the scale ladder. floorMass = where this galaxy started
    // (the most you reached in the last one). anchor = the size the camera is framed on.
    floorMass: 20, tier: 0, bestTier: 0, galaxyProgress: 0,
    anchorR: 8, anchorSmooth: 8, reveal: null, tierBanner: null, trail: [], trailT: 0,

    particles: [], ripples: [], floaters: [], gulp: 0,

    comboCount: 0, comboTimer: 0,

    transitioning: false, transitionPhase: "", transitionTimer: 0,
    galaxyCredited: false, collapseNudge: false,

    paused: false, menuOpen: false, birth: 0,
    audioEnabled: true, volume: 0.4,

    totalConsumed: 0,
    stats: defaultStats(),
    records: defaultRecords(),
    seenHints: {},
    // Zen is on by default: no clock/par, bumps cost nothing
    mode: "ascension", asc: defaultAsc(), zenNotes: [], densityK: 1, breathPull: 1, rivals: [],
    settings: { touchMode: "joystick", skin: "classic", musicVol: 0.6, sfxVol: 0.6, musicOn: true, sfxOn: true, zenBreathCue: false, reduceMotion: false, softPalette: false, breathGuide: false, quality: "auto", wispName: "Wisp" },

    // v4 screens: "play" | "title" | "intro"; camMul zooms the camera (title close-up)
    screen: "play", camMul: 1, drift: null,

    mods: baseMods(),
    eatRatio: 0.88,
    run: null,
    active: freshActive(), activeMax: freshActive(),
    invuln: 0,
    nearGoalPlayed: false
  };
}
