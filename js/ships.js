// ─── SHIPS (v9.4) ───
// One surface for every ship in the game: the class a craft is built as, the
// seeded parts-based painter (art.js PAINTERS.craft calls paintShip), how it
// moves (living ships glide nose-first, wrecks tumble slowly), the breathing
// engine glow, and the calm break-apart when it is eaten.
//
// Look language (DESIGN §3): silhouette first, then a big/medium/small detail
// hierarchy. Mirror-symmetric hulls built from boxes, prows and pods; layered
// plates with soft upper-edge rim light (warm key) and lower-edge bounce in
// the galaxy's own colour; panel lines; tiny warm windows that sell scale;
// one muted accent stripe (Foss-style colour blocking). Wrecks add scorch,
// torn plates with ribs showing and, on capital wrecks, a broken spine.
// Everything paints once into the art cache; per frame only stamps.

const TAU = Math.PI * 2;

// Classes, small to huge. Ships only appear while craft is food-sized, so a
// class reads as "how big a thing you are eating now".
export const SHIP_CLASSES = ["drone", "shuttle", "freighter", "cruiser", "capital"];
const EXTENT = { drone: 1.45, shuttle: 1.45, freighter: 1.5, cruiser: 1.5, capital: 1.55, scrap: 1.2 };
export const shipExtent = cls => EXTENT[cls] || 1.45;
export const SHIP_LOOKS = 8;

/** Class for a tier (big = a "bigger fish" / hull, one class up). */
export function shipClassFor(tier, big = false, roll = Math.random()) {
  const t = tier | 0;
  let i = t <= 2 ? (roll < 0.6 ? 0 : 1) : t === 3 ? (roll < 0.55 ? 1 : 2) : t <= 5 ? (roll < 0.6 ? 2 : 3) : t <= 7 ? 3 : 4;
  if (big) i = Math.min(4, i + 1);
  return SHIP_CLASSES[i];
}

/**
 * Give a freshly made craft entity its ship identity. Wrecks (Armada, derelict
 * flotillas) tumble slowly; living ships steer nose-first along their path.
 */
export function adoptShip(e, tier, wreck, big = false) {
  e.ship = shipClassFor(tier, big);
  e.look = (Math.random() * SHIP_LOOKS) | 0;
  setWreck(e, wreck);
}
export function setWreck(e, wreck) {
  e.wreck = !!wreck;
  e.steer = !wreck;
  e.rotSpeed = wreck ? (Math.random() - 0.5) * 0.0024 : 0;
  if (!wreck) e.rotation = Math.atan2(e.vy, e.vx);
  e._artBase = null; e._sp = null;
}
export function upgradeShip(e) {
  const i = SHIP_CLASSES.indexOf(e.ship);
  if (i >= 0 && i < 4) { e.ship = SHIP_CLASSES[i + 1]; e._artBase = null; e._sp = null; }
}

// ─── Galaxy light (bounce rim colour) ───
let bounce = [150, 170, 220], lightKey = "";
export function setShipLight(rgb, key) { bounce = rgb.slice(0, 3); lightKey = key || ""; }
export function shipKey(e) { return `craft|${e.ship || "drone"}|${e.wreck ? 1 : 0}|${lightKey}`; }

// ─── Design: a normalised parts list per class + look (cached) ───
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const HULLS = [[168, 174, 186], [150, 160, 178], [182, 172, 156], [140, 152, 152], [160, 156, 170], [176, 170, 150], [146, 158, 170], [170, 164, 176]];
const ACCENTS = [[200, 120, 64], [214, 170, 82], [78, 148, 160], [176, 82, 70], [226, 214, 186], [120, 140, 190]];
const CARGO = [[160, 92, 62], [186, 150, 80], [76, 128, 136], [196, 188, 166], [98, 108, 128], [150, 70, 60]];

