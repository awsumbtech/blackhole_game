// ─── ART (v4) ───
// Soft, painterly procedural art. Every object is painted once into a small
// cached canvas keyed by type / colour / variant / on-screen size, then just
// stamped each frame. Nothing here runs per-frame except cache lookups.

const TAU = Math.PI * 2;

// ─── Quality ───
let quality = "high";             // "high" | "balanced"
let cacheGen = 0;
export function setArtQuality(q) {
  if (q === quality) return;
  quality = q;
  cacheGen++;
  cache.clear();
  baseIndex.clear();
  diskCache.clear();
}
export function getArtQuality() { return quality; }

// On-screen radius buckets (device px). Sprites are painted at the bucket at or
// just above the real size, so they are always downscaled (crisp, never blurry).
const BUCKETS = [3, 4, 6, 8, 11, 15, 20, 27, 36, 48, 64, 85, 112, 150];
function bucketFor(rpx) {
  const cap = quality === "high" ? 150 : 85;
  const r = Math.min(rpx, cap);
  for (const b of BUCKETS) if (b >= r * 0.9) return b;
  return BUCKETS[BUCKETS.length - 1];
}

// ─── Colour helpers ───
const rgbCache = new Map();
function rgb(hex) {
  let v = rgbCache.get(hex);
  if (v) return v;
  const h = hex.replace("#", "");
  v = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  rgbCache.set(hex, v);
  return v;
}
function mix(hex, to, t, a = 1) {
  const c = rgb(hex);
  const r = Math.round(c[0] + (to[0] - c[0]) * t);
  const g = Math.round(c[1] + (to[1] - c[1]) * t);
  const b = Math.round(c[2] + (to[2] - c[2]) * t);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
const WHITE = [255, 255, 245];
const BLACK = [6, 6, 18];
const light = (hex, t, a) => mix(hex, WHITE, t, a);
const dark = (hex, t, a) => mix(hex, BLACK, t, a);
const rgba = (hex, a) => mix(hex, WHITE, 0, a);

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Sprite cache ───
const cache = new Map();          // key -> { c, size, ext, used }
const baseIndex = new Map();      // baseKey -> Set(bucket) for fallbacks
let frameNo = 0;
let genBudget = 0;
let genMs = 0;                    // time spent painting this frame
let generated = 0;
const MAX_SPRITES = 600;

/** Call once per frame before drawing. */
export function beginArtFrame() {
  frameNo++;
  genBudget = quality === "high" ? 6 : 3;
  genMs = 0;
  if (cache.size > MAX_SPRITES && frameNo % 30 === 0) evict();
}
export function artStats() { return { sprites: cache.size, generated, quality }; }

function evict() {
  const arr = [...cache.entries()].sort((a, b) => a[1].used - b[1].used);
  for (let i = 0; i < arr.length - MAX_SPRITES * 0.8; i++) {
    cache.delete(arr[i][0]);
    const [base, b] = splitKey(arr[i][0]);
    baseIndex.get(base)?.delete(b);
  }
}
function splitKey(k) { const i = k.lastIndexOf("|"); return [k.slice(0, i), +k.slice(i + 1)]; }

/** How far (in radii) each type's art extends from the centre. */
function extentFor(type, variant) {
  switch (type) {
    case "star": return 2.7;
    case "neutron": return 3.1;
    case "comet": return 2.3;
    case "planet": return variant === 0 ? 2.0 : variant === 1 ? 1.65 : 1.3;
    case "meteor": return 1.5;
    case "system": return 2.5;
    case "nebula": return 1.7;
    case "cluster": return 1.9;
    case "galaxy": return 1.7;
    case "dust": return 1.5;
    default: return 1.3;
  }
}

function baseKeyFor(e) {
  return `${e.type}|${e.color}|${e.bands ? e.bands[0] : ""}|${e.variant || 0}`;
}

/** Returns { c, size } where size is the drawn width in entity radii*2 units. */
export function spriteFor(e, rpx) {
  // Hysteresis: keep the current sprite while the on-screen size stays close,
  // so a slowly zooming camera doesn't repaint everything every few frames.
  const cur = e._sp;
  if (cur && cur.g === cacheGen && e._artBase && rpx <= cur.b * 1.05 && rpx >= cur.b * 0.62) { cur.used = frameNo; return cur; }
  const b = bucketFor(rpx);
  const base = e._artBase || (e._artBase = baseKeyFor(e));
  const key = base + "|" + b;
  let s = cache.get(key);
  if (!s) {
    const have = baseIndex.get(base);
    if ((genBudget <= 0 || genMs > 2.5) && have && have.size) {
      // Over this frame's budget: use the closest size we already have
      let best = null, bd = Infinity;
      for (const hb of have) { const d = Math.abs(Math.log(hb / b)); if (d < bd) { bd = d; best = hb; } }
      s = cache.get(base + "|" + best);
    }
    if (!s) {
      genBudget--;
      const t0 = performance.now();
      s = paint(e, b);
      genMs += performance.now() - t0;
      cache.set(key, s);
      if (!have) baseIndex.set(base, new Set([b])); else have.add(b);
    }
  }
  s.used = frameNo;
  e._sp = s;
  return s;
}

function makeCanvas(size) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

function paint(e, b) {
  generated++;
  const variant = e.variant || 0;
  const ext = extentFor(e.type, variant);
  const size = Math.ceil(b * ext * 2) + 2;
  const c = makeCanvas(size);
  const g = c.getContext("2d");
  g.translate(size / 2, size / 2);
  const r = rng(e.seed || 7);
  const painter = PAINTERS[e.type] || PAINTERS.dust;
  painter(g, b, e, r, variant);
  // `scale` converts canvas px to entity radii: drawn width = size / b * radius
  return { c, k: size / b, b, g: cacheGen, used: frameNo };
}

// ─── Painters (g is centred; R = radius in canvas px) ───

const PAINTERS = {
  dust(g, R, e) {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.5);
    gr.addColorStop(0, light(e.color, 0.35, 0.95));
    gr.addColorStop(0.45, rgba(e.color, 0.7));
    gr.addColorStop(1, rgba(e.color, 0));
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, R * 1.5, 0, TAU); g.fill();
  },

  junk(g, R, e, r) {
    const n = 6 + Math.floor(r() * 3);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r() * 0.5;
      const d = R * (0.68 + r() * 0.32);
      pts.push([Math.cos(a) * d, Math.sin(a) * d]);
    }
    path(g, pts);
    const lg = g.createLinearGradient(-R, -R, R, R);
    lg.addColorStop(0, light(e.color, 0.3));
    lg.addColorStop(0.55, rgba(e.color, 1));
    lg.addColorStop(1, dark(e.color, 0.45));
    g.fillStyle = lg;
    g.fill();
    g.lineWidth = Math.max(0.6, R * 0.09);
    g.strokeStyle = light(e.color, 0.5, 0.3);
    g.stroke();
    if (R > 6) {
      g.save(); path(g, pts); g.clip();
      g.strokeStyle = dark(e.color, 0.5, 0.35);
      g.lineWidth = Math.max(0.5, R * 0.05);
      for (let i = 0; i < 2; i++) {
        const y = (r() - 0.5) * R;
        g.beginPath(); g.moveTo(-R, y); g.lineTo(R, y + (r() - 0.5) * R * 0.4); g.stroke();
      }
      g.restore();
    }
  },

  meteor(g, R, e, r) {
    const halo = g.createRadialGradient(0, 0, R * 0.8, 0, 0, R * 1.5);
    halo.addColorStop(0, rgba(e.color, 0.14));
    halo.addColorStop(1, rgba(e.color, 0));
    g.fillStyle = halo;
    g.beginPath(); g.arc(0, 0, R * 1.5, 0, TAU); g.fill();

    const n = 12;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const d = R * (0.84 + r() * 0.16);
      pts.push([Math.cos(a) * d, Math.sin(a) * d]);
    }
    smoothPath(g, pts);
    const rg = g.createRadialGradient(-R * 0.35, -R * 0.35, R * 0.1, 0, 0, R * 1.15);
    rg.addColorStop(0, light(e.color, 0.35));
    rg.addColorStop(0.5, rgba(e.color, 1));
    rg.addColorStop(1, dark(e.color, 0.55));
    g.fillStyle = rg;
    g.fill();
    if (R > 5) {
      g.save(); smoothPath(g, pts); g.clip();
      const craters = 2 + Math.floor(r() * 3);
      for (let i = 0; i < craters; i++) {
        const a = r() * TAU, d = r() * R * 0.55, cr = R * (0.12 + r() * 0.14);
        const cx = Math.cos(a) * d, cy = Math.sin(a) * d;
        const cg = g.createRadialGradient(cx - cr * 0.2, cy - cr * 0.2, 0, cx, cy, cr);
        cg.addColorStop(0, dark(e.color, 0.45, 0.45));
        cg.addColorStop(0.7, dark(e.color, 0.3, 0.25));
        cg.addColorStop(1, dark(e.color, 0.2, 0));
        g.fillStyle = cg;
        g.beginPath(); g.arc(cx, cy, cr, 0, TAU); g.fill();
        g.strokeStyle = light(e.color, 0.4, 0.25);
        g.lineWidth = Math.max(0.5, cr * 0.3);
        g.beginPath(); g.arc(cx, cy, cr, 0.2 * Math.PI, 0.9 * Math.PI); g.stroke();
      }
      g.restore();
    }
  },

  comet(g, R, e) {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, R * 2.3);
    gr.addColorStop(0, "rgba(255, 255, 255, 0.98)");
    gr.addColorStop(0.16, light(e.color, 0.55, 0.9));
    gr.addColorStop(0.42, rgba(e.color, 0.35));
    gr.addColorStop(1, rgba(e.color, 0));
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, R * 2.3, 0, TAU); g.fill();
  },

  craft(g, R, e, r) {
    // A long, quiet hull: nose, body, two fins
    const L = R * 1.15, W = R * (0.42 + r() * 0.12);
    const pts = [[L, 0], [L * 0.35, -W], [-L * 0.55, -W * 0.95], [-L * 0.8, -W * 1.5], [-L, -W * 0.7],
      [-L, W * 0.7], [-L * 0.8, W * 1.5], [-L * 0.55, W * 0.95], [L * 0.35, W]];
    path(g, pts);
    // Weathered, muted hull (the base colour is only a tint)
    const hull = mix(e.color, [70, 74, 96], 0.6);
    const lg = g.createLinearGradient(0, -W * 1.4, 0, W * 1.4);
    lg.addColorStop(0, light(e.color, 0.12, 1));
    lg.addColorStop(0.45, hull);
    lg.addColorStop(1, dark(e.color, 0.65));
    g.fillStyle = lg;
    g.fill();
    g.strokeStyle = light(e.color, 0.55, 0.3);
    g.lineWidth = Math.max(0.6, R * 0.05);
    g.stroke();
    if (R > 7) {
      g.save(); path(g, pts); g.clip();
      g.strokeStyle = dark(e.color, 0.5, 0.4);
      g.lineWidth = Math.max(0.5, R * 0.035);
      for (let i = 1; i <= 3; i++) {
        const x = L * 0.35 - i * L * 0.4;
        g.beginPath(); g.moveTo(x, -W * 1.2); g.lineTo(x, W * 1.2); g.stroke();
      }
      g.restore();
      // A few warm windows
      for (let i = 0; i < 3; i++) {
        const x = L * (0.2 - i * 0.28), y = (i % 2 ? -1 : 1) * W * 0.35;
        const wg = g.createRadialGradient(x, y, 0, x, y, R * 0.12);
        wg.addColorStop(0, "rgba(255, 226, 160, 0.85)");
        wg.addColorStop(1, "rgba(255, 226, 160, 0)");
        g.fillStyle = wg;
        g.beginPath(); g.arc(x, y, R * 0.12, 0, TAU); g.fill();
      }
    }
  },

  planet(g, R, e, r, variant) {
    const bands = e.bands || [e.color, light(e.color, 0.2), dark(e.color, 0.2)];
    const ringTilt = -0.35 + r() * 0.7;
    const ringCol = bands[2] || bands[0];
    const ring = (front) => {
      g.save();
      g.rotate(ringTilt);
      g.beginPath();
      g.rect(-R * 2, front ? 0 : -R * 2, R * 4, R * 2);
      g.clip();
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.ellipse(0, 0, R * (1.4 + i * 0.13), R * (0.36 + i * 0.035), 0, 0, TAU);
        g.strokeStyle = light(ringCol, 0.35, 0.18 + (i % 2) * 0.14);
        g.lineWidth = Math.max(0.6, R * 0.08);
        g.stroke();
      }
      g.restore();
    };
    if (variant === 0) ring(false);

    // Atmosphere glow
    const at = g.createRadialGradient(0, 0, R * 0.9, 0, 0, R * 1.28);
    at.addColorStop(0, light(bands[1] || bands[0], 0.4, 0.38));
    at.addColorStop(1, light(bands[1] || bands[0], 0.4, 0));
    g.fillStyle = at;
    g.beginPath(); g.arc(0, 0, R * 1.28, 0, TAU); g.fill();

    // Soft cloud bands
    g.save();
    g.beginPath(); g.arc(0, 0, R, 0, TAU); g.clip();
    g.fillStyle = bands[1] || bands[0];
    g.fillRect(-R, -R, R * 2, R * 2);
    if ("filter" in g && R > 6) g.filter = `blur(${Math.max(0.6, R * 0.06).toFixed(1)}px)`;
    g.rotate(-0.25 + r() * 0.5);
    const nb = 5 + Math.floor(r() * 3);
    let y = -R * 1.2;
    for (let i = 0; i < nb; i++) {
      const hgt = (R * 2.4 / nb) * (0.6 + r() * 0.8);
      g.fillStyle = bands[i % bands.length];
      g.globalAlpha = 0.65 + r() * 0.35;
      g.beginPath();
      g.ellipse(0, y + hgt / 2, R * 1.4, hgt / 2, 0, 0, TAU);
      g.fill();
      y += hgt * 0.85;
    }
    g.globalAlpha = 0.14;
    g.fillStyle = "#ffffff";
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.ellipse((r() - 0.5) * R, (r() - 0.5) * R * 1.4, R * (0.3 + r() * 0.4), R * 0.07, 0, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
    g.filter = "none";
    g.rotate(0);
    g.restore();

    // Lit from the upper left
    g.save();
    g.beginPath(); g.arc(0, 0, R, 0, TAU); g.clip();
    const sh = g.createRadialGradient(-R * 0.45, -R * 0.45, R * 0.05, -R * 0.1, -R * 0.1, R * 1.45);
    sh.addColorStop(0, "rgba(255, 252, 235, 0.22)");
    sh.addColorStop(0.42, "rgba(0, 0, 0, 0)");
    sh.addColorStop(1, "rgba(2, 3, 14, 0.85)");
    g.fillStyle = sh;
    g.fillRect(-R, -R, R * 2, R * 2);
    g.restore();

    if (variant === 0) ring(true);
    if (variant === 1) {
      const mx = R * 1.32, my = -R * 0.72, mr = R * 0.2;
      const mg = g.createRadialGradient(mx - mr * 0.4, my - mr * 0.4, 0, mx, my, mr);
      mg.addColorStop(0, "rgba(230, 230, 240, 1)");
      mg.addColorStop(1, "rgba(80, 84, 104, 1)");
      g.fillStyle = mg;
      g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
    }
  },

  star(g, R, e, r) {
    const co = g.createRadialGradient(0, 0, R * 0.8, 0, 0, R * 2.7);
    co.addColorStop(0, rgba(e.color, 0.5));
    co.addColorStop(0.3, rgba(e.color, 0.16));
    co.addColorStop(1, rgba(e.color, 0));
    g.fillStyle = co;
    g.beginPath(); g.arc(0, 0, R * 2.7, 0, TAU); g.fill();
    // Very soft rays
    g.save();
    g.globalCompositeOperation = "lighter";
    const rays = 6;
    const off = r() * TAU;
    for (let i = 0; i < rays; i++) {
      g.rotate(TAU / rays + off * (i === 0 ? 1 : 0));
      const rg = g.createLinearGradient(0, 0, R * 2.5, 0);
      rg.addColorStop(0, rgba(e.color, 0.12));
      rg.addColorStop(1, rgba(e.color, 0));
      g.fillStyle = rg;
      g.beginPath(); g.ellipse(R * 1.1, 0, R * 1.5, R * 0.1, 0, 0, TAU); g.fill();
    }
    g.restore();
    // Core with limb darkening
    const cg = g.createRadialGradient(-R * 0.15, -R * 0.15, 0, 0, 0, R);
    cg.addColorStop(0, "rgba(255, 252, 236, 1)");
    cg.addColorStop(0.45, light(e.color, 0.4));
    cg.addColorStop(0.85, rgba(e.color, 1));
    cg.addColorStop(1, mix(e.color, [255, 140, 60], 0.3));
    g.fillStyle = cg;
    g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
    if (R > 10) {
      g.save();
      g.beginPath(); g.arc(0, 0, R, 0, TAU); g.clip();
      if ("filter" in g) g.filter = `blur(${(R * 0.08).toFixed(1)}px)`;
      g.fillStyle = "rgba(255, 255, 230, 0.12)";
      for (let i = 0; i < 6; i++) {
        g.beginPath(); g.arc((r() - 0.5) * R * 1.4, (r() - 0.5) * R * 1.4, R * (0.12 + r() * 0.18), 0, TAU); g.fill();
      }
      g.filter = "none";
      g.restore();
    }
  },

  neutron(g, R, e) {
    const gl = g.createRadialGradient(0, 0, 0, 0, 0, R * 3.1);
    gl.addColorStop(0, "rgba(255, 255, 255, 1)");
    gl.addColorStop(0.18, light(e.color, 0.4, 0.8));
    gl.addColorStop(0.45, rgba(e.color, 0.22));
    gl.addColorStop(1, rgba(e.color, 0));
    g.fillStyle = gl;
    g.beginPath(); g.arc(0, 0, R * 3.1, 0, TAU); g.fill();
    g.beginPath();
    g.ellipse(0, 0, R * 1.9, R * 0.55, -0.4, 0, TAU);
    g.strokeStyle = light(e.color, 0.3, 0.28);
    g.lineWidth = Math.max(0.6, R * 0.12);
    g.stroke();
  }
};

