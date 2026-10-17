// ─── PERK CONSTELLATION (v7) ───
// Dark Matter buys permanent perks, drawn as a constellation rising from your
// singularity: Reach (left), Appetite (up), Fortune (right). Forks are two
// stars side by side: either one opens the next tier. (v9: the only
// upgrade screen; galaxy perks were folded into the branches.) Tap a star to read it and buy it.

import { PERKS, BRANCHES, perkState, buyPerk, nextMilestone } from "./ascension.js";
const $ = id => document.getElementById(id);

const TAU = Math.PI * 2;
let el, cvs, g, card, W = 0, H = 0, dpr = 1, raf = 0, t0 = 0;
let asc = null, nodes = [], sel = null, opts = {}, dust = null;
const ANG = { reach: -2.25, appetite: -Math.PI / 2, fortune: -0.89 };

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function layout() {
  const cx = W / 2, cy = H * 0.66;
  const len = Math.min(H * 0.5, W * 0.95);
  nodes = [];
  for (const p of PERKS) {
    const a = ANG[p.b];
    const forks = PERKS.filter(q => q.b === p.b && q.t === p.t);
    const idx = forks.indexOf(p);
    const d = 80 + (p.t / 6) * (len - 80);
    // branches curve gently outward as they rise
    const curve = (p.b === "reach" ? -1 : p.b === "fortune" ? 1 : 0) * 0.18 * (p.t / 6);
    const kx = Math.min(1, (W / 2 - 30) / len);   // keep side arms on narrow phones
    let x = cx + Math.cos(a + curve) * d * kx, y = cy + Math.sin(a + curve) * d * 0.95;
    if (forks.length > 1) {
      const off = (idx === 0 ? -1 : 1) * 17;
      x += -Math.sin(a) * off; y += Math.cos(a) * off;
    }
    nodes.push({ p, x, y, rgb: BRANCHES[p.b].rgb, r: 7 + p.t * 0.6 });
  }
  nodes.core = { x: cx, y: cy };
}

function buildDust() {
  dust = document.createElement("canvas");
  dust.width = W * dpr; dust.height = H * dpr;
  const x = dust.getContext("2d");
  x.scale(dpr, dpr);
  const bg = x.createRadialGradient(W / 2, H * 0.6, 0, W / 2, H * 0.6, Math.max(W, H) * 0.8);
  bg.addColorStop(0, "#150f2c"); bg.addColorStop(0.5, "#08071a"); bg.addColorStop(1, "#020208");
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  let s = 77;
  const r = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 200; i++) {
    x.fillStyle = `rgba(220, 220, 255, ${0.1 + r() * 0.35})`;
    x.beginPath(); x.arc(r() * W, r() * H, 0.4 + r() * 0.8, 0, TAU); x.fill();
  }
}

