// ─── CollapseFlow ───
// Ascension's collapse: the confirm with its Dark Matter breakdown, the
// singularity moment, then (after the constellation) the reborn run.

import * as audio from "../audio.js";
import * as ui from "../ui.js";
import { save } from "../save.js";
import { ascMods, freshAscRun, dmFor, rollSupernova, milestonesAt } from "../ascension.js";
import { START_R, massForR, tierName } from "../tiers.js";

const $ = id => document.getElementById(id);

export class CollapseFlow {
  constructor(game) {
    this.game = game;
    this.state = game.state;
  }

  bind() {
    $("btn-collapse-no").addEventListener("click", () => { audio.playClick(); $("collapse").classList.add("hidden"); });
    $("btn-collapse-yes").addEventListener("click", () => { audio.playClick(); this.doCollapse(); });
  }

  /** The confirm, with a clear breakdown. */
  open() {
    const state = this.state;
    const r = state.asc.run;
    const dm = dmFor(r, state.ascMods || ascMods(state.asc));
    $("collapse-sub").textContent = `This run: ${r.cleared} galax${r.cleared === 1 ? "y" : "ies"} deep, up to ${tierName(r.peakTier || 0)}`;
    $("collapse-break").innerHTML = dm.parts.map(([k, v]) => `<span><i>${k}</i><b>+${v}</b></span>`).join("") +
      `<span class="tot"><i>Dark Matter</i><b>+${dm.total}</b></span>`;
    const next = milestonesAt((state.asc.collapses || 0) + 1);
    $("collapse-mile").innerHTML = next.length
      ? `Collapse ${(state.asc.collapses || 0) + 1} also unlocks: ` + next.map(m => `<b>${m.name}</b> (${m.desc})`).join(", ")
      : "";
    $("collapse").classList.remove("hidden");
  }

  doCollapse() {
    const state = this.state, game = this.game;
    const a = state.asc, r = a.run;
    const mods = state.ascMods || ascMods(a);
    const dm = dmFor(r, mods).total;
    a.dm = (a.dm || 0) + dm;
    a.dmTotal = (a.dmTotal || 0) + dm;
    a.collapses = (a.collapses || 0) + 1;
    a.history.push({ n: a.collapses, depth: r.cleared, dm, min: Math.round((r.time || 0) / 60), d: Date.now() });
    const unlocked = milestonesAt(a.collapses);
    // Everything in the run resets: reborn as dust at Galaxy 1
    state.floorMass = massForR(START_R);
    state.galaxy = 1;
    a.run = freshAscRun();
    a.run.supernova = rollSupernova(a, ascMods(a));
    a.runsStarted = (a.runsStarted || 1) + 1;
    state.galaxyCredited = false;
    state.transitioning = false;
    state.transitionPhase = "";
    state.paused = false;
    ["collapse", "pause-menu", "collapse-pill"].forEach(id => $(id).classList.add("hidden"));
    ui.closeStats?.();
    game.input.setEnabled(false);
    state.screen = "collapse";
    save(state);
    audio.stopDrone();
    audio.playCollapse();
    const sing = $("singularity");
    $("sing-title").textContent = `Collapse ${a.collapses}`;
    $("sing-line").textContent = `+${dm} Dark Matter · ${Math.floor(a.dm)} to spend`;
    $("sing-mile").innerHTML = unlocked.map(m => `Unlocked: <b>${m.name}</b>. ${m.desc}`).join("<br>");
    sing.style.opacity = "1";
    sing.classList.remove("hidden");
    let gone = false;
    const next = () => {
      if (gone) return; gone = true;
      sing.style.opacity = "0";
      setTimeout(() => { sing.classList.add("hidden"); state.openConstellation({ newRun: true }); }, 1400);
    };
    sing.onclick = () => { if (performance.now() - t0c > 1500) next(); };
    const t0c = performance.now();
    setTimeout(next, unlocked.length ? 7000 : 5200);
  }

  // v9: after the constellation, the rebirth: the same newborn sequence as the
  // very first beginning (void, a few lines, the birth), then play.
  startNewRun() {
    const state = this.state, game = this.game;
    game.galaxy.init(state.galaxy);
    save(state);
    const a = state.asc;
    game.screens.showIntro({ kind: "reborn", lines: [`Collapse ${a.collapses}.`, a.run.supernova ? "A supernova." : "Reborn.", "Grow."] });
  }
}