// v5: bigger layers of the universe
Object.assign(PAINTERS, {
  moon(g, R, e, r) {
    PAINTERS.planet(g, R, e, r, 2);
    if (R < 5) return;
    g.save();
    g.beginPath(); g.arc(0, 0, R, 0, TAU); g.clip();
    for (let i = 0; i < 4; i++) {
      const a = r() * TAU, d = r() * R * 0.7, cr = R * (0.1 + r() * 0.14);
      const cx = Math.cos(a) * d, cy = Math.sin(a) * d;
      const cg = g.createRadialGradient(cx, cy, 0, cx, cy, cr);
      cg.addColorStop(0, "rgba(40, 42, 56, 0.35)");
      cg.addColorStop(1, "rgba(40, 42, 56, 0)");
      g.fillStyle = cg;
      g.beginPath(); g.arc(cx, cy, cr, 0, TAU); g.fill();
    }
    g.restore();
  },

  system(g, R, e, r) {
    // A small sun with faint orbits and a few worlds
    const halo = g.createRadialGradient(0, 0, 0, 0, 0, R * 2.5);
    halo.addColorStop(0, rgba(e.color, 0.22));
    halo.addColorStop(1, rgba(e.color, 0));
    g.fillStyle = halo;
    g.beginPath(); g.arc(0, 0, R * 2.5, 0, TAU); g.fill();
    g.lineWidth = Math.max(0.5, R * 0.03);
    const worlds = ["#7fc8e8", "#d8a878", "#9ad8a0", "#c8b0f0"];
    for (let i = 0; i < 3; i++) {
      const rr = R * (0.9 + i * 0.55);
      g.strokeStyle = rgba(e.color, 0.16);
      g.beginPath(); g.arc(0, 0, rr, 0, TAU); g.stroke();
      const a = r() * TAU, pr = R * (0.1 + r() * 0.08);
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      const pg = g.createRadialGradient(px - pr * 0.3, py - pr * 0.3, 0, px, py, pr);
      pg.addColorStop(0, light(worlds[i], 0.3));
      pg.addColorStop(1, dark(worlds[i], 0.4));
      g.fillStyle = pg;
      g.beginPath(); g.arc(px, py, pr, 0, TAU); g.fill();
    }
    const cg = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.55);
    cg.addColorStop(0, "rgba(255, 252, 236, 1)");
    cg.addColorStop(0.5, light(e.color, 0.3, 0.95));
    cg.addColorStop(1, rgba(e.color, 0));
    g.fillStyle = cg;
    g.beginPath(); g.arc(0, 0, R * 0.55, 0, TAU); g.fill();
  },

  nebula(g, R, e, r) {
    // Soft overlapping clouds, a second hue, a few newborn stars
    const hues = [e.color, mix(e.color, [255, 160, 210], 0.4), mix(e.color, [120, 220, 255], 0.4)];
    if ("filter" in g && R > 8) g.filter = `blur(${(R * 0.08).toFixed(1)}px)`;
    for (let i = 0; i < 7; i++) {
      const a = r() * TAU, d = r() * R * 0.6, cr = R * (0.45 + r() * 0.5);
      const cx = Math.cos(a) * d, cy = Math.sin(a) * d * 0.8;
      const cg = g.createRadialGradient(cx, cy, 0, cx, cy, cr);
      const h = hues[i % 3];
      cg.addColorStop(0, rgba(h, 0.32));
      cg.addColorStop(0.6, rgba(h, 0.12));
      cg.addColorStop(1, rgba(h, 0));
      g.fillStyle = cg;
      g.beginPath(); g.arc(cx, cy, cr, 0, TAU); g.fill();
    }
    g.filter = "none";
    g.fillStyle = "rgba(255, 250, 240, 0.85)";
    for (let i = 0; i < 6; i++) {
      g.beginPath(); g.arc((r() - 0.5) * R * 1.2, (r() - 0.5) * R, Math.max(0.6, R * 0.025), 0, TAU); g.fill();
    }
  },

  cluster(g, R, e, r) {
    const halo = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.9);
    halo.addColorStop(0, rgba(e.color, 0.4));
    halo.addColorStop(0.4, rgba(e.color, 0.12));
    halo.addColorStop(1, rgba(e.color, 0));
    g.fillStyle = halo;
    g.beginPath(); g.arc(0, 0, R * 1.9, 0, TAU); g.fill();
    const n = R > 10 ? 60 : 25;
    for (let i = 0; i < n; i++) {
      const d = Math.pow(r(), 1.8) * R * 1.3, a = r() * TAU;
      const sr = Math.max(0.5, R * (0.02 + r() * 0.035));
      g.fillStyle = i % 5 ? "rgba(255, 248, 230, 0.9)" : "rgba(190, 210, 255, 0.9)";
      g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, sr, 0, TAU); g.fill();
    }
  },

  galaxy(g, R, e, r) {
    // A tilted spiral: soft core and two arms of tiny lights
    g.save();
    g.rotate(r() * TAU);
    g.scale(1, 0.55 + r() * 0.3);
    const halo = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.6);
    halo.addColorStop(0, rgba(e.color, 0.3));
    halo.addColorStop(1, rgba(e.color, 0));
    g.fillStyle = halo;
    g.beginPath(); g.arc(0, 0, R * 1.6, 0, TAU); g.fill();
    const n = R > 10 ? 180 : 60;
    for (let i = 0; i < n; i++) {
      const arm = i % 2, t = r();
      const ang = arm * Math.PI + t * 4.2 + (r() - 0.5) * 0.5;
      const d = R * (0.12 + t * 1.25);
      g.fillStyle = t < 0.3 ? "rgba(255, 236, 200, 0.55)" : (r() < 0.3 ? "rgba(180, 200, 255, 0.6)" : rgba(e.color, 0.5));
      g.beginPath(); g.arc(Math.cos(ang) * d, Math.sin(ang) * d, Math.max(0.5, R * 0.03 * (1 - t * 0.5)), 0, TAU); g.fill();
    }
    const core = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.4);
    core.addColorStop(0, "rgba(255, 250, 235, 0.95)");
    core.addColorStop(1, "rgba(255, 230, 190, 0)");
    g.fillStyle = core;
    g.beginPath(); g.arc(0, 0, R * 0.4, 0, TAU); g.fill();
    g.restore();
  }
});

