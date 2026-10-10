// ─── STAR MAP (v5.2) ───
// A slowly drifting sky with one star per cleared galaxy, coloured by its
// biome and joined by soft constellation lines. Tap a star for its story.
// It's its own screen with its own little loop that only runs while open.

const TAU = Math.PI * 2;
let el = null, cvs = null, g = null, card = null;
let entries = [], pts = [], raf = 0, sel = -1, onCloseCb = null, reduceMotion = false;
let W = 0, H = 0, dpr = 1, dust = null, glowCache = new Map();
let panX = 0, panY = 0, drag = null, t0 = 0;

function glow(rgb) {
  let c = glowCache.get(rgb);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = 96;
  const x = c.getContext("2d");
  const gr = x.createRadialGradient(48, 48, 0, 48, 48, 48);
  gr.addColorStop(0, "rgba(255, 252, 240, 1)");
  gr.addColorStop(0.12, `rgba(${rgb}, 0.95)`);
  gr.addColorStop(0.4, `rgba(${rgb}, 0.28)`);
  gr.addColorStop(1, `rgba(${rgb}, 0)`);
  x.fillStyle = gr;
  x.fillRect(0, 0, 96, 96);
  glowCache.set(rgb, c);
  return c;
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

function buildDust() {
  dust = document.createElement("canvas");
  dust.width = W * dpr; dust.height = H * dpr;
  const x = dust.getContext("2d");
  x.scale(dpr, dpr);
  const bg = x.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, Math.max(W, H) * 0.8);
  bg.addColorStop(0, "#0d1230");
  bg.addColorStop(1, "#03040b");
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);
  const r = rng(7);
  // a few soft clouds
  for (let i = 0; i < 6; i++) {
    const cx = r() * W, cy = r() * H, cr = 120 + r() * 220;
    const hue = [[90, 110, 200], [150, 100, 200], [70, 160, 190]][i % 3];
    const cg = x.createRadialGradient(cx, cy, 0, cx, cy, cr);
    cg.addColorStop(0, `rgba(${hue}, 0.08)`);
    cg.addColorStop(1, `rgba(${hue}, 0)`);
    x.fillStyle = cg;
    x.fillRect(cx - cr, cy - cr, cr * 2, cr * 2);
  }
  for (let i = 0; i < 220; i++) {
    x.fillStyle = `rgba(220, 225, 255, ${0.15 + r() * 0.4})`;
    x.beginPath(); x.arc(r() * W, r() * H, 0.4 + r() * 0.9, 0, TAU); x.fill();
  }
}

/** Positions along a slow, winding spiral so consecutive galaxies sit close. */
function layout() {
  const r = rng(1234);
  const raw = entries.map((e, i) => {
    const a = i * 0.85 + (r() - 0.5) * 0.35;
    const d = 26 + i * 15 + (r() - 0.5) * 10;
    return [Math.cos(a) * d, Math.sin(a) * d * 0.82];
  });
  if (!raw.length) { pts = []; return; }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of raw) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const span = Math.max(x1 - x0, (y1 - y0) * (W / Math.max(1, H - 200)), 1);
  const k = Math.min(2.6, (W * 0.78) / span);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  pts = raw.map(([x, y]) => [W / 2 + (x - cx) * k, H * 0.46 + (y - cy) * k]);
}