// part: { k: "box", x0, x1, w0, w1, cy } trapezoid along x | { k: "poly", p: [x, y, ...] } |
//       { k: "ell", cx, cy, rx, ry }; t = tone, col = own colour, win/panel/greeble flags,
//       aft = belongs to the drifting stern of a broken capital wreck
function box(x0, x1, w0, w1, cy = 0, o = {}) { return Object.assign({ k: "box", x0, x1, w0, w1, cy, t: 0 }, o); }
function poly(p, o = {}) { return Object.assign({ k: "poly", p, t: 0 }, o); }
function ell(cx, cy, rx, ry, o = {}) { return Object.assign({ k: "ell", cx, cy, rx, ry, t: 0 }, o); }
// mirror an off-axis part to the other side
function pair(list, part) {
  list.push(part);
  const m = Object.assign({}, part);
  if (part.k === "box" || part.k === "ell") m.cy = -part.cy;
  else { m.p = part.p.slice(); for (let i = 1; i < m.p.length; i += 2) m.p[i] = -m.p[i]; }
  list.push(m);
}
// a symmetric outline from its upper half (x, y<=0 pairs, nose to tail)
function symPoly(top, o) {
  const p = [];
  for (let i = 0; i < top.length; i += 2) p.push(top[i], top[i + 1]);
  for (let i = top.length - 2; i >= 0; i -= 2) if (top[i + 1] !== 0) p.push(top[i], -top[i + 1]);
  return poly(p, o);
}

