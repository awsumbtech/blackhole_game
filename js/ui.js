import { MECHANICS } from "./worlds.js";
import { tierName } from "./tiers.js";
// ─── UI ───
// Stats view, settings, codex, power-up timers. (v9: no summary or shop.)

import { fmtTime, fmtMass } from "./progression.js";
import { POWERUPS, POWERUP_KINDS } from "./powerups.js";
import { EVENT_INFO } from "./living-world.js";
import { biomeCatalog } from "./entities.js";
import { SKINS, hasMilestone, PERKS } from "./ascension.js";

const $ = id => document.getElementById(id);

function skinRow(state) {
  const have = SKINS.filter(k => !k.unlock || hasMilestone(state.asc, k.unlock));
  if (have.length < 2) return "";
  const cur = state.settings.skin || "classic";
  return `<div class="set-row"><div><b>Hole skin</b><small>Unlocked by collapses</small></div><div class="seg" data-set="skin">${have.map(k => `<button data-val="${k.id}" class="${k.id === cur ? "on" : ""}">${k.name}</button>`).join("")}</div></div>`;
}

// v6 codex entries for the new gentle things
const V6_CODEX = [
  ["255, 214, 140", "Golden halo", "A soft gold glow around something big means you're nearly its size. When the halo turns steady, it fits: drift in for a slow, satisfying big catch."],
  ["255, 240, 200", "Shimmer (discovery)", "Rare finds hide in every galaxy: a golden comet, a lost probe, a whale-shaped nebula. A faint glow at the screen edge (and your wisp leaning that way, once it's with you) means one is near. Drift into it to write it in your logbook."],
  ["150, 235, 215", "Your companion wisp", "Light Companion on the constellation after your first collapse and a little wisp joins you for good. It witnesses your growth: when you grow into a new scale it glows, widens its orbit, and points once toward food your new size. It twirls after a big catch or a find, rests in breather galaxies, and in Zen breathes beside you (in for 4, out for 6). Rename it in Settings."],
  ["200, 210, 255", "A new star", "When you outgrow a galaxy, its star quietly joins your sky and the next galaxy opens around you. Your star map is in the pause menu and on the title screen."],
  ["170, 140, 240", "Ascension and collapse", "Each run starts from dust at Galaxy 1 and every galaxy deeper is a little bigger, sparser and slower. When growth slows, a soft prompt offers a Collapse (also in the pause menu, from depth 3): the run becomes Dark Matter, you choose perks, and you're reborn stronger."],
  ["210, 190, 255", "Dark Matter and the constellation", "Dark Matter is the only thing that carries over. It lights permanent perks on the constellation: Reach, Appetite and Fortune. Each tier opens the next; forks are a choice. Collapsing deeper earns much more."],
  ["170, 140, 240", "Rival holes", "From Galaxy 3 of a run, calm rival black holes drift about eating food. Bumping a bigger one just eases you aside. Grow past one and it turns gold: swallow it."],
  ["255, 228, 170", "Galaxy goals", "Each galaxy type has its own goal (graze the reefs, ride the current, feed in the beams...). Optional, up to 3 stars. Each new best star gives a little Dark Matter and is written in your logbook."],
  ["255, 210, 120", "Golden galaxies and supernova runs", "After your first collapse, a galaxy now and then shines gold (+5 Dark Matter). Later, some runs begin as a supernova: every bite counts 50% more. Rare finds can shine too (+3 Dark Matter)."],
  ["160, 235, 215", "Zen sessions", "A separate calm space for 3, 5 or 10 minutes: settle, flow, wind down. The pull follows your breath. It ends with three slow breaths and a gentle send-off. Nothing is kept or counted."]
].map(([rgb, name, text]) => `<div class="codex-item"><b><i class="dot" style="background:rgb(${rgb})"></i>${name}</b><p>${text}</p></div>`).join("");

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// ─── STATS ───

