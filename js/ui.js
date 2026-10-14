import { MECHANICS } from "./worlds.js";
import { tierName } from "./tiers.js";
// ─── UI ───
// Between-galaxy summary + upgrade shop, stats view, power-up timers.

import { UPGRADES, MAX_LEVEL, upgradeCost, fmtTime, fmtMass } from "./progression.js";
import { POWERUPS, POWERUP_KINDS } from "./powerups.js";
import { EVENT_INFO } from "./living-world.js";
import { biomeCatalog } from "./entities.js";
import { SKINS, hasMilestone } from "./ascension.js";

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
  ["255, 240, 200", "Shimmer (discovery)", "Rare finds hide in every galaxy: a golden comet, a lost probe, a whale-shaped nebula. A faint glow at the screen edge (and your wisp leaning that way) means one is near. Drift into it to write it in your logbook."],
  ["150, 235, 215", "Your wisp", "It twirls when you make a big catch, curls up to rest in breather galaxies, and perks up when a discovery is close."],
  ["200, 210, 255", "A new star", "After each galaxy, its star joins your sky for a quiet moment before the summary. Tap to move on whenever you like."],
  ["170, 140, 240", "Ascension and collapse", "Each run starts from dust at Galaxy 1 and every galaxy deeper is a little bigger, sparser and slower. When it starts to feel heavy, Collapse (pause menu or after a galaxy, from depth 3) to turn the run into Dark Matter."],
  ["210, 190, 255", "Dark Matter and the constellation", "Dark Matter lights permanent perks on the constellation: Reach, Appetite and Fortune. Each tier opens the next; forks are a choice. Collapsing deeper earns much more."],
  ["170, 140, 240", "Rival holes", "From Galaxy 3 of a run, calm rival black holes drift about eating food. Bumping a bigger one just eases you aside. Grow past one and it turns gold: swallow it."],
  ["255, 228, 170", "Galaxy goals", "Each galaxy type has its own goal (graze the reefs, ride the current, feed in the beams...). Up to 3 stars; your best is kept, and 3 stars unlocks that galaxy's perk."],
  ["255, 210, 120", "Golden galaxies and supernova runs", "After your first collapse, a galaxy now and then shines gold (triple stardust). Later, some runs begin as a supernova: every bite counts 50% more. Rare finds can shine too (+3 Dark Matter)."],
  ["160, 235, 215", "Zen sessions", "A separate calm space for 3, 5 or 10 minutes: settle, flow, wind down. The pull follows your breath. It ends with three slow breaths and a gentle send-off. Nothing is kept or counted."]
].map(([rgb, name, text]) => `<div class="codex-item"><b><i class="dot" style="background:rgb(${rgb})"></i>${name}</b><p>${text}</p></div>`).join("");

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// ─── SHOP ───

export function renderShop(listEl, balanceEl, state, onBuy) {
  balanceEl.textContent = Math.floor(state.stardust);
  listEl.innerHTML = UPGRADES.map(u => {
    const lvl = state.upgrades[u.id] || 0;
    const cost = upgradeCost(u, lvl);
    const maxed = cost == null;
    const afford = !maxed && state.stardust >= cost;
    const pips = Array.from({ length: MAX_LEVEL }, (_, i) => `<i class="${i < lvl ? "on" : ""}"></i>`).join("");
    const next = maxed ? "Maxed out" : `Next: ${esc(u.desc(lvl + 1))}`;
    return `<div class="shop-row${maxed ? " maxed" : ""}">
      <div class="shop-info">
        <div class="shop-name">${esc(u.name)} <span class="pips">${pips}</span></div>
        <div class="shop-desc">${lvl === 0 ? "Not upgraded yet" : esc(u.desc(lvl))}</div>
        <div class="shop-next">${next}</div>
      </div>
      <button class="buy-btn${afford ? "" : " cant"}" data-upg="${u.id}" ${maxed ? "disabled" : ""}>
        ${maxed ? "MAX" : `<span class="sd">✦</span>${cost}`}
      </button>
    </div>`;
  }).join("");
  listEl.querySelectorAll(".buy-btn").forEach(btn => {
    btn.addEventListener("click", () => onBuy(btn.dataset.upg));
  });
}

// ─── SUMMARY ───

function tile(label, value, sub, isNew) {
  return `<div class="sum-tile${isNew ? " new" : ""}">
    <div class="sum-label">${esc(label)}${isNew ? ' <span class="badge">NEW BEST</span>' : ""}</div>
    <div class="sum-value">${esc(value)}</div>
    ${sub ? `<div class="sum-subval">${esc(sub)}</div>` : ""}
  </div>`;
}