const designs = new Map();
function design(cls, look) {
  const key = cls + look;
  let d = designs.get(key);
  if (d) return d;
  const r = rng((look + 1) * 2654435761 + cls.length * 97 + cls.charCodeAt(0) * 7919);
  const parts = [], eng = [], nav = [], holes = [];
  const hull = HULLS[look % HULLS.length], accent = ACCENTS[(look * 5 + cls.length) % ACCENTS.length];
  let brk = null;
  const j = (a, b) => a + (b - a) * r();
  if (cls === "drone") {
    // survey drone: a pod with solar wings on struts
    const L = j(0.5, 0.65), W = j(0.26, 0.34);
    const wings = r() < 0.5 ? 1 : 2, ww = j(0.2, 0.3);
    for (let i = 0; i < wings; i++) {
      const x = wings === 1 ? -0.1 : -0.3 + i * 0.36;
      pair(parts, poly([x - 0.025, -W * 0.8, x + 0.025, -W * 0.8, x + 0.025, -(W + 0.16), x - 0.025, -(W + 0.16)], { t: -0.2 }));   // strut
      pair(parts, box(x - ww * 0.5, x + ww * 0.5, 0.36, 0.36, -(W + 0.5), { solar: 1, col: [58, 74, 112], t: 0 }));
    }
    parts.push(ell(0, 0, L, W, { t: 0.05, panel: 0.14 }));
    parts.push(ell(L * 0.55, 0, L * 0.38, W * 0.62, { t: 0.18, greeble: 1 }));
    parts.push(box(-L - 0.12, -L + 0.08, W * 0.45, W * 0.6, 0, { t: -0.2 }));
    eng.push([-L - 0.12, 0, W * 0.42]);
    nav.push([0, -(W + 0.86)]);
  } else if (cls === "shuttle") {
    // lifting body: swept delta, canopy, twin engines, tail fins
    const sw = j(0.55, 0.75), nose = j(1.0, 1.15);
    parts.push(symPoly([nose, 0, nose * 0.45, -0.17, -0.25, -sw * 0.75, -0.62, -sw, -0.72, -sw * 0.92, -0.62, -0.25, -0.78, -0.2, -0.78, 0], { t: 0, panel: 0.16 }));
    parts.push(box(-0.72, 0.62, 0.17, 0.11, 0, { t: 0.14, panel: 0.12, win: 1 }));
    pair(parts, box(-0.7, -0.38, 0.05, 0.03, -sw * 0.62, { t: -0.08, col: accent }));
    parts.push(ell(nose * 0.52, 0, 0.2, 0.075, { glass: 1 }));
    pair(parts, box(-0.86, -0.6, 0.075, 0.09, -0.15, { t: -0.18 }));
    eng.push([-0.86, -0.15, 0.08], [-0.86, 0.15, 0.08]);
    nav.push([-0.68, -sw * 0.97]);
  } else if (cls === "freighter") {
    // spine of cargo containers, a bridge up front, a big engine block astern
    const n = 3 + (r() * 3 | 0), gap = 0.03, cw = Math.min(j(0.15, 0.19), (1.3 / n - gap) / 2), len = n * (cw * 2 + gap);
    const x0 = 0.55 - len;
    parts.push(box(x0 - 0.3, 0.75, 0.07, 0.06, 0, { t: -0.12, panel: 0.1 }));
    for (let i = 0; i < n; i++) {
      const cx0 = x0 + i * (cw * 2 + gap);
      for (const side of [-1, 1]) {
        if (r() < 0.14) continue;                                    // a missing container
        const rows = r() < 0.5 ? 2 : 1;
        for (let k = 0; k < rows; k++) {
          const yc = side * (0.12 + k * 0.17 + 0.04);
          parts.push(box(cx0, cx0 + cw * 2, 0.08, 0.08, yc, { col: CARGO[(r() * CARGO.length) | 0], t: j(-0.1, 0.1), panel: cw * 0.5 }));
        }
      }
    }
    parts.push(symPoly([1.15, 0, 0.95, -0.12, 0.62, -0.2, 0.55, -0.2, 0.55, 0], { t: 0.12, win: 0, panel: 0.1 }));
    parts.push(box(0.6, 0.9, 0.13, 0.08, 0, { t: 0.22, win: 1, greeble: 1 }));
    const ex = x0 - 0.3;
    parts.push(box(ex - 0.32, ex + 0.02, 0.26, 0.2, 0, { t: -0.04, panel: 0.1, greeble: 1 }));
    // radiator vanes swept back from the drive block
    if (r() < 0.65) pair(parts, poly([ex - 0.04, -0.2, ex + 0.02, -0.2, ex - 0.12, -0.6, ex - 0.24, -0.6], { radiator: 1, t: -0.1 }));
    const ne = r() < 0.5 ? 2 : 3;
    for (let i = 0; i < ne; i++) eng.push([ex - 0.34, (i - (ne - 1) / 2) * 0.16, 0.085]);
    pair(parts, box(0.62, 0.95, 0.018, 0.012, -0.1, { col: accent, t: 0 }));   // bridge stripe
    nav.push([0.95, -0.12]);
  } else if (cls === "cruiser") {
    // arrowhead warship: long prow, stepped superstructure, sponsons, three drives
    const bw = j(0.3, 0.38), nose = j(1.22, 1.32);
    parts.push(symPoly([nose, 0, 0.75, -0.13, 0.15, -bw * 0.75, -0.55, -bw, -0.95, -bw * 0.9, -1.05, -0.2, -1.05, 0], { t: 0, panel: 0.11, win: 0 }));
    pair(parts, ell(-0.25, -(bw + 0.04), j(0.3, 0.4), 0.075, { t: -0.06, panel: 0.09, win: 1 }));
    // layered plates stepping up toward the bridge
    const steps = 3 + (r() * 2 | 0);
    for (let i = 0; i < steps; i++) {
      const a = -0.85 + i * 0.22, b = 0.55 - i * 0.12, w = bw * (0.62 - i * 0.12);
      parts.push(box(a, b, w, w * 0.7, 0, { t: 0.06 + i * 0.07, panel: 0.09, win: i === 0 ? 1 : 0, greeble: i === steps - 1 ? 1 : 0 }));
    }
    parts.push(box(-0.35, -0.1, 0.07, 0.05, 0, { t: 0.4, win: 1 }));                // bridge tower
    pair(parts, box(0.25, 0.85, 0.018, 0.018, -0.07, { col: accent, t: 0 }));        // prow stripe
    pair(parts, box(-1.12, -0.88, 0.08, 0.1, -0.2, { t: -0.18 }));
    parts.push(box(-1.16, -0.92, 0.1, 0.12, 0, { t: -0.14 }));
    eng.push([-1.16, 0, 0.1], [-1.12, -0.2, 0.08], [-1.12, 0.2, 0.08]);
    nav.push([-0.95, -bw * 0.9]);
  } else if (cls === "capital") {
    // a city-sized ark: armoured prow, long spine, edge-on habitat ring,
    // hangar decks, radiator vanes and a bank of drives
    const sw = j(0.15, 0.19);
    parts.push(box(-1.2, 0.95, sw, sw * 0.85, 0, { t: -0.06, panel: 0.07, win: 1, greeble: 1 }));
    parts.push(symPoly([1.32, 0, 1.1, -0.1, 0.78, -0.27, 0.4, -0.3, 0.3, -0.18, 0.3, 0], { t: 0.08, panel: 0.07, win: 1 }));
    parts.push(box(0.42, 0.95, 0.12, 0.07, 0, { t: 0.24, panel: 0.06, win: 1, greeble: 1 }));
    const rx = j(-0.25, -0.05);
    parts.push(box(rx - 0.06, rx + 0.06, 0.66, 0.66, 0, { t: 0.1, panel: 0.05, win: 1, ring: 1 }));
    pair(parts, box(rx - 0.02, rx + 0.02, 0.012, 0.012, -0.36, { t: -0.2 }));
    pair(parts, box(-0.75, -0.4, 0.09, 0.07, -(sw + 0.08), { t: -0.04, panel: 0.06, win: 1, hangar: 1 }));
    for (let i = 0; i < 3; i++) pair(parts, poly([-0.95 + i * 0.09, -sw, -0.9 + i * 0.09, -sw, -1.02 + i * 0.09, -sw - 0.36, -1.07 + i * 0.09, -sw - 0.36], { radiator: 1, t: -0.12 }));
    parts.push(box(-1.42, -1.16, 0.28, 0.24, 0, { t: -0.05, panel: 0.07, greeble: 1 }));
    pair(parts, box(0.05, 0.75, 0.02, 0.02, -(sw * 0.6), { col: accent, t: 0 }));
    for (let i = 0; i < 4; i++) eng.push([-1.44, (i - 1.5) * 0.13, 0.065]);
    // wrecks: the spine snapped behind the ring and the stern drifted off
    brk = { x: rx - 0.18, rot: j(0.1, 0.2) * (r() < 0.5 ? -1 : 1), dx: -0.08 };
    for (const p of parts) if ((p.k === "box" ? (p.x0 + p.x1) / 2 : p.k === "ell" ? p.cx : p.p[0]) < brk.x) p.aft = 1;
    nav.push([1.1, -0.1]);
  } else {
    // scrap: one torn hull plate with a frame rib
    const n = 5 + (r() * 3 | 0), p = [];
    for (let i = 0; i < n; i++) { const a = i / n * TAU + r() * 0.5, rr = j(0.55, 0.95); p.push(Math.cos(a) * rr, Math.sin(a) * rr * 0.75); }
    parts.push(poly(p, { t: j(-0.1, 0.1), panel: 0.22, col: r() < 0.3 ? accent : null }));
  }
  // wreck damage spots (only painted on wrecks)
  const nh = cls === "drone" ? 1 : cls === "shuttle" ? 2 : cls === "capital" ? 5 : 3;
  for (let i = 0; i < nh; i++) holes.push([j(-0.9, 0.8) * (cls === "drone" ? 0.6 : 1), j(-0.25, 0.25), j(0.07, 0.15) * (cls === "capital" ? 0.8 : 1), (r() * 1e6) | 0]);
  d = { parts, eng, nav, holes, brk, hull, accent, seed: (r() * 1e9) | 0 };
  designs.set(key, d);
  return d;
}