function draw(now) {
  raf = requestAnimationFrame(draw);
  const t = (now - t0) / 1000;
  const breath = 0.5 + 0.5 * Math.sin(t * TAU / 10);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  // The whole sky drifts very slowly
  const dx = reduceMotion ? 0 : Math.sin(t * 0.05) * 10, dy = reduceMotion ? 0 : Math.cos(t * 0.04) * 7;
  g.drawImage(dust, dx * 0.4 - 6, dy * 0.4 - 6, W + 12, H + 12);
  const ox = dx + panX, oy = dy + panY;
  // Constellation lines
  if (pts.length > 1) {
    g.lineWidth = 1.2;
    g.lineCap = "round";
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const lg = g.createLinearGradient(a[0] + ox, a[1] + oy, b[0] + ox, b[1] + oy);
      lg.addColorStop(0, `rgba(${entries[i - 1].rgb}, 0.22)`);
      lg.addColorStop(1, `rgba(${entries[i].rgb}, 0.22)`);
      g.strokeStyle = lg;
      g.beginPath(); g.moveTo(a[0] + ox, a[1] + oy); g.lineTo(b[0] + ox, b[1] + oy); g.stroke();
    }
  }
  // Stars: size grows with the scale reached there; each twinkles on its own slow phase
  entries.forEach((e, i) => {
    const [x, y] = pts[i];
    const tw = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * 0.6 + i * 1.7);
    const s = (9 + Math.min(10, e.tier * 0.9)) * (0.9 + 0.12 * tw) * (e.breather ? 0.8 : 1);
    g.globalAlpha = 0.75 + 0.25 * tw;
    g.drawImage(glow(e.rgb), x + ox - s * 2, y + oy - s * 2, s * 4, s * 4);
    if (i === sel) {
      g.globalAlpha = 0.5 + 0.3 * breath;
      g.strokeStyle = `rgba(${e.rgb}, 1)`;
      g.lineWidth = 1.2;
      g.beginPath(); g.arc(x + ox, y + oy, s * 1.6 + breath * 3, 0, TAU); g.stroke();
    }
  });
  g.globalAlpha = 1;
}

function hit(x, y) {
  let best = -1, bd = 28;
  pts.forEach(([px, py], i) => { const d = Math.hypot(px + panX - x, py + panY - y); if (d < bd) { bd = d; best = i; } });
  return best;
}

function showCard(i) {
  sel = i;
  if (i < 0) { card.classList.add("hidden"); return; }
  const e = entries[i];
  const when = e.date ? new Date(e.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "before the star map began";
  card.innerHTML = `<b>Galaxy ${e.g} · ${esc(e.biome)}</b>
    <span>Cleared ${esc(when)}</span>
    <span>Biggest scale there: ${esc(e.tierName)}${e.est ? " (about)" : ""}</span>
    ${e.time ? `<span>Fastest clear: ${esc(e.time)}</span>` : ""}`;
  card.style.setProperty("--star", `rgb(${e.rgb})`);
  card.classList.remove("hidden");
}

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  cvs.width = W * dpr; cvs.height = H * dpr;
  cvs.style.width = W + "px"; cvs.style.height = H + "px";
  buildDust();
  layout();
}

function bind() {
  el = document.getElementById("starmap");
  cvs = document.getElementById("starmap-canvas");
  g = cvs.getContext("2d");
  card = document.getElementById("starmap-card");
  cvs.addEventListener("pointerdown", ev => { drag = { x: ev.clientX, y: ev.clientY, px: panX, py: panY, moved: false }; cvs.setPointerCapture(ev.pointerId); });
  cvs.addEventListener("pointermove", ev => {
    if (!drag) return;
    const mx = ev.clientX - drag.x, my = ev.clientY - drag.y;
    if (Math.hypot(mx, my) > 8) drag.moved = true;
    if (drag.moved) { panX = drag.px + mx; panY = drag.py + my; }
  });
  cvs.addEventListener("pointerup", ev => {
    if (drag && !drag.moved) showCard(hit(ev.clientX, ev.clientY));
    drag = null;
  });
  cvs.addEventListener("pointercancel", () => { drag = null; });
  document.getElementById("btn-starmap-back").addEventListener("click", closeStarMap);
  window.addEventListener("resize", () => { if (raf) resize(); });
}

/** entries: [{ g, biome, rgb: "r, g, b", date, tier, tierName, est, time, breather }] */
export function openStarMap(list, opts = {}) {
  if (!el) bind();
  entries = list;
  reduceMotion = !!opts.reduceMotion;
  onCloseCb = opts.onClose || null;
  panX = panY = 0; sel = -1;
  resize();
  showCard(-1);
  document.getElementById("starmap-empty").classList.toggle("hidden", entries.length > 0);
  document.getElementById("starmap-count").textContent = entries.length
    ? `${entries.length} galax${entries.length === 1 ? "y" : "ies"} cleared · tap a star` : "";
  el.classList.remove("hidden");
  t0 = performance.now();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(draw);
}

export function closeStarMap() {
  cancelAnimationFrame(raf);
  raf = 0;
  if (el) el.classList.add("hidden");
  const cb = onCloseCb; onCloseCb = null;
  cb?.();
}

export function starMapOpen() { return !!raf; }