export function showSummary(summary, state, { onBuy, onContinue, onCollapse }) {
  const el = $("summary");
  $("sum-title").textContent = `Galaxy ${summary.galaxy} devoured`;
  $("sum-sub").textContent = summary.biome;

  const timeSub = summary.prevFast != null
    ? (summary.newFast ? `was ${fmtTime(summary.prevFast)}` : `best ${fmtTime(summary.prevFast)}`)
    : `par ${fmtTime(summary.par)}`;
  $("sum-grid").innerHTML = [
    summary.zen
      ? tile("Mass reached", fmtMass(summary.mass), summary.breather ? "a breather galaxy" : "at your own pace", false)
      : tile("Clear time", fmtTime(summary.time), timeSub, summary.newFast && summary.prevFast != null),
    tile("Best combo", `×${summary.bestCombo}`, `record ×${state.stats.bestCombo}`, summary.newCombo),
    tile("Objects eaten", summary.eaten, `record ${state.records.mostEaten}`, summary.newEaten),
    tile("Big catches", summary.bigFish, summary.powerups ? `${summary.powerups} power-up${summary.powerups > 1 ? "s" : ""}` : "", summary.newBig)
  ].join("");

  // v7 Ascension: depth, the galaxy goal, unlocks, and the option to collapse
  const rows = [];
  if (summary.goal) {
    const g = summary.goal;
    rows.push(`<div class="row"><b>${esc(g.name)}</b> <span class="stars">${"★".repeat(g.stars)}${"☆".repeat(3 - g.stars)}</span><br>${g.count} ${esc(g.unit)} · stars at ${g.need.join(" / ")}${g.best > g.stars ? ` · best ${"★".repeat(g.best)}` : ""}</div>`);
  }
  if (summary.unlocked) rows.push(`<div class="row gold">3 stars! Galaxy perk unlocked: <b>${esc(summary.unlocked.name)}</b>. ${esc(summary.unlocked.desc)}</div>`);
  if (summary.depth) rows.push(`<div class="row">Run depth <b>${summary.depth}</b>${summary.canCollapse ? ` · collapsing now would give <b>${summary.dmPreview}</b> Dark Matter` : ` · you can collapse from depth 3`}</div>`);
  if (summary.heavy) rows.push(`<div class="row heavy">The pull is getting heavy out here. A collapse would carry you further next time.</div>`);
  $("sum-asc").innerHTML = rows.join("");
  const cb = $("btn-sum-collapse");
  cb.classList.toggle("hidden", !summary.canCollapse);
  cb.onclick = () => onCollapse?.();

  $("sum-earned").textContent = summary.earned;
  $("sum-breakdown").innerHTML = summary.parts.map(([k, v]) => `<span>${esc(k)} +${v}</span>`).join("");

  const legacy = $("sum-legacy");
  if (state.legacyBonusPending) {
    legacy.textContent = `Includes a +${state.legacyBonusPending} legacy bonus for galaxies you cleared before stardust existed.`;
    legacy.classList.remove("hidden");
    state.legacyBonusPending = 0;
  } else {
    legacy.classList.add("hidden");
  }

  const refresh = () => renderShop($("shop-list"), $("shop-balance"), state, id => { onBuy(id); refresh(); });
  refresh();

  const btn = $("btn-continue");
  btn.textContent = `Continue to Galaxy ${summary.galaxy + 1}`;
  btn.onclick = () => {
    el.classList.add("hidden");
    onContinue();
  };
  el.classList.remove("hidden");
  el.querySelector(".modal-card").scrollTop = 0;
}

export function isSummaryOpen() {
  return !$("summary").classList.contains("hidden");
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
  const upg = UPGRADES.map(u => row(u.name, `${state.upgrades[u.id] || 0} / ${MAX_LEVEL}`)).join("");

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
      ${setRow("Breathing guide", "Ascension: a faint ring that grows as you breathe in (4s in, 6s out)", onOff("breathGuide"))}
      ${setRow("Zen breath words", "Faint 'breathe in / out' words in Zen sessions", onOff("zenBreathCue"))}
      ${setRow("Soft palette", "Muted colours, amber rings instead of rose", onOff("softPalette"))}
      ${setRow("Reduce motion", "No screen shake, fewer particles", onOff("reduceMotion"))}
      ${setRow("Touch controls", "Thumbstick, or drift toward your finger", seg("touchMode", [["joystick", "Joystick"], ["follow", "Follow"]]))}
      ${setRow("Visual quality", "Auto lowers detail if your phone needs it", seg("quality", [["auto", "Auto"], ["high", "High"], ["balanced", "Lite"]]))}
      ${setRow("Companion name", "The little wisp that drifts with you", `<input id="set-wisp-name" class="name-input" maxlength="16" value="${esc(state.settings.wispName || "Wisp")}" aria-label="Companion name">`)}
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
      ${row("Stardust", `${Math.floor(state.stardust)} (earned ${s.stardustEarned})`)}
    </div>
    <div class="stats-section"><h3>Records</h3>
      ${row("Best combo", "×" + s.bestCombo)}
      ${row("Most eaten in a galaxy", r.mostEaten)}
      ${row("Most stardust from a galaxy", r.bestStardust)}
      ${row("Highest mass", fmtMass(s.highestMass))}
      ${row("Objects eaten (all time)", s.totalConsumed.toLocaleString())}
      ${row("Big catches (all time)", s.bigFishEaten)}
      ${row("Power-ups collected", s.powerupsCollected)}
    </div>
    <div class="stats-section"><h3>Fastest clears</h3>
      ${fastest.length ? fastest.map(([g, t]) => row(`Galaxy ${g}`, fmtTime(t))).join("") : '<div class="stat-empty">Clear a galaxy to set a time.</div>'}
    </div>
    <div class="stats-section"><h3>Upgrades</h3>${upg}</div>`;
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
  nameEl.addEventListener("change", () => {
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