// ─── Painting ───
const c3 = (c, a) => `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${a})`;
const tone = (c, t) => t >= 0 ? [c[0] + (255 - c[0]) * t, c[1] + (250 - c[1]) * t, c[2] + (240 - c[2]) * t] : [c[0] * (1 + t), c[1] * (1 + t), c[2] * (1 + t)];
const KEY = [255, 236, 206];

function tracePart(g, p) {
  g.beginPath();
  if (p.k === "box") {
    g.moveTo(p.x0, p.cy - p.w0); g.lineTo(p.x1, p.cy - p.w1); g.lineTo(p.x1, p.cy + p.w1); g.lineTo(p.x0, p.cy + p.w0);
  } else if (p.k === "ell") {
    g.ellipse(p.cx, p.cy, p.rx, p.ry, 0, 0, TAU);
  } else {
    g.moveTo(p.p[0], p.p[1]);
    for (let i = 2; i < p.p.length; i += 2) g.lineTo(p.p[i], p.p[i + 1]);
  }
  g.closePath();
}
function bounds(p) {
  if (p.k === "box") { const w = Math.max(p.w0, p.w1); return [p.x0, p.cy - w, p.x1, p.cy + w]; }
  if (p.k === "ell") return [p.cx - p.rx, p.cy - p.ry, p.cx + p.rx, p.cy + p.ry];
  let a = 9, b = 9, c = -9, d = -9;
  for (let i = 0; i < p.p.length; i += 2) { a = Math.min(a, p.p[i]); c = Math.max(c, p.p[i]); b = Math.min(b, p.p[i + 1]); d = Math.max(d, p.p[i + 1]); }
  return [a, b, c, d];
}

