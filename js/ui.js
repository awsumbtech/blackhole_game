// ─── UI ───
// Between-galaxy summary + upgrade shop, stats view, power-up timers.

import { UPGRADES, MAX_LEVEL, upgradeCost, fmtTime, fmtMass } from "./progression.js";
import { POWERUPS, POWERUP_KINDS } from "./powerups.js";
import { EVENT_INFO } from "./living-world.js";
import { biomeCatalog } from "./entities.js";

const $ = id => document.getElementById(id);

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

export function showSummary(summary, state, { onBuy, onContinue }) {
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

export function showStats(state, onClose) {
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
      <p>${seen ? esc(b.codex) : "Not visited yet."}</p></div>`;
  }).join("");

  $("stats-body").innerHTML = `
    <div class="stats-section"><h3>Settings</h3>
      ${setRow("Zen mode", "No clock or par, bumps cost nothing", onOff("zen"))}
      ${setRow("Breathing guide", "A faint ring that grows as you breathe in (10s cycle)", onOff("breathGuide"))}
      ${setRow("Soft palette", "Muted colours, amber rings instead of rose", onOff("softPalette"))}
      ${setRow("Reduce motion", "No screen shake, fewer particles", onOff("reduceMotion"))}
      ${setRow("Touch controls", "Thumbstick, or drift toward your finger", seg("touchMode", [["joystick", "Joystick"], ["follow", "Follow"]]))}
    </div>
    <div class="stats-section"><h3>What's that? (events)</h3>${evItems}</div>
    <div class="stats-section"><h3>Galaxies</h3>${biomeItems}</div>
    <div class="stats-section"><h3>Progress</h3>
      ${row("Current galaxy", state.galaxy)}
      ${row("Highest galaxy", state.bestGalaxy)}
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
