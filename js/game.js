// ─── GAME MAIN ───
// Boot only: builds the systems around one state object, restores the save and
// starts the loop. Each system lives in js/core/ (map in DESIGN.md §7e). Systems
// reach each other through `game`, the composition root built here.

import { createInput } from "./input.js";
import * as audio from "./audio.js";
import { save, setSaveSuspended, SAVE_STORAGE_KEY } from "./save.js";
import { getBiome, biomeCatalog } from "./entities.js";
import { onWorldEvent, onWorldTier, worldsInfo, worldsFeature } from "./worlds.js";
import { layersInfo } from "./depth.js";
import { artStats } from "./art.js";
import { discoveriesInfo } from "./discoveries.js";
import { wisp, resetWisp, wispInfo, wispReact } from "./wisp.js";
import { fireEvent, activeEventInfo, EVENT_INFO, densityInfo } from "./living-world.js";
import { tierName, massForR, rForTier, TIERS } from "./tiers.js";
import {
  Camera, Fx, GalaxyFlow, Growth, DevMode, Inflow, Backdrop, AccretionRing, Absorption, GoldenVeil,
  createState, Display, Hud, Player, Feeding, MEATY, RunTracker, Galaxy, PerfMonitor, Settings,
  ScreenFlow, ZenSession, CollapseFlow, PlayControls, Menus, Lifecycle, ScreenOverlay, Scene, GameLoop
} from "./core/index.js";

const $ = id => document.getElementById(id);
const VERSION = "9.7";

const display = new Display($("game"), $("game-container"));
const state = createState();
const input = createInput(display.canvas);

// ─── SYSTEMS (stable surfaces; upgrade / swap one at a time) ───
const camera = new Camera(state);
const fx = new Fx(state);
const inflow = new Inflow();   // v9.5 impact bloom only; the permanent cloud is gone (v9.7)
const backdrop = new Backdrop();
const golden = new GoldenVeil();
const ring = new AccretionRing();
const absorption = new Absorption(state);
/** v9.5 impact: the radial bloom and the low swell land on the same frame. */
function impact(strength) {
  if (state.mode === "zen") strength *= 0.5;   // Zen: half-strength burst and swell (Brian)
  inflow.burst(strength);
  audio.playSwell(strength);
}

const game = {
  state, display, input, audio, camera, fx, inflow, impact, backdrop, golden, ring, absorption,
  dev: null,
  zoomTarget: () => camera.zoomTarget(display.w, display.h),
  updateCameraScale: (snap = false) => camera.updateScale(display.w, display.h, snap),
};
game.growth = new Growth(state, {
  camera,
  audio,
  hint: (k, m, ms) => game.hud.hint(k, m, ms),
  onWorldTier,
  onGrowth: (t, merged) => { impact(1); wispReact(state, merged ? "merge" : "tier"); },   // v9.2 Growth Witness, v9.5 impact
  screenW: () => display.w,
  screenH: () => display.h
});
game.galaxyFlow = new GalaxyFlow(state, {
  audio,
  hint: (k, m, ms) => game.hud.hint(k, m, ms),
  save,
  onAscensionClear: () => game.run.onAscensionClear(),
  initGalaxy: (n, r, f) => game.galaxy.init(n, r, f)
});
game.hud = new Hud(game);
game.player = new Player(game);
game.feeding = new Feeding(game);
game.run = new RunTracker(game);
game.galaxy = new Galaxy(game);
game.perf = new PerfMonitor(game);
game.settings = new Settings(game);
game.screens = new ScreenFlow(game);
game.zen = new ZenSession(game);
game.collapse = new CollapseFlow(game);
game.menus = new Menus(game, VERSION);
game.overlay = new ScreenOverlay(game);
game.controls = new PlayControls(game);
game.lifecycle = new Lifecycle(game);
game.scene = new Scene(game);
game.loop = new GameLoop(game);

state.onEventStart = id => onWorldEvent(state, id);
state.onPowerupEnd = () => {};   // power-ups fade out over their last 3 seconds, so no end sound is needed

game.screens.bind();
game.menus.bind();
game.collapse.bind();
game.zen.bind();
game.controls.bind();
game.lifecycle.bind();

// ─── INIT ───
DevMode.recover(SAVE_STORAGE_KEY);   // v9.3: a sandbox that never exited puts the real save back first
const { savedData, resumeRun } = game.lifecycle.restore();
game.settings.apply();
game.settings.applyQuality(state.settings.quality === "balanced" ? "balanced" : "high");
audio.setVolume(state.volume);
audio.setEnabled(state.audioEnabled);
game.lifecycle.unlockAudioOnGesture();
game.galaxy.init(state.galaxy, resumeRun);
game.screens.firstScreen(savedData, resumeRun);
save(state);

// ─── v9.3: DEV MODE (hidden play-test sandbox; see js/core/DevMode.js) ───
const dev = game.dev = new DevMode({
  saveKey: SAVE_STORAGE_KEY, setSaveSuspended,
  biomes: biomeCatalog.map(b => b.name),
  tiers: TIERS.map(t => t.name),
  events: Object.keys(EVENT_INFO).map(id => ({ id, name: EVENT_INFO[id].name })),
  biomeFor: g => getBiome(g).name,
  current: () => ({ wisp: !!(state.asc.perks && state.asc.perks.aw) }),
  start: c => game.screens.devStart(c),
  fireEvent: id => { if (state.screen === "play") fireEvent(state, id); },
  bigBurst: () => { if (state.screen === "play") impact(0.6); },
  tierUp: () => { if (state.screen !== "play") return; state.mass = massForR(rForTier(state.tier + 1) * 1.03); game.player.updateRadius(); },
  setWisp: on => { state.asc.perks.aw = on; wisp.syncFromAsc(state.asc); resetWisp(state); },
  collapse: () => { if (state.screen === "play") game.collapse.open(); },
  perf: () => game.perf.report(),
  hint: t => game.hud.show(t, 4200),
  reloadToTitle: () => game.lifecycle.reloadToTitle()
});
state.onVersionTap = () => dev.tapVersion();

game.loop.start();

// Developer hook for the automated tests. Only exists on a local dev server
// or with ?debug in the URL, never for normal play.
const DEV = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || new URLSearchParams(location.search).has("debug");
if (DEV) window.__bh = { meaty: MEATY,
  state, input, fireEvent: id => fireEvent(state, id), events: activeEventInfo,
  perf: () => game.perf.report(), layers: () => layersInfo(state), worlds: worldsInfo, resetPerf: () => game.perf.reset(), art: artStats, wisp: wispInfo, openLogbook: () => state.openLogbook(), finds: () => discoveriesInfo(state),
  density: densityInfo, music: audio.musicInfo, phrase: audio.phraseInfo, feature: () => worldsFeature(state),
  camera, growth: game.growth, galaxyFlow: game.galaxyFlow, fx, dev, inflow, impact, backdrop, golden, ring, absorption,
  scene: game.scene,
  feeding: game.feeding,
  worldTier: () => onWorldTier(state),
  tier: () => ({ tier: state.tier, name: tierName(state.tier), R: state.radius, anchor: state.anchorSmooth, zoom: state.zoom,
    reveal: state.reveal ? +state.reveal.p.toFixed(2) : null, floor: state.floorMass, target: state.targetMass, progress: state.galaxyProgress }),
  // test helper: grow to just under the next tier line
  nearNextTier: (k = 0.985) => { const r = rForTier(state.tier + 1) * k; state.mass = massForR(r); game.player.updateRadius(); }
};