/** art.js PAINTERS.craft: g centred, R = radius in canvas px, r = seeded rng. */
export function paintShip(g, R, e) {
  const cls = e.ship || "drone", wreck = !!e.wreck;
  const d = design(cls, ((e.look | 0) % SHIP_LOOKS + SHIP_LOOKS) % SHIP_LOOKS);
  const r = rng(d.seed + (wreck ? 17 : 0));
  const px = 1 / R;                                       // one canvas px in units
  const detail = R >= 18, fine = R >= 40;
  let base = d.hull;
  if (wreck) base = [base[0] * 0.62 + 34, base[1] * 0.58 + 26, base[2] * 0.58 + 28];   // darker, rust-warm
  g.save();
  g.scale(R, R);
  const rim = Math.max(1.1 * px, 0.022);
  const lw = Math.max(0.55 * px, 0.01);

  const aftOn = wreck && d.brk;
  for (let pass = 0; pass < (aftOn ? 2 : 1); pass++) {
    if (aftOn) {
      g.save();
      if (pass === 0) { g.translate(d.brk.x + d.brk.dx, 0); g.rotate(d.brk.rot); g.translate(-d.brk.x, 0); }
    }
    for (const p of d.parts) {
      if (aftOn && (pass === 0) !== !!p.aft) continue;
      const col = p.col ? (wreck ? [p.col[0] * 0.7 + 20, p.col[1] * 0.66 + 18, p.col[2] * 0.66 + 20] : p.col) : base;
      const c = tone(col, p.t || 0);
      const [x0, y0, x1, y1] = bounds(p);
      // rims: warm key on the upper edge, galaxy bounce on the lower edge
      g.save(); g.translate(0, -rim); tracePart(g, p); g.fillStyle = c3(tone(KEY, -0.08), wreck ? 0.45 : 0.7); g.fill(); g.restore();
      g.save(); g.translate(0, rim); tracePart(g, p); g.fillStyle = c3(bounce, wreck ? 0.3 : 0.45); g.fill(); g.restore();
      // body: lit from above, rolling off into shadow
      tracePart(g, p);
      if (p.glass) {
        const gg = g.createLinearGradient(0, y0, 0, y1);
        gg.addColorStop(0, "rgba(190, 220, 240, 0.95)"); gg.addColorStop(0.4, "rgba(60, 90, 120, 1)"); gg.addColorStop(1, "rgba(20, 30, 50, 1)");
        g.fillStyle = gg; g.fill();
        continue;
      }
      const lg = g.createLinearGradient(0, y0, 0, y1);
      lg.addColorStop(0, c3(tone(c, 0.2), 1));
      lg.addColorStop(0.45, c3(c, 1));
      lg.addColorStop(1, c3(tone(c, -0.42), 1));
      g.fillStyle = lg; g.fill();
      if (!detail) continue;
      g.save(); tracePart(g, p); g.clip();
      if (p.solar) {
        // solar cells: a fine grid with a sky sheen
        g.strokeStyle = "rgba(170, 200, 240, 0.35)"; g.lineWidth = lw;
        g.beginPath();
        for (let x = x0; x <= x1; x += 0.07) { g.moveTo(x, y0); g.lineTo(x, y1); }
        for (let y = y0; y <= y1; y += 0.07) { g.moveTo(x0, y); g.lineTo(x1, y); }
        g.stroke();
      }
      if (p.panel) {
        // plate seams across the hull, a lengthwise seam, and a few odd plates
        g.strokeStyle = c3(tone(c, -0.6), 0.45); g.lineWidth = lw;
        g.beginPath();
        for (let x = x0 + p.panel * (0.4 + r() * 0.6); x < x1; x += p.panel * (0.7 + r() * 0.6)) { g.moveTo(x, y0); g.lineTo(x, y1); }
        if (y1 - y0 > 0.12) { const ym = (y0 + y1) / 2 + (r() - 0.5) * 0.04; g.moveTo(x0, ym); g.lineTo(x1, ym); }
        g.stroke();
        const n = fine ? 7 : 3;
        for (let i = 0; i < n; i++) {
          const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0), w = p.panel * (0.4 + r() * 0.8), h = (y1 - y0) * (0.15 + r() * 0.3);
          g.fillStyle = r() < 0.5 ? "rgba(255, 250, 235, 0.07)" : "rgba(0, 0, 10, 0.1)";
          g.fillRect(x, y, w, h);
        }
        if (fine) {
          // highlight seam on the upper edge of each plate row
          g.strokeStyle = c3(tone(c, 0.35), 0.25);
          g.beginPath(); g.moveTo(x0, y0 + 0.012); g.lineTo(x1, y0 + 0.012); g.stroke();
        }
      }
      if (p.radiator) {
        g.strokeStyle = c3(tone(c, -0.5), 0.5); g.lineWidth = lw;
        g.beginPath();
        for (let y = y0; y < y1; y += 0.045) { g.moveTo(x0 - 0.1, y); g.lineTo(x1 + 0.1, y); }
        g.stroke();
      }
      if (p.hangar && fine) {
        g.fillStyle = "rgba(10, 12, 24, 0.75)";
        g.fillRect(x0 + 0.04, p.cy - 0.035, x1 - x0 - 0.08, 0.07);
        g.fillStyle = wreck ? "rgba(255, 190, 120, 0.15)" : "rgba(255, 214, 150, 0.35)";
        g.fillRect(x0 + 0.06, p.cy - 0.01, x1 - x0 - 0.12, 0.02);
      }
      if (p.greeble && R >= 26) {
        // grouped greebles: vents, blocks, tanks along the centreline
        const groups = fine ? 4 : 2;
        for (let i = 0; i < groups; i++) {
          const gx = x0 + (x1 - x0) * (0.15 + 0.7 * r()), gy = (y0 + y1) / 2 + (r() - 0.5) * (y1 - y0) * 0.5;
          const k = 2 + (r() * 2 | 0);
          for (let m = 0; m < k; m++) {
            const w = 0.025 + r() * 0.05, h = 0.02 + r() * 0.04, x = gx + m * (w + 0.012);
            g.fillStyle = c3(tone(c, -0.5), 0.55); g.fillRect(x + 0.006, gy + 0.006, w, h);
            g.fillStyle = c3(tone(c, 0.25 + r() * 0.15), 0.9); g.fillRect(x, gy, w, h);
          }
        }
      }
      g.restore();
      // windows: tiny warm lights in rows along the edges (scale cue)
      if (p.win && R >= 22) {
        const step = fine ? 0.035 : 0.06, wr = Math.max(0.6 * px, 0.008), lit = wreck ? 0.08 : 0.72;
        const along = p.ring ? 0 : 1;
        for (let s = -1; s <= 1; s += 2) {
          if (along) {
            for (let x = p.x0 + 0.05; x < p.x1 - 0.04; x += step) {
              const w = p.k === "box" ? p.w0 + (p.w1 - p.w0) * (x - p.x0) / (p.x1 - p.x0) : 0;
              const y = (p.cy || 0) + s * Math.max(0.02, w - 0.035);
              const on = r() < lit;
              g.fillStyle = on ? (r() < 0.85 ? "rgba(255, 214, 150, 0.95)" : "rgba(190, 225, 255, 0.9)") : "rgba(20, 20, 30, 0.5)";
              g.fillRect(x, y - wr, wr * 2.2, wr * 2);
            }
          } else {
            for (let y = -p.w0 + 0.05; y < p.w0 - 0.04; y += step) {
              if (Math.abs(y) < 0.2) continue;
              g.fillStyle = r() < lit ? "rgba(255, 214, 150, 0.95)" : "rgba(20, 20, 30, 0.5)";
              g.fillRect((p.x0 + p.x1) / 2 + s * 0.025 - wr, y, wr * 2, wr * 2.2);
            }
          }
        }
      }
    }
    if (aftOn) g.restore();
  }

  // engine nozzles (the living glow is drawn live, breathing gently)
  for (const [x, y, s] of d.eng) {
    g.beginPath(); g.ellipse(x, y, s * 0.45, s, 0, 0, TAU);
    g.fillStyle = c3(tone(base, -0.55), 1); g.fill();
    g.strokeStyle = c3(tone(base, 0.25), 0.8); g.lineWidth = lw * 1.4; g.stroke();
    if (!wreck) {
      g.beginPath(); g.ellipse(x, y, s * 0.25, s * 0.6, 0, 0, TAU);
      g.fillStyle = "rgba(170, 215, 255, 0.55)"; g.fill();
    }
  }
  // steady nav lights (port red / starboard green), never blinking
  if (!wreck && R >= 14) {
    for (const [x, y] of d.nav) {
      const rr = Math.max(0.9 * px, 0.022);
      g.fillStyle = "rgba(255, 120, 110, 0.9)"; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
      g.fillStyle = "rgba(130, 240, 170, 0.9)"; g.beginPath(); g.arc(x, -y, rr, 0, TAU); g.fill();
    }
  }

  if (wreck) {
    // scorch, then torn plates with the frame ribs showing through
    g.globalCompositeOperation = "source-atop";
    for (const [x, y, s] of d.holes) {
      const sg = g.createRadialGradient(x, y, 0, x, y, s * 2.6);
      sg.addColorStop(0, "rgba(22, 14, 12, 0.75)"); sg.addColorStop(0.5, "rgba(40, 26, 20, 0.35)"); sg.addColorStop(1, "rgba(40, 26, 20, 0)");
      g.fillStyle = sg; g.fillRect(x - s * 3, y - s * 3, s * 6, s * 6);
    }
    if (detail) {
      // streaks of soot trailing back from the damage
      for (const [x, y, s] of d.holes) {
        const sg = g.createLinearGradient(x, 0, x - s * 5, 0);
        sg.addColorStop(0, "rgba(20, 14, 14, 0.35)"); sg.addColorStop(1, "rgba(20, 14, 14, 0)");
        g.fillStyle = sg; g.fillRect(x - s * 5, y - s * 0.5, s * 5, s);
      }
    }
    g.globalCompositeOperation = "source-over";
    if (detail) {
      for (const [x, y, s, seed] of d.holes) {
        const hr = rng(seed), n = 7, pts = [];
        for (let i = 0; i < n; i++) { const a = i / n * TAU, rr = s * (0.55 + hr() * 0.6); pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8); }
        const trace = () => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); };
        g.globalCompositeOperation = "destination-out"; trace(); g.fillStyle = "#000"; g.fill();
        g.globalCompositeOperation = "source-over";
        g.save(); trace(); g.clip();
        g.fillStyle = "rgba(14, 12, 22, 0.35)"; g.fillRect(x - s * 2, y - s * 2, s * 4, s * 4);
        g.strokeStyle = c3(tone(base, -0.35), 0.7); g.lineWidth = Math.max(0.6 * px, s * 0.07);
        g.beginPath();
        for (let k = -1; k <= 1; k++) { g.moveTo(x + k * s * 0.5 + s * 0.1, y - s * 1.2); g.lineTo(x + k * s * 0.5 - s * 0.1, y + s * 1.2); }
        g.stroke();
        g.restore();
        trace(); g.strokeStyle = "rgba(30, 18, 14, 0.8)"; g.lineWidth = lw * 1.5; g.stroke();
      }
    }
    if (d.brk) {
      // the snapped spine: jagged dark edges and a few shards between the halves
      const bx = d.brk.x;
      g.fillStyle = c3(tone(base, -0.35), 0.9);
      for (let i = 0; i < 5; i++) {
        const sx = bx + (r() - 0.6) * 0.12, sy = (r() - 0.5) * 0.5, s = 0.015 + r() * 0.03;
        g.beginPath(); g.moveTo(sx, sy - s); g.lineTo(sx + s * 1.6, sy); g.lineTo(sx, sy + s * 0.7); g.lineTo(sx - s, sy); g.closePath(); g.fill();
      }
    }
  }
  // faint grain so large hulls don't read as flat vector fills
  if (fine) {
    g.globalCompositeOperation = "source-atop";
    for (let i = 0; i < 260; i++) {
      g.fillStyle = r() < 0.5 ? "rgba(255, 250, 240, 0.05)" : "rgba(0, 0, 10, 0.07)";
      g.fillRect((r() - 0.5) * 2.9, (r() - 0.5) * 2.2, px * 1.5, px * 1.5);
    }
    g.globalCompositeOperation = "source-over";
  }
  g.restore();
}