function path(g, pts) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
}

function smoothPath(g, pts) {
  const n = pts.length;
  g.beginPath();
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let m = mid(pts[n - 1], pts[0]);
  g.moveTo(m[0], m[1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    m = mid(p, q);
    g.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  }
  g.closePath();
}

// ─── Comet tails (cached per colour + size, drawn rotated) ───
const tailCache = new Map();
export function tailFor(color, rpx) {
  const b = bucketFor(rpx);
  const key = color + "|" + b;
  let t = tailCache.get(key);
  if (t) return t;
  const len = Math.ceil(b * 9), hgt = Math.ceil(b * 2.4);
  const c = document.createElement("canvas");
  c.width = len; c.height = hgt;
  const g = c.getContext("2d");
  const cy = hgt / 2;
  const lg = g.createLinearGradient(0, 0, len, 0);
  lg.addColorStop(0, rgba(color, 0.55));
  lg.addColorStop(0.35, rgba(color, 0.22));
  lg.addColorStop(1, rgba(color, 0));
  g.fillStyle = lg;
  g.beginPath();
  g.moveTo(0, cy - b * 0.9);
  g.quadraticCurveTo(len * 0.4, cy - b * 0.7, len, cy);
  g.quadraticCurveTo(len * 0.4, cy + b * 0.7, 0, cy + b * 0.9);
  g.closePath();
  g.fill();
  const ig = g.createLinearGradient(0, 0, len * 0.6, 0);
  ig.addColorStop(0, "rgba(255, 255, 255, 0.45)");
  ig.addColorStop(1, "rgba(255, 255, 255, 0)");
  g.fillStyle = ig;
  g.beginPath(); g.ellipse(0, cy, len * 0.55, b * 0.22, 0, 0, TAU); g.fill();
  t = { c, k: b };
  tailCache.set(key, t);
  if (tailCache.size > 80) tailCache.delete(tailCache.keys().next().value);
  return t;
}

// ─── BLACK HOLE (accretion disk, photon ring, lensed arc) ───
// Disk textures are painted once per palette + size bucket, then rotated.

const PALETTES = {
  calm: { hot: [255, 242, 226], mid: [255, 186, 140], cool: [150, 136, 255] },
  double: { hot: [255, 238, 250], mid: [255, 146, 220], cool: [196, 120, 255] }
};
const diskCache = new Map();
const DISK_IN = 1.25, DISK_OUT = 2.25;  // in hole radii (v5: smaller footprint)

function lerp3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(Math.round);
}