function glow(x, y, r, rgb, a) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(255, 252, 245, ${a})`);
  gr.addColorStop(0.25, `rgba(${rgb}, ${a * 0.8})`);
  gr.addColorStop(1, `rgba(${rgb}, 0)`);
  g.fillStyle = gr;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}

function draw(now) {
  raf = requestAnimationFrame(draw);
  const t = (now - t0) / 1000;
  const breath = 0.5 + 0.5 * Math.sin(t * TAU / 10);
  const rm = !!opts.reduceMotion;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.drawImage(dust, 0, 0, W, H);
  const c = nodes.core;
  // core singularity
  glow(c.x, c.y, 34 + (rm ? 0 : breath * 6), "170, 140, 255", 0.55);
  g.fillStyle = "#020205"; g.beginPath(); g.arc(c.x, c.y, 9, 0, TAU); g.fill();
  // lines: core -> tier 0, tier n -> tier n+1
  g.lineCap = "round";
  for (const n of nodes) {
    const prev = n.p.t === 0 ? [c] : nodes.filter(m => m.p.b === n.p.b && m.p.t === n.p.t - 1);
    const own = !!asc.perks[n.p.id];
    for (const m of prev) {
      const mOwn = m === c || !!asc.perks[m.p.id];
      g.strokeStyle = `rgba(${n.rgb}, ${own && mOwn ? 0.55 : mOwn ? 0.2 : 0.07})`;
      g.lineWidth = own && mOwn ? 1.6 : 1;
      g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(n.x, n.y); g.stroke();
    }
  }
  for (const n of nodes) {
    const st = perkState(asc, n.p);
    const own = !!asc.perks[n.p.id];
    const tw = rm ? 0.5 : 0.5 + 0.5 * Math.sin(t * 0.7 + n.x * 0.05);
    if (own) glow(n.x, n.y, n.r * 3.2 * (0.92 + 0.12 * tw), n.rgb, 0.9);
    else if (st.ok) {
      glow(n.x, n.y, n.r * 2.4, n.rgb, 0.35 + 0.2 * breath);
      g.strokeStyle = `rgba(${n.rgb}, ${0.35 + 0.35 * breath})`; g.lineWidth = 1.2;
      g.beginPath(); g.arc(n.x, n.y, n.r * 1.5 + (rm ? 0 : breath * 2), 0, TAU); g.stroke();
    } else glow(n.x, n.y, n.r * 1.6, n.rgb, 0.16);
    if (sel === n) {
      g.strokeStyle = "rgba(255, 255, 255, 0.7)"; g.lineWidth = 1.2;
      g.beginPath(); g.arc(n.x, n.y, n.r * 2.1, 0, TAU); g.stroke();
    }
  }
  // branch names
  g.font = "600 10px Outfit, system-ui, sans-serif"; g.textAlign = "center";
  for (const b of Object.keys(BRANCHES)) {
    const top = nodes.filter(n => n.p.b === b && n.p.t === 6)[0];
    if (!top) continue;
    g.fillStyle = `rgba(${BRANCHES[b].rgb}, 0.7)`;
    g.fillText(BRANCHES[b].name.toUpperCase(), top.x, top.y - 22);
  }
}

function showCard(n) {
  sel = n;
  const ms = nextMilestone(asc);
  if (!n) {
    card.style.setProperty("--c", "#a98bff");
    const owned = Object.keys(asc.perks).length;
    card.innerHTML = `<b class="n">${owned ? `${owned} star${owned > 1 ? "s" : ""} lit` : "Your first stars"}</b>
      Tap a star to read it. Each branch climbs in tiers: buy any star in a tier to open the next. Forks are a choice of two.
      ${opts.newRun ? "" : ""}
      <div class="mile">${ms ? `Collapse ${ms.at}: ${esc(ms.name)}. ${esc(ms.desc)}` : "Every collapse milestone unlocked."}</div>
      ${opts.newRun ? `<div class="row"><button id="btn-const-run" class="big-btn">Begin a new run</button></div>` : ""}`;
  } else {
    const st = perkState(asc, n.p);
    const br = BRANCHES[n.p.b];
    card.style.setProperty("--c", `rgb(${n.rgb})`);
    card.style.setProperty("--rgb", n.rgb);
    card.innerHTML = `<span class="br">${esc(br.name)} · tier ${n.p.t + 1}</span><b class="n">${esc(n.p.name)}</b>${esc(n.p.desc)}
      <div class="why">${st.owned ? "Yours, permanently." : st.ok ? `Costs ${st.cost} Dark Matter` : esc(st.why)}</div>
      <div class="row">${st.ok ? `<button id="btn-const-buy" class="big-btn">Light it · ${st.cost}</button>` : ""}
      <button id="btn-const-close" class="soft-btn">${opts.newRun ? "Back" : "Close"}</button></div>`;
    card.querySelector("#btn-const-buy")?.addEventListener("click", () => {
      if (buyPerk(asc, n.p.id)) { opts.onBuy?.(n.p); refresh(); showCard(n); }
    });
    card.querySelector("#btn-const-close")?.addEventListener("click", () => showCard(null));
  }
  card.querySelector("#btn-const-run")?.addEventListener("click", () => closeConstellation(true));
}

function refresh() {
  $("const-dm").textContent = Math.floor(asc.dm || 0);
  $("const-sub").textContent = `${asc.collapses || 0} collapse${asc.collapses === 1 ? "" : "s"} · deepest run ${asc.bestDepth || 0} galaxies`;
}

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  cvs.width = W * dpr; cvs.height = H * dpr;
  cvs.style.width = W + "px"; cvs.style.height = H + "px";
  buildDust(); layout();
}

function bind() {
  el = $("constellation");
  cvs = $("const-canvas");
  g = cvs.getContext("2d");
  card = $("const-card");
  cvs.addEventListener("pointerup", ev => {
    let best = null, bd = 26;
    for (const n of nodes) { const d = Math.hypot(n.x - ev.clientX, n.y - ev.clientY); if (d < bd) { bd = d; best = n; } }
    showCard(best);
  });
  $("btn-const-back").addEventListener("click", () => closeConstellation(false));
  window.addEventListener("resize", () => { if (raf) resize(); });
}

/** opts: { reduceMotion, newRun (show "Begin a new run"), onBuy(perk), onClose(beginRun) } */
export function openConstellation(ascState, o = {}) {
  if (!el) bind();
  asc = ascState; opts = o; sel = null;
  resize(); refresh(); showCard(null);
  $("btn-const-back").textContent = o.newRun ? "Later" : "Back";
  el.classList.remove("hidden");
  t0 = performance.now();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(draw);
}

export function closeConstellation(beginRun) {
  cancelAnimationFrame(raf); raf = 0;
  el?.classList.add("hidden");
  const cb = opts.onClose; opts = {};
  cb?.(!!beginRun);
}