// ─── Live drawing (render.js) ───
let glowC = null;
function glow() {
  if (glowC) return glowC;
  glowC = document.createElement("canvas");
  glowC.width = glowC.height = 64;
  const g = glowC.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(225, 240, 255, 0.9)");
  gr.addColorStop(0.25, "rgba(150, 200, 255, 0.45)");
  gr.addColorStop(1, "rgba(110, 160, 255, 0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return glowC;
}

// Break-apart: the sprite cut into a few hull plates (made once per sprite)
function piecesFor(sp) {
  if (sp.pieces) return sp.pieces;
  const n = 4, size = sp.c.width, h = size / 2, out = [];
  const a0 = (sp.b * 0.37) % 1 * TAU;
  for (let i = 0; i < n; i++) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    g.drawImage(sp.c, 0, 0);
    g.globalCompositeOperation = "destination-in";
    const a = a0 + i / n * TAU, b = a0 + (i + 1) / n * TAU;
    g.beginPath(); g.moveTo(h + Math.cos(a + 1) * size * 0.03, h + Math.sin(a + 1) * size * 0.03);
    // jagged tear lines out to the edge
    for (let k = 1; k <= 4; k++) { const rr = size * 0.18 * k, w = (k & 1 ? 0.12 : -0.08); g.lineTo(h + Math.cos(a + w) * rr, h + Math.sin(a + w) * rr); }
    g.lineTo(h + Math.cos((a + b) / 2) * size, h + Math.sin((a + b) / 2) * size);
    for (let k = 4; k >= 1; k--) { const rr = size * 0.18 * k, w = (k & 1 ? -0.1 : 0.09); g.lineTo(h + Math.cos(b + w) * rr, h + Math.sin(b + w) * rr); }
    g.closePath(); g.fillStyle = "#000"; g.fill();
    out.push({ c, a: (a + b) / 2, spin: (i & 1 ? 1 : -1) * (0.5 + i * 0.15) });
  }
  sp.pieces = out;
  return out;
}