function diskTexture(palette, b, layer) {
  const key = palette + "|" + b + "|" + layer;
  let d = diskCache.get(key);
  if (d) return d;
  const P = PALETTES[palette] || PALETTES.calm;
  const inner = layer === 0 ? DISK_IN : 1.6;
  const outer = layer === 0 ? 1.85 : DISK_OUT;
  const size = Math.ceil(b * outer * 2) + 2;
  const c = makeCanvas(size);
  const g = c.getContext("2d");
  g.translate(size / 2, size / 2);
  const colAt = t => (t < 0.5 ? lerp3(P.hot, P.mid, t * 2) : lerp3(P.mid, P.cool, (t - 0.5) * 2));

  // Soft base glow
  const base = g.createRadialGradient(0, 0, b * inner * 0.92, 0, 0, b * outer);
  const c0 = colAt(layer === 0 ? 0 : 0.45), c1 = colAt(layer === 0 ? 0.45 : 1);
  base.addColorStop(0, `rgba(${c0}, 0)`);
  base.addColorStop(0.12, `rgba(${c0}, ${layer === 0 ? 0.6 : 0.26})`);
  base.addColorStop(0.6, `rgba(${c1}, ${layer === 0 ? 0.26 : 0.13})`);
  base.addColorStop(1, `rgba(${c1}, 0)`);
  g.fillStyle = base;
  g.beginPath(); g.arc(0, 0, b * outer, 0, TAU); g.fill();

  // Painterly swirl streaks
  const r = rng(1234 + layer * 99 + b);
  g.globalCompositeOperation = "lighter";
  g.lineCap = "round";
  const n = quality === "high" ? (layer === 0 ? 70 : 90) : 45;
  for (let i = 0; i < n; i++) {
    const t = r();
    const rad = b * (inner + (outer - inner) * Math.pow(t, 0.8));
    const tt = (rad / b - DISK_IN) / (DISK_OUT - DISK_IN);
    const col = colAt(Math.min(1, Math.max(0, tt)));
    const a0 = r() * TAU, len = 0.4 + r() * 1.3;
    g.strokeStyle = `rgba(${col}, ${(0.07 + r() * 0.2) * (1 - tt * 0.5)})`;
    g.lineWidth = Math.max(0.6, b * (0.03 + r() * 0.09));
    g.beginPath();
    g.arc(0, 0, rad, a0, a0 + len);
    g.stroke();
  }
  d = { c, k: size / b };
  diskCache.set(key, d);
  if (diskCache.size > 24) diskCache.delete(diskCache.keys().next().value);
  return d;
}

