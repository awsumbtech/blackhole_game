// ─── LOGBOOK (v6) ───
// Every discovery you've found, grouped by galaxy type. Unfound ones show as
// a soft "???" with their galaxy, so there's a gentle sense of what's left.

import { DISCOVERIES, ALL_DISCOVERIES } from "./discoveries.js";
const $ = id => document.getElementById(id);

let onCloseCb = null;
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

export function openLogbook(log, opts = {}) {
  const el = $("logbook");
  const body = $("logbook-body");
  log = log || {};
  const found = ALL_DISCOVERIES.filter(d => log[d.id]).length;
  $("logbook-count").textContent = `${found} of ${ALL_DISCOVERIES.length} discoveries`;
  body.innerHTML = (found ? "" : `<p class="lb-biome" style="text-transform:none;letter-spacing:0;font-weight:400;font-size:13px">Rare things hide in every galaxy. When something shimmers nearby, drift into it.</p>`) +
    Object.entries(DISCOVERIES).map(([biome, list]) => `<div class="lb-biome">${esc(biome)}</div>` + list.map(d => {
      const e = log[d.id];
      if (!e) return `<div class="lb-item unfound"><i class="gem"></i><div><b>???</b><p>Something rare still hides in ${esc(biome)}.</p></div></div>`;
      const when = e.d ? new Date(e.d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
      return `<div class="lb-item" style="--c:${d.rgb}"><i class="gem"></i><div><b>${esc(d.name)}</b><p>${esc(d.line)}</p>
        <small>First found in Galaxy ${e.g}${when ? " · " + esc(when) : ""}${e.n > 1 ? ` · seen ${e.n} times` : ""}</small></div></div>`;
    }).join("")).join("");
  onCloseCb = opts.onClose || null;
  el.scrollTop = 0;
  el.classList.remove("hidden");
}

export function closeLogbook() {
  $("logbook").classList.add("hidden");
  const cb = onCloseCb; onCloseCb = null;
  cb?.();
}

$("btn-logbook-back")?.addEventListener("click", closeLogbook);