/**
 * Draw a ship entity. d = drawn sprite width at full size; rot = heading.
 * Living ships keep their warm rim on top (they're mirror-symmetric, so a
 * flip only swaps which edge is lit). Eaten ships split into plates that
 * spiral softly into the hole.
 */
export function drawShip(ctx, e, sp, sx, sy, d, alpha, breath, still) {
  let rot = e.rotation;
  if (e.consuming && !still) {
    const p = e.consumeProgress, q = p * p * (3 - 2 * p);
    const pieces = piecesFor(sp), spin = rot + q * (e.swallow ? 2.4 : 1.8);
    const k = 1 - q * 0.8, dd = d * k, out = Math.sin(q * Math.PI) * d * 0.16;
    ctx.globalAlpha = alpha * (1 - q * q);
    for (let i = 0; i < pieces.length; i++) {
      const pc = pieces[i], a = pc.a + spin;
      const tx = sx + Math.cos(a) * out, ty = sy + Math.sin(a) * out, pr = spin + pc.spin * q;
      ctx.translate(tx, ty);
      ctx.rotate(pr);
      ctx.drawImage(pc.c, -dd / 2, -dd / 2, dd, dd);
      ctx.rotate(-pr);
      ctx.translate(-tx, -ty);
    }
    return;
  }
  if (e.consuming) { const p = e.consumeProgress; ctx.globalAlpha = alpha * (1 - p); d *= 1 - p * 0.8; }
  const flip = e.steer && Math.cos(rot) < 0;
  ctx.translate(sx, sy);
  ctx.rotate(rot);
  if (flip) ctx.scale(1, -1);
  ctx.drawImage(sp.c, -d / 2, -d / 2, d, d);
  if (e.steer && !e.consuming) {
    // engine glow: dim, breathing slowly with the galaxy (never flickers)
    const des = design(e.ship || "drone", ((e.look | 0) % SHIP_LOOKS + SHIP_LOOKS) % SHIP_LOOKS);
    const R = d / (2 * shipExtent(e.ship)), gc = glow();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha * (0.38 + breath * 0.17);
    for (let i = 0; i < des.eng.length; i++) {
      const en = des.eng[i], s = en[2] * R * 2.6;
      ctx.drawImage(gc, en[0] * R - s * 1.6, en[1] * R - s * 0.5, s * 2, s);
    }
    ctx.globalCompositeOperation = "source-over";
  }
  if (flip) ctx.scale(1, -1);
  ctx.rotate(-rot);
  ctx.translate(-sx, -sy);
}