let spinOuter = 0, spinInner = 0;
let glowSprite = null, glowB = 0, ringSprite = null, ringB = 0;

function holeSprites(b) {
  if (glowB !== b) {
    const size = Math.ceil(b * 3.0 * 2);
    glowSprite = makeCanvas(size);
    const g = glowSprite.getContext("2d");
    g.translate(size / 2, size / 2);
    const gr = g.createRadialGradient(0, 0, b * 0.9, 0, 0, b * 3.0);
    gr.addColorStop(0, "rgba(120, 120, 230, 0.16)");
    gr.addColorStop(0.35, "rgba(100, 100, 210, 0.06)");
    gr.addColorStop(1, "rgba(90, 90, 200, 0)");
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, b * 3.0, 0, TAU); g.fill();
    glowB = b;
  }
  if (ringB !== b) {
    const size = Math.ceil(b * 1.3 * 2);
    ringSprite = makeCanvas(size);
    const g = ringSprite.getContext("2d");
    g.translate(size / 2, size / 2);
    // Solid shadow with a soft edge, then a thin warm photon ring
    const sh = g.createRadialGradient(0, 0, b * 0.9, 0, 0, b * 1.12);
    sh.addColorStop(0, "rgba(1, 1, 4, 1)");
    sh.addColorStop(0.55, "rgba(1, 1, 4, 0.92)");
    sh.addColorStop(1, "rgba(1, 1, 4, 0)");
    g.fillStyle = sh;
    g.beginPath(); g.arc(0, 0, b * 1.12, 0, TAU); g.fill();
    const pr = g.createRadialGradient(0, 0, b * 0.97, 0, 0, b * 1.14);
    pr.addColorStop(0, "rgba(255, 238, 220, 0)");
    pr.addColorStop(0.35, "rgba(255, 238, 220, 0.75)");
    pr.addColorStop(1, "rgba(255, 238, 220, 0)");
    g.fillStyle = pr;
    g.beginPath(); g.arc(0, 0, b * 1.14, 0, TAU); g.fill();
    ringB = b;
  }
}