export function showStats(state, onClose, opts = {}) {
  const s = state.stats;
  const r = state.records;
  const row = (k, v) => `<div class="stat-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
  const fastest = Object.entries(r.fastest)
    .map(([g, t]) => [Number(g), t])
    .sort((a, b) => b[0] - a[0])
    .slice(0, 10);
  const a = state.asc || {};
  const lit = PERKS.filter(p => a.perks && a.perks[p.id]).length;

  const seg = (key, opts) => `<span class="seg" data-set="${key}">${opts.map(([v, label]) =>
    `<button data-val="${v}" class="${String(state.settings[key]) === String(v) ? "on" : ""}">${esc(label)}</button>`).join("")}</span>`;
  const onOff = key => seg(key, [[true, "On"], [false, "Off"]]);
  const setRow = (label, sub, control) => `<div class="set-row"><span>${esc(label)}<small>${esc(sub)}</small></span>${control}</div>`;
  const evItems = Object.entries(EVENT_INFO).map(([id, info]) => {
    const seen = state.seenHints["ev_" + id];
    return `<div class="codex-item${seen ? "" : " unseen"}"><b><i class="dot" style="background:rgb(${info.rgb})"></i>${seen ? esc(info.name) : "???"}</b>
      <p>${seen ? esc(info.codex) : "Not seen yet. Keep drifting."}</p></div>`;
  }).join("");
  const biomeItems = biomeCatalog.map(b => {
    const seen = state.seenHints["biome_" + b.name];
    return `<div class="codex-item${seen ? "" : " unseen"}"><b><i class="dot" style="background:${b.borderColor}"></i>${seen ? esc(b.name) : "???"}</b>
      <p>${seen ? esc(b.codex) : "Not visited yet."}</p>
      ${seen && MECHANICS[b.name] ? `<p class="mech"><b>${esc(MECHANICS[b.name].name)}.</b> ${esc(MECHANICS[b.name].codex)}</p>` : ""}</div>`;
  }).join("");

  const settingsHtml = `
    <div class="stats-section"><h3>Settings</h3>
      ${skinRow(state)}
      ${setRow("Music", "Soft surf and slow notes", `<input type="range" class="mix-slider" data-mix="musicVol" min="0" max="100" value="${Math.round((state.settings.musicVol ?? 0.6) * 100)}" aria-label="Music volume">` + onOff("musicOn"))}
      ${setRow("Sound effects", "Bites and chimes", `<input type="range" class="mix-slider" data-mix="sfxVol" min="0" max="100" value="${Math.round((state.settings.sfxVol ?? 0.6) * 100)}" aria-label="Effects volume">` + onOff("sfxOn"))}
      ${setRow("Breathing guide", "A faint ring that grows as you breathe in (4s in, 6s out). In Zen your companion wisp breathes instead, once it's with you", onOff("breathGuide"))}
      ${setRow("Zen breath words", "Faint 'breathe in / out' words in Zen sessions", onOff("zenBreathCue"))}
      ${setRow("Soft palette", "Muted colours, amber rings instead of rose", onOff("softPalette"))}
      ${setRow("Reduce motion", "No screen shake, fewer particles", onOff("reduceMotion"))}
      ${setRow("Touch controls", "Thumbstick, or drift toward your finger", seg("touchMode", [["joystick", "Joystick"], ["follow", "Follow"]]))}
      ${setRow("Visual quality", "Auto lowers detail if your phone needs it", seg("quality", [["auto", "Auto"], ["high", "High"], ["balanced", "Lite"]]))}
      ${state.asc && state.asc.perks && state.asc.perks.aw ? setRow("Companion name", "The little wisp that drifts with you", `<input id="set-wisp-name" class="name-input" maxlength="16" value="${esc(state.settings.wispName || "Wisp")}" aria-label="Companion name">`) : ""}
    </div>
    <div class="stats-section"><h3>Save backup</h3>
      <div class="backup">
        <small>Keep a copy of your journey, or move it to another phone or browser.</small>
        <div class="btns">
          <button id="btn-export" class="soft-btn">Export save</button>
          <button id="btn-import" class="soft-btn">Import save</button>
        </div>
        <textarea id="backup-code" class="hidden" spellcheck="false" aria-label="Backup code"></textarea>
        <div id="import-tools" class="btns hidden">
          <label class="soft-btn">Load file<input id="backup-file" type="file" accept=".txt,text/plain" hidden></label>
          <button id="btn-import-check" class="soft-btn">Check code</button>
        </div>
        <div id="import-confirm" class="btns hidden">
          <button id="btn-import-yes" class="soft-btn">Replace my journey</button>
          <button id="btn-import-no" class="soft-btn">Cancel</button>
        </div>
        <div id="backup-msg" class="msg" aria-live="polite"></div>
      </div>
      <div class="app-version">Black Hole: Galaxy Eater v${esc(state.version || "")}</div>
    </div>`;
  $("stats-title").textContent = opts.settingsOnly ? "Settings" : "Stats & Records";
  $("btn-stats-close").textContent = opts.settingsOnly ? "Done" : "Back to the void";
  $("stats-body").innerHTML = opts.settingsOnly ? settingsHtml : `<button id="btn-stats-starmap" class="soft-btn stats-link">Open the star map</button><button id="btn-stats-logbook" class="soft-btn stats-link">Open the logbook</button>` + settingsHtml + `
    <div class="stats-section"><h3>What's that? (events)</h3>${evItems}${V6_CODEX}</div>
    <div class="stats-section"><h3>Galaxies</h3>${biomeItems}</div>
    <div class="stats-section"><h3>Progress</h3>
      ${row("Current galaxy", state.galaxy)}
      ${row("Highest galaxy", state.bestGalaxy)}
      ${row("Scale now", tierName(state.tier || 0))}
      ${row("Largest scale reached", tierName(state.bestTier || 0))}
      ${row("Wider views (tier reveals)", s.tierReveals || 0)}
      ${row("Galaxies cleared", s.galaxiesCleared)}
      ${row("Time played", fmtTime(s.timePlayed))}
    </div>
    <div class="stats-section"><h3>Records</h3>
      ${row("Best combo", "×" + s.bestCombo)}
      ${row("Most eaten in a galaxy", r.mostEaten)}
      ${row("Highest mass", fmtMass(s.highestMass))}
      ${row("Objects eaten (all time)", s.totalConsumed.toLocaleString())}
      ${row("Big catches (all time)", s.bigFishEaten)}
      ${row("Power-ups collected", s.powerupsCollected)}
    </div>
    <div class="stats-section"><h3>Fastest clears</h3>
      ${fastest.length ? fastest.map(([g, t]) => row(`Galaxy ${g}`, fmtTime(t))).join("") : '<div class="stat-empty">Clear a galaxy to set a time.</div>'}
    </div>
    <div class="stats-section"><h3>Ascension</h3>
      ${row("Dark Matter", `${Math.floor(a.dm || 0)} (earned ${Math.floor(a.dmTotal || 0)})`)}
      ${row("Perks lit", `${lit} / ${PERKS.length}`)}
      ${row("Collapses", a.collapses || 0)}
      ${row("Run depth now", (a.run && a.run.cleared) || 0)}
      ${row("Deepest run", a.bestDepth || 0)}
    </div>`;
  $("stats-body").querySelectorAll(".seg[data-set]").forEach(segEl => {
    segEl.querySelectorAll("button").forEach(b => {
      b.addEventListener("click", () => {
        const raw = b.dataset.val;
        const val = raw === "true" ? true : raw === "false" ? false : raw;
        state.setSetting?.(segEl.dataset.set, val);
        segEl.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
      });
    });
  });

  $("stats-body").querySelectorAll(".mix-slider").forEach(el => {
    el.addEventListener("change", () => state.setSetting?.(el.dataset.mix, Number(el.value) / 100));
  });
  bindBackup(state);
  const nameEl = $("set-wisp-name");
  nameEl?.addEventListener("change", () => {
    const v = nameEl.value.replace(/[^\p{L}\p{N} '\-]/gu, "").trim().slice(0, 16) || "Wisp";
    nameEl.value = v;
    state.setSetting?.("wispName", v);
  });
  $("btn-stats-starmap")?.addEventListener("click", () => state.openStarMap?.());
  $("btn-stats-logbook")?.addEventListener("click", () => state.openLogbook?.());

  const el = $("stats");
  el.classList.remove("hidden");
  $("btn-stats-close").onclick = () => { el.classList.add("hidden"); onClose(); };
}

export function isStatsOpen() {
  return !$("stats").classList.contains("hidden");
}

export function closeStats() {
  $("btn-stats-close").click();
}

// ─── POWER-UP TIMERS ───

const pills = {};

export function updatePowerupBar(state) {
  const bar = $("powerup-bar");
  for (const k of POWERUP_KINDS) {
    const left = state.active[k];
    let pill = pills[k];
    if (left > 0) {
      if (!pill) {
        pill = document.createElement("div");
        pill.className = "pu-pill";
        pill.style.setProperty("--pu", POWERUPS[k].color);
        pill.innerHTML = `<span class="pu-name">${POWERUPS[k].label}</span><span class="pu-secs"></span><div class="pu-track"><div class="pu-fill"></div></div>`;
        bar.appendChild(pill);
        pills[k] = pill;
      }
      const frac = Math.max(0, left / (state.activeMax[k] || 1));
      pill.querySelector(".pu-fill").style.width = (frac * 100).toFixed(1) + "%";
      pill.querySelector(".pu-secs").textContent = Math.ceil(left / 60) + "s";
      pill.classList.toggle("ending", left < 180);
    } else if (pill) {
      pill.remove();
      delete pills[k];
    }
  }
}

// ─── v5.2: save backup (export / import with a check and a confirmation) ───
function bindBackup(state) {
  const code = $("backup-code"), msg = $("backup-msg"), tools = $("import-tools"), confirmEl = $("import-confirm");
  const say = (t, err = false) => { msg.textContent = t; msg.classList.toggle("err", err); };
  let pending = null;
  $("btn-export").onclick = async () => {
    const c = state.exportSave();
    code.value = c;
    code.readOnly = true;
    code.classList.remove("hidden");
    tools.classList.add("hidden"); confirmEl.classList.add("hidden");
    let copied = false;
    try { await navigator.clipboard.writeText(c); copied = true; } catch {}
    try {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([c], { type: "text/plain" }));
      a.download = `blackhole-save-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch {}
    say(copied ? "Copied, and saved as a file. Keep it somewhere safe." : "Saved as a file. You can also copy the code above.");
  };
  $("btn-import").onclick = () => {
    code.value = ""; code.readOnly = false;
    code.classList.remove("hidden"); tools.classList.remove("hidden"); confirmEl.classList.add("hidden");
    code.focus();
    say("Paste a backup code, or load a backup file.");
  };
  $("backup-file").onchange = async ev => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    code.value = (await f.text()).slice(0, 200000);
    check();
  };
  const check = () => {
    const r = state.checkBackup(code.value);
    if (!r.ok) { pending = null; confirmEl.classList.add("hidden"); say(r.err, true); return; }
    pending = code.value;
    confirmEl.classList.remove("hidden");
    say(`This backup is ${r.label}. Your current journey (${r.current}) will be replaced.`);
  };
  $("btn-import-check").onclick = check;
  $("btn-import-yes").onclick = () => { if (pending) state.applyBackup(pending); };
  $("btn-import-no").onclick = () => { pending = null; confirmEl.classList.add("hidden"); say("Nothing changed."); };
}
