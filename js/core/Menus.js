// ─── Menus ───
// The journey's screens and records: constellation, star map, logbook, and the
// save backup code (export / check / restore). ui.js calls these through state.

import * as audio from "../audio.js";
import { save, exportCode, parseCode, writeBackup } from "../save.js";
import { getBiome, biomeCatalog } from "../entities.js";
import { wisp } from "../wisp.js";
import { GOALS } from "../ascension.js";
import { fmtTime } from "../progression.js";
import { tierName, tierIndexForR, rForMass } from "../tiers.js";
import { openStarMap } from "../starmap.js";
import { openLogbook } from "../logbook.js";
import { openConstellation } from "../constellation.js";

const $ = id => document.getElementById(id);

const backupLabel = d => `Galaxy ${d.galaxy} · ${tierName(tierIndexForR(rForMass(d.floorMass)))} · ${Math.floor(d.asc.dm || 0)} Dark Matter`;

export class Menus {
  constructor(game, version) {
    this.game = game;
    this.state = game.state;
    const state = this.state;
    state.version = version;
    state.openConstellation = (o = {}) => {
      audio.playClick();
      openConstellation(state.asc, {
        reduceMotion: state.settings.reduceMotion,
        newRun: !!o.newRun,
        onBuy: p => { audio.playGoalStar(3); if (p && p.id === "aw") wisp.unlock(); save(state); },
        onClose: begin => { save(state); if (o.newRun) game.collapse.startNewRun(); }
      });
    };
    state.openStarMap = () => {
      audio.playClick();
      openStarMap(this.starEntries(), { reduceMotion: state.settings.reduceMotion });
    };
    state.openLogbook = () => {
      audio.playClick();
      openLogbook(state.records.discoveries, { goals: this.goalEntries() });
    };
    state.exportSave = () => exportCode(state);
    state.checkBackup = code => {
      const r = parseCode(code);
      if (!r.ok) return r;
      return { ok: true, label: backupLabel(r.data), current: `Galaxy ${state.galaxy} · ${tierName(state.tier)}` };
    };
    state.applyBackup = code => {
      const r = parseCode(code);
      if (!r.ok) return;
      game.lifecycle.resetting = true;           // don't let the unload save overwrite it
      writeBackup(r.json);
      location.reload();
    };
  }

  /** Wire the title-screen buttons. */
  bind() {
    const state = this.state;
    $("btn-title-constellation").addEventListener("click", () => state.openConstellation());
    $("btn-title-starmap").addEventListener("click", () => state.openStarMap());
    $("btn-title-logbook").addEventListener("click", () => state.openLogbook());
  }

  backfillStarLog() {
    const state = this.state;
    const log = state.records.galaxyLog || (state.records.galaxyLog = {});
    const cleared = state.galaxy - 1 + (state.galaxyCredited ? 1 : 0);
    for (let g = 1; g <= cleared; g++) {
      if (log[g]) continue;
      // Cleared before the star map existed: no date, scale estimated from the ladder
      const t = Math.min(state.bestTier || state.tier || 0, Math.round(g * 0.6));
      log[g] = { b: getBiome(g).name, d: 0, t, est: true };
    }
  }

  starEntries() {
    const state = this.state;
    this.backfillStarLog();
    return Object.keys(state.records.galaxyLog).map(Number).filter(g => g >= 1).sort((a, b) => a - b).map(g => {
      const e = state.records.galaxyLog[g];
      const b = biomeCatalog.find(x => x.name === e.b) || getBiome(g);
      const c = b.nebula[0];
      const rgb = c.map(v => Math.round(v + (255 - v) * 0.3)).join(", ");
      const f = state.records.fastest[g];
      return { g, biome: b.name, rgb, date: e.d || 0, tier: e.t || 0, tierName: tierName(e.t || 0), est: !!e.est,
        time: f ? fmtTime(f) : "", breather: !!b.breather };
    });
  }

  goalEntries() {
    const state = this.state;
    const out = {};
    for (const b in GOALS) out[b] = { name: GOALS[b].name, unit: GOALS[b].unit, need: GOALS[b].stars, stars: state.asc.goalStars[b] || 0 };
    return out;
  }
}