const TILT = 0.3;

/**
 * Draw the black hole at (x, y) in world units (ctx already scaled by zoom).
 * fx: { zoom, dpr, dt, double, gulp, breath, reduceMotion, magnet, pullRange, breathGuide }
 */
export function drawBlackHoleArt(ctx, x, y, radius, time, fx) {
  const zoom = fx.zoom || 1;
  const rpx = radius * zoom * (fx.dpr || 1);
  const b = bucketFor(rpx * 1.1);
  const palette = fx.double ? "double" : "calm";
  const high = quality === "high";
  const breath = fx.breath ?? 0.5;
  const gulp = fx.reduceMotion ? 0 : (fx.gulp || 0);
  const dt = fx.dt || 1;

  // Inner disk spins faster than the outer; eating speeds it up a little
  const boost = 1 + gulp * 1.6;
  spinInner += 0.0065 * boost * dt;
  spinOuter += 0.0028 * boost * dt;

  holeSprites(b);
  const inner = diskTexture(palette, b, 0);
  const outer = high ? diskTexture(palette, b, 1) : null;
  const glowA = 0.85 + breath * 0.15 + gulp * 0.2;

  ctx.save();
  ctx.translate(x, y);

  // Magnet range and the optional breathing guide (unchanged behaviour)
  if (fx.magnet && fx.pullRange) {
    ctx.save();
    ctx.rotate(time * 0.0004);
    ctx.setLineDash([fx.pullRange * 0.08, fx.pullRange * 0.06]);
    ctx.beginPath();
    ctx.arc(0, 0, fx.pullRange, 0, TAU);
    ctx.strokeStyle = `rgba(255, 209, 102, ${0.16 + breath * 0.06})`;
    ctx.lineWidth = 2 / zoom;
    ctx.stroke();
    ctx.restore();
  }
  if (fx.breathGuide) {
    const gr = radius * (3.1 + breath * 1.1) + 14 / zoom;
    ctx.beginPath();
    ctx.arc(0, 0, gr, 0, TAU);
    ctx.strokeStyle = `rgba(180, 200, 255, ${0.1 + breath * 0.12})`;
    ctx.lineWidth = 2 / zoom;
    ctx.stroke();
  }

  // Soft outer glow
  const gs = radius * 3.0 * (1 + (breath - 0.5) * 0.08);
  ctx.globalAlpha = glowA;
  ctx.drawImage(glowSprite, -gs, -gs, gs * 2, gs * 2);

  const half = radius * DISK_OUT * 1.1;
  const drawDisk = (tex, ang, alpha) => {
    const s = tex.k * radius;
    ctx.save();
    ctx.scale(1, TILT);
    ctx.rotate(ang);
    ctx.globalAlpha = alpha;
    ctx.drawImage(tex.c, -s / 2, -s / 2, s, s);
    ctx.restore();
  };

  // Far half of the disk (behind the hole)
  ctx.save();
  ctx.beginPath(); ctx.rect(-half, -half, half * 2, half); ctx.clip();
  if (outer) drawDisk(outer, spinOuter, 0.8 * glowA);
  drawDisk(inner, spinInner, glowA);
  ctx.restore();

  // Light from the far side, bent up and over the shadow (the lensed arc)
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.6, Math.PI, TAU);
  ctx.arc(0, 0, radius * 1.02, TAU, Math.PI, true);
  ctx.closePath();
  ctx.clip();
  ctx.scale(1, 0.85);
  ctx.rotate(spinInner);
  ctx.globalAlpha = 0.8 * glowA;
  const si = inner.k * radius * 0.82;
  ctx.drawImage(inner.c, -si / 2, -si / 2, si, si);
  ctx.restore();
  if (high) {
    // Faint secondary image under the hole
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.22, 0, Math.PI);
    ctx.arc(0, 0, radius * 1.02, Math.PI, 0, true);
    ctx.closePath();
    ctx.clip();
    ctx.rotate(-spinInner);
    ctx.globalAlpha = 0.28 * glowA;
    const s2 = inner.k * radius * 0.66;
    ctx.drawImage(inner.c, -s2 / 2, -s2 / 2, s2, s2);
    ctx.restore();
  }

  // Shadow + photon ring
  const g = 1 + gulp * 0.05;
  const rs = radius * 1.3 * g;
  ctx.globalAlpha = 1;
  ctx.drawImage(ringSprite, -rs, -rs, rs * 2, rs * 2);

  // Near half of the disk (in front of the hole)
  ctx.save();
  ctx.beginPath(); ctx.rect(-half, 0, half * 2, half); ctx.clip();
  if (outer) drawDisk(outer, spinOuter, 0.8 * glowA);
  drawDisk(inner, spinInner, glowA);
  ctx.restore();

  ctx.restore();
}

/** Pre-paint the common hole textures (e.g. while the title screen is up). */
export function warmHole(rpx) {
  const b = bucketFor(rpx * 1.1);
  holeSprites(b);
  diskTexture("calm", b, 0);
  if (quality === "high") diskTexture("calm", b, 1);
}
