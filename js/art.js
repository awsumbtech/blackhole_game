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
  arcCache.clear();
  rivalCache.clear();
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

export function rng(seed) {
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
    if (R > 4) { g.save(); path(g, pts); g.clip(); speckle(g, R, e.color, r, quality === "high" ? Math.round(R * 4) : Math.round(R * 1.5)); litSphere(g, R, e.color, 0); g.restore(); }
    rimLight(g, R, pts);
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
    if (quality === "high" && R > 4) { g.save(); smoothPath(g, pts); g.clip(); litSphere(g, R, e.color, 0); g.restore(); }
    if (R > 4) { g.save(); smoothPath(g, pts); g.clip(); speckle(g, R, e.color, r, quality === "high" ? Math.round(R * 5) : Math.round(R * 2)); g.restore(); }
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

  comet(g, R, e, r) {
    // v8.1: wide soft coma, a brighter inner coma, sunward jets and an icy nucleus
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, R * 2.3);
    gr.addColorStop(0, "rgba(235, 250, 255, 0.85)");
    gr.addColorStop(0.18, light(e.color, 0.55, 0.6));
    gr.addColorStop(0.45, mix(e.color, [120, 220, 255], 0.4, 0.22));
    gr.addColorStop(1, rgba(e.color, 0));
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, R * 2.3, 0, TAU); g.fill();
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 3; i++) {
      const a = -2.4 + (r() - 0.5) * 1.2, l = R * (0.9 + r() * 0.6);
      const jg = g.createLinearGradient(0, 0, Math.cos(a) * l, Math.sin(a) * l);
      jg.addColorStop(0, "rgba(220, 245, 255, 0.35)");
      jg.addColorStop(1, "rgba(220, 245, 255, 0)");
      g.strokeStyle = jg; g.lineWidth = Math.max(0.6, R * 0.14); g.lineCap = "round";
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * l, Math.sin(a) * l); g.stroke();
    }
    g.globalCompositeOperation = "source-over";
    const nr = R * 0.42;
    const ng = g.createRadialGradient(-nr * 0.3, -nr * 0.3, 0, 0, 0, nr);
    ng.addColorStop(0, "rgba(255, 255, 255, 1)");
    ng.addColorStop(0.6, "rgba(200, 230, 245, 1)");
    ng.addColorStop(1, "rgba(110, 140, 170, 1)");
    g.fillStyle = ng;
    g.beginPath(); g.arc(0, 0, nr, 0, TAU); g.fill();
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
      const nr = quality === "high" ? 7 : 4;
      for (let i = 0; i < nr; i++) {
        g.beginPath();
        g.ellipse(0, 0, R * (1.35 + i * 0.09), R * (0.34 + i * 0.024), 0, 0, TAU);
        g.strokeStyle = light(ringCol, 0.2 + (i % 3) * 0.15, 0.2 + ((i * 7) % 3) * 0.12);
        g.lineWidth = Math.max(0.6, R * (0.05 + (i % 2) * 0.03));
        g.stroke();
      }
      // a soft gap (Cassini division)
      g.beginPath(); g.ellipse(0, 0, R * 1.62, R * 0.4, 0, 0, TAU);
      g.strokeStyle = "rgba(4, 5, 14, 0.5)"; g.lineWidth = Math.max(0.5, R * 0.03); g.stroke();
      g.restore();
      if (!front) {
        // the planet's shadow falls across the rings behind it (light is upper left)
        g.save(); g.globalCompositeOperation = "destination-out";
        const sg = g.createRadialGradient(R * 0.55, R * 0.45, R * 0.5, R * 0.55, R * 0.45, R * 1.25);
        sg.addColorStop(0, "rgba(0,0,0,0.85)"); sg.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = sg; g.fillRect(-R * 2, -R * 2, R * 4, R * 4);
        g.restore();
      }
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
    const nb = quality === "high" ? 9 + Math.floor(r() * 4) : 5 + Math.floor(r() * 3);
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
    if (quality === "high" && R > 8) {
      // storms and swirls
      for (let i = 0; i < 3; i++) {
        const sx = (r() - 0.5) * R * 1.2, sy = (r() - 0.5) * R * 1.2, sr = R * (0.08 + r() * 0.12);
        g.globalAlpha = 0.5;
        g.fillStyle = i ? light(bands[0], 0.3) : mix(bands[0], [200, 110, 80], 0.5);
        g.beginPath(); g.ellipse(sx, sy, sr * 1.8, sr, 0, 0, TAU); g.fill();
      }
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

    // v8: lit from the upper left with a soft terminator and atmospheric scattering
    litSphere(g, R, bands[1] || bands[0], 1);

    if (variant === 0) {
      // the rings' shadow, a dark band across the globe
      g.save();
      g.beginPath(); g.arc(0, 0, R, 0, TAU); g.clip();
      g.rotate(ringTilt);
      g.strokeStyle = "rgba(4, 5, 14, 0.38)";
      g.lineWidth = R * 0.16;
      g.beginPath(); g.ellipse(R * 0.08, R * 0.12, R * 1.5, R * 0.42, 0, 0.05 * Math.PI, 0.95 * Math.PI); g.stroke();
      g.restore();
      ring(true);
    }
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
    if (quality === "high") {
      // coronal streamers
      g.save(); g.globalCompositeOperation = "lighter";
      for (let i = 0; i < 10; i++) {
        const a = r() * TAU, l = R * (1.6 + r() * 1.0);
        g.save(); g.rotate(a);
        const sg = g.createLinearGradient(R * 0.8, 0, l, 0);
        sg.addColorStop(0, light(e.color, 0.4, 0.16)); sg.addColorStop(1, rgba(e.color, 0));
        g.fillStyle = sg;
        g.beginPath(); g.moveTo(R * 0.8, -R * 0.22); g.quadraticCurveTo(l * 0.8, -R * 0.05, l, 0); g.quadraticCurveTo(l * 0.8, R * 0.05, R * 0.8, R * 0.22); g.fill();
        g.restore();
      }
      g.restore();
    }
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
    if (R > 5) {
      // v8.1 granulation: many small convection cells, plus a few darker spots
      g.save();
      g.beginPath(); g.arc(0, 0, R, 0, TAU); g.clip();
      const cells = quality === "high" ? Math.min(140, Math.round(R * 5)) : Math.min(50, Math.round(R * 2));
      for (let i = 0; i < cells; i++) {
        const a = r() * TAU, d = Math.sqrt(r()) * R;
        g.fillStyle = r() < 0.6 ? "rgba(255, 255, 235, 0.13)" : mix(e.color, [160, 70, 20], 0.4, 0.12);
        g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, R * (0.05 + r() * 0.08), 0, TAU); g.fill();
      }
      const ld = g.createRadialGradient(0, 0, R * 0.5, 0, 0, R);
      ld.addColorStop(0, "rgba(0,0,0,0)"); ld.addColorStop(1, mix(e.color, [120, 40, 10], 0.6, 0.45));
      g.fillStyle = ld; g.fillRect(-R, -R, R * 2, R * 2);
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
    const hueA = (i, a) => i % 3 === 0 ? rgba(e.color, a) : mix(e.color, i % 3 === 1 ? [255, 160, 210] : [120, 220, 255], 0.4, a);
    if ("filter" in g && R > 8) g.filter = `blur(${(R * 0.08).toFixed(1)}px)`;
    for (let i = 0; i < (quality === "high" ? 14 : 7); i++) {
      const a = r() * TAU, d = r() * R * 0.6, cr = R * (0.35 + r() * 0.5);
      const cx = Math.cos(a) * d, cy = Math.sin(a) * d * 0.8;
      const cg = g.createRadialGradient(cx, cy, 0, cx, cy, cr);
      cg.addColorStop(0, hueA(i, 0.32));
      cg.addColorStop(0.6, hueA(i, 0.12));
      cg.addColorStop(1, hueA(i, 0));
      g.fillStyle = cg;
      g.beginPath(); g.arc(cx, cy, cr, 0, TAU); g.fill();
    }
    g.filter = "none";
    if (R > 6) {
      g.save(); g.globalCompositeOperation = "destination-out"; g.rotate(r() * TAU); g.scale(1, 0.16);
      const dl = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.1);
      dl.addColorStop(0, "rgba(0,0,0,0.6)"); dl.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = dl; g.fillRect(-R * 1.2, -R * 1.2, R * 2.4, R * 2.4); g.restore();
    }
    g.fillStyle = "rgba(255, 250, 240, 0.85)";
    for (let i = 0; i < 10; i++) {
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
    const n = R > 10 ? (quality === "high" ? 420 : 180) : 70;
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

// v8.1 surface texture: fine light/dark speckle and grit (paint time only)
function speckle(g, R, color, r, n) {
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * R, sz = Math.max(0.4, R * (0.015 + r() * 0.05));
    g.fillStyle = r() < 0.5 ? dark(color, 0.5, 0.18 + r() * 0.2) : light(color, 0.4, 0.1 + r() * 0.15);
    g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, sz, 0, TAU); g.fill();
  }
}

// v8 lighting helpers (paint time only; never per frame)
// Day/night terminator from the upper left, a thin scattered-light limb on the
// lit edge, and a faint bounce of space-blue on the night side.
function litSphere(g, R, atmo, strength) {
  g.save();
  g.beginPath(); g.arc(0, 0, R, 0, TAU); g.clip();
  const lx = -0.62, ly = -0.55;
  const tg = g.createLinearGradient(lx * R, ly * R, -lx * R, -ly * R);
  tg.addColorStop(0, "rgba(255, 250, 232, 0.16)");
  tg.addColorStop(0.42, "rgba(0, 0, 0, 0)");
  tg.addColorStop(0.62, "rgba(2, 3, 14, 0.55)");
  tg.addColorStop(1, "rgba(2, 3, 14, 0.9)");
  g.fillStyle = tg;
  g.fillRect(-R, -R, R * 2, R * 2);
  // limb darkening
  const ld = g.createRadialGradient(0, 0, R * 0.55, 0, 0, R);
  ld.addColorStop(0, "rgba(0, 0, 0, 0)");
  ld.addColorStop(1, "rgba(2, 3, 14, 0.35)");
  g.fillStyle = ld;
  g.fillRect(-R, -R, R * 2, R * 2);
  if (strength > 0) {
    // scattered light along the lit limb (a crescent of atmosphere)
    const sc = g.createRadialGradient(R * 0.22, R * 0.2, R * 0.78, 0, 0, R * 1.02);
    sc.addColorStop(0, light(atmo, 0.5, 0));
    sc.addColorStop(1, light(atmo, 0.6, 0.55 * strength));
    g.globalCompositeOperation = "lighter";
    g.fillStyle = sc;
    g.beginPath(); g.arc(0, 0, R, Math.PI * 0.75, Math.PI * 1.85); g.lineTo(0, 0); g.fill();
    // faint night-side bounce light
    const bl = g.createRadialGradient(R * 0.7, R * 0.7, 0, R * 0.7, R * 0.7, R * 0.6);
    bl.addColorStop(0, "rgba(90, 120, 200, 0.10)");
    bl.addColorStop(1, "rgba(90, 120, 200, 0)");
    g.fillStyle = bl;
    g.fillRect(-R, -R, R * 2, R * 2);
  }
  g.restore();
}

// Thin rim light on the upper-left edges of a hard-edged shape
function rimLight(g, R, pts) {
  if (quality !== "high" || R < 5) return;
  g.save();
  path(g, pts); g.clip();
  g.globalCompositeOperation = "lighter";
  g.lineWidth = Math.max(0.8, R * 0.14);
  const lg = g.createLinearGradient(-R, -R, R * 0.2, R * 0.2);
  lg.addColorStop(0, "rgba(255, 244, 225, 0.42)");
  lg.addColorStop(1, "rgba(255, 244, 225, 0)");
  g.strokeStyle = lg;
  path(g, pts); g.stroke();
  g.restore();
}

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
export function tailFor(color, rpx, ion) {
  const b = bucketFor(rpx);
  let byB = tailCache.get(color);
  if (!byB) { byB = ion ? {} : {}; tailCache.set(color, byB); }
  const slot = ion ? -b : b;
  let t = byB[slot];
  if (t) return t;
  if (ion) { t = ionTail(color, b); byB[slot] = t; return t; }
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
  byB[slot] = t;
  if (tailCache.size > 40) tailCache.delete(tailCache.keys().next().value);
  return t;
}
// v8.1: the straight, thin blue ion tail (comets get two tails)
function ionTail(color, b) {
  const len = Math.ceil(b * 12), hgt = Math.ceil(b * 1.2);
  const c = document.createElement("canvas");
  c.width = len; c.height = hgt;
  const g = c.getContext("2d");
  const cy = hgt / 2;
  const lg = g.createLinearGradient(0, 0, len, 0);
  lg.addColorStop(0, "rgba(170, 220, 255, 0.6)");
  lg.addColorStop(0.5, "rgba(130, 190, 255, 0.2)");
  lg.addColorStop(1, "rgba(120, 180, 255, 0)");
  g.fillStyle = lg;
  g.beginPath(); g.moveTo(0, cy - b * 0.28); g.lineTo(len, cy - b * 0.05); g.lineTo(len, cy + b * 0.05); g.lineTo(0, cy + b * 0.28); g.fill();
  g.strokeStyle = "rgba(220, 240, 255, 0.35)"; g.lineWidth = Math.max(0.5, b * 0.06);
  g.beginPath(); g.moveTo(0, cy); g.lineTo(len * 0.7, cy); g.stroke();
  return { c, k: b };
}

// ─── BLACK HOLE (accretion disk, photon ring, lensed arc) ───
// Disk textures are painted once per palette + size bucket, then rotated.

const PALETTES = {
  // inner (white-hot) -> warm gold -> ember -> deep outer
  calm: { hot: [255, 250, 238], warm: [255, 210, 150], ember: [244, 140, 84], deep: [150, 70, 92], bloom: "255, 196, 140" },
  double: { hot: [255, 244, 252], warm: [255, 176, 226], ember: [226, 110, 210], deep: [120, 70, 190], bloom: "255, 160, 230" }
};
const diskCache = new Map();
// v8.1: a big, Interstellar-style disk. In hole radii.
const DISK_IN = 1.45, DISK_OUT = 3.6;
const TILT = 0.17;

function colAt(P, t) {
  // t: 0 inner .. 1 outer
  const s = t < 0.25 ? [P.hot, P.warm, t / 0.25] : t < 0.6 ? [P.warm, P.ember, (t - 0.25) / 0.35] : [P.ember, P.deep, (t - 0.6) / 0.4];
  const a = s[0], b = s[1], k = s[2];
  return Math.round(a[0] + (b[0] - a[0]) * k) + ", " + Math.round(a[1] + (b[1] - a[1]) * k) + ", " + Math.round(a[2] + (b[2] - a[2]) * k);
}

// Face-on disk texture: smooth warm-to-white base, then many turbulent bands
// and dark lanes. Painted once per size bucket (and palette).
function diskTexture(palette, b, layer) {
  const key = palette + "|" + b + "|" + layer;
  let d = diskCache.get(key);
  if (d) return d;
  const P = PALETTES[palette] || PALETTES.calm;
  const high = quality === "high";
  const size = Math.ceil(b * DISK_OUT * 2) + 2;
  const c = makeCanvas(size);
  const g = c.getContext("2d");
  g.translate(size / 2, size / 2);
  const rin = b * DISK_IN, rout = b * DISK_OUT;
  const span = rout - rin;
  const base = g.createRadialGradient(0, 0, rin * 0.96, 0, 0, rout);
  base.addColorStop(0, `rgba(${colAt(P, 0)}, 0)`);
  base.addColorStop(0.03, `rgba(${colAt(P, 0)}, 0.95)`);
  base.addColorStop(0.14, `rgba(${colAt(P, 0.15)}, 0.8)`);
  base.addColorStop(0.35, `rgba(${colAt(P, 0.4)}, 0.5)`);
  base.addColorStop(0.65, `rgba(${colAt(P, 0.7)}, 0.22)`);
  base.addColorStop(1, `rgba(${colAt(P, 1)}, 0)`);
  g.fillStyle = base;
  g.beginPath(); g.arc(0, 0, rout, 0, TAU); g.arc(0, 0, rin * 0.96, TAU, 0, true); g.fill();

  const r = rng(4321 + layer * 97 + b);
  g.lineCap = "round";
  // turbulent bright bands (additive)
  g.globalCompositeOperation = "lighter";
  const n = high ? 260 : 120;
  for (let i = 0; i < n; i++) {
    const t = Math.pow(r(), 1.5);
    const rad = rin + span * t;
    const a0 = r() * TAU, len = 0.3 + r() * 2.2;
    g.strokeStyle = `rgba(${colAt(P, t)}, ${(0.05 + r() * 0.16) * (1 - t * 0.6)})`;
    g.lineWidth = Math.max(0.6, b * (0.015 + r() * 0.07) * (1 + t));
    g.beginPath(); g.arc(0, 0, rad, a0, a0 + len); g.stroke();
  }
  // dark lanes give the bands structure
  g.globalCompositeOperation = "destination-out";
  const lanes = high ? 70 : 30;
  for (let i = 0; i < lanes; i++) {
    const t = 0.05 + r() * 0.9;
    const a0 = r() * TAU, len = 0.6 + r() * 2.6;
    g.strokeStyle = `rgba(0, 0, 0, ${0.12 + r() * 0.25})`;
    g.lineWidth = Math.max(0.6, b * (0.02 + r() * 0.05));
    g.beginPath(); g.arc(0, 0, rin + span * t, a0, a0 + len); g.stroke();
  }
  // a brilliant inner rim
  g.globalCompositeOperation = "lighter";
  const rim = g.createRadialGradient(0, 0, rin * 0.98, 0, 0, rin + span * 0.12);
  rim.addColorStop(0, "rgba(255, 252, 244, 0)");
  rim.addColorStop(0.2, "rgba(255, 252, 244, 0.55)");
  rim.addColorStop(1, "rgba(255, 252, 244, 0)");
  g.fillStyle = rim;
  g.beginPath(); g.arc(0, 0, rin + span * 0.12, 0, TAU); g.fill();
  d = { c, k: size / b };
  diskCache.set(key, d);
  if (diskCache.size > 12) diskCache.delete(diskCache.keys().next().value);
  return d;
}

// The lensed image of the far side of the disk: a bright arc bent up over the
// shadow and a thinner one under it. Painted from the disk texture.
const arcCache = new Map();
function arcSprite(palette, b) {
  const key = palette + "|" + b;
  let a = arcCache.get(key);
  if (a) return a;
  const tex = diskTexture(palette, b, 0);
  const R = b * 2.3, size = Math.ceil(R * 2) + 2;
  const c = makeCanvas(size);
  const g = c.getContext("2d");
  g.translate(size / 2, size / 2);
  const k = 1.04 / DISK_IN;            // inner edge hugs the shadow
  const s = tex.k * b * k;
  g.drawImage(tex.c, -s / 2, -s / 2, s, s);
  g.scale(1, 1);
  // top arc fades out by ~2.1 R
  g.globalCompositeOperation = "destination-in";
  const m = g.createRadialGradient(0, 0, b * 1.0, 0, 0, b * 2.2);
  m.addColorStop(0, "rgba(0,0,0,1)");
  m.addColorStop(0.35, "rgba(0,0,0,0.75)");
  m.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = m;
  g.fillRect(-R, -R, R * 2, R * 2);
  // bottom arc: much thinner
  g.save();
  g.beginPath(); g.rect(-R, b * 0.15, R * 2, R); g.clip();
  g.globalCompositeOperation = "destination-out";
  const m2 = g.createRadialGradient(0, 0, b * 1.12, 0, 0, b * 1.5);
  m2.addColorStop(0, "rgba(0,0,0,0)");
  m2.addColorStop(1, "rgba(0,0,0,1)");
  g.fillStyle = m2;
  g.fillRect(-R, -R, R * 2, R * 2);
  g.restore();
  // blend the two arcs smoothly at the sides
  g.globalCompositeOperation = "destination-out";
  const side = g.createLinearGradient(0, -b * 0.3, 0, b * 0.45);
  side.addColorStop(0, "rgba(0,0,0,0)");
  side.addColorStop(0.5, "rgba(0,0,0,0.35)");
  side.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = side;
  g.fillRect(-R, -b * 0.3, R * 2, b * 0.75);
  // approaching side is brighter
  g.globalCompositeOperation = "source-atop";
  const dop = g.createLinearGradient(-R, 0, R, 0);
  dop.addColorStop(0, "rgba(255, 250, 240, 0.35)");
  dop.addColorStop(0.5, "rgba(255, 250, 240, 0)");
  dop.addColorStop(1, "rgba(60, 20, 40, 0.25)");
  g.fillStyle = dop;
  g.fillRect(-R, -R, R * 2, R * 2);
  a = { c, R: 2.3 };
  arcCache.set(key, a);
  if (arcCache.size > 6) arcCache.delete(arcCache.keys().next().value);
  return a;
}

let spinOuter = 0, spinInner = 0, shimmerT = 0;
let glowSprite = null, glowB = 0, ringSprite = null, ringB = 0;
let dopSprite = null, dopB = 0, bloomSprite = null, bloomB = -1;

// Relativistic beaming: the side turning toward us is brighter and whiter.
// Disk-plane coordinates, does not rotate.
function dopplerSprite(b) {
  if (dopB === b) return dopSprite;
  const R = b * DISK_OUT, size = Math.ceil(R * 2) + 2;
  dopSprite = makeCanvas(size);
  const g = dopSprite.getContext("2d");
  g.translate(size / 2, size / 2);
  const lg = g.createLinearGradient(-R, 0, R, 0);
  lg.addColorStop(0, "rgba(255, 240, 220, 0)");
  lg.addColorStop(0.15, "rgba(255, 246, 232, 0.8)");
  lg.addColorStop(0.42, "rgba(255, 226, 190, 0.25)");
  lg.addColorStop(0.62, "rgba(255, 200, 160, 0)");
  g.fillStyle = lg;
  g.beginPath(); g.arc(0, 0, b * 2.6, 0, TAU); g.arc(0, 0, b * DISK_IN, TAU, 0, true); g.fill();
  g.globalCompositeOperation = "destination-in";
  const m = g.createRadialGradient(0, 0, b * DISK_IN, 0, 0, b * 2.6);
  m.addColorStop(0, "rgba(0,0,0,0)");
  m.addColorStop(0.15, "rgba(0,0,0,1)");
  m.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = m;
  g.fillRect(-R, -R, R * 2, R * 2);
  dopB = b;
  return dopSprite;
}

function bloomFor(b, P) {
  if (bloomB === b) return bloomSprite;
  const R = b * 4.6, size = Math.ceil(R * 2);
  bloomSprite = makeCanvas(size);
  const g = bloomSprite.getContext("2d");
  g.translate(size / 2, size / 2);
  const gr = g.createRadialGradient(0, 0, b * 1.0, 0, 0, R);
  gr.addColorStop(0, "rgba(255, 220, 180, 0.28)");
  gr.addColorStop(0.25, "rgba(250, 180, 140, 0.11)");
  gr.addColorStop(0.6, "rgba(200, 130, 160, 0.035)");
  gr.addColorStop(1, "rgba(160, 120, 200, 0)");
  g.fillStyle = gr;
  g.fillRect(-R, -R, R * 2, R * 2);
  bloomB = b;
  return bloomSprite;
}

function holeSprites(b) {
  if (glowB !== b) {
    const size = Math.ceil(b * 4.2 * 2);
    glowSprite = makeCanvas(size);
    const g = glowSprite.getContext("2d");
    g.translate(size / 2, size / 2);
    const gr = g.createRadialGradient(0, 0, b * 0.9, 0, 0, b * 4.2);
    gr.addColorStop(0, "rgba(150, 130, 230, 0.18)");
    gr.addColorStop(0.3, "rgba(120, 100, 210, 0.07)");
    gr.addColorStop(1, "rgba(90, 90, 200, 0)");
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, b * 4.2, 0, TAU); g.fill();
    glowB = b;
  }
  if (ringB !== b) {
    const size = Math.ceil(b * 1.3 * 2);
    ringSprite = makeCanvas(size);
    const g = ringSprite.getContext("2d");
    g.translate(size / 2, size / 2);
    const sh = g.createRadialGradient(0, 0, b * 0.9, 0, 0, b * 1.1);
    sh.addColorStop(0, "rgba(0, 0, 2, 1)");
    sh.addColorStop(0.6, "rgba(0, 0, 2, 0.95)");
    sh.addColorStop(1, "rgba(0, 0, 2, 0)");
    g.fillStyle = sh;
    g.beginPath(); g.arc(0, 0, b * 1.1, 0, TAU); g.fill();
    // crisp photon ring, brighter on the approaching (left) side
    const pr = g.createRadialGradient(0, 0, b * 0.98, 0, 0, b * 1.12);
    pr.addColorStop(0, "rgba(255, 246, 232, 0)");
    pr.addColorStop(0.25, "rgba(255, 250, 240, 1)");
    pr.addColorStop(0.5, "rgba(255, 220, 170, 0.45)");
    pr.addColorStop(1, "rgba(255, 220, 170, 0)");
    g.fillStyle = pr;
    g.beginPath(); g.arc(0, 0, b * 1.12, 0, TAU); g.arc(0, 0, b * 0.98, TAU, 0, true); g.fill();
    g.globalCompositeOperation = "destination-out";
    const asym = g.createLinearGradient(-b * 1.12, 0, b * 1.12, 0);
    asym.addColorStop(0, "rgba(0,0,0,0)");
    asym.addColorStop(0.55, "rgba(0,0,0,0.1)");
    asym.addColorStop(1, "rgba(0,0,0,0.45)");
    g.fillStyle = asym;
    g.beginPath(); g.arc(0, 0, b * 1.12, 0, TAU); g.arc(0, 0, b * 0.985, TAU, 0, true); g.fill();
    ringB = b;
  }
}

// Disk halves (module functions: no per-frame closures)
function drawDisk(ctx, tex, ang, alpha, radius) {
  const s = tex.k * radius;
  ctx.save();
  ctx.scale(1, TILT);
  ctx.rotate(ang);
  ctx.globalAlpha = alpha;
  ctx.drawImage(tex.c, -s / 2, -s / 2, s, s);
  ctx.restore();
}
function drawDoppler(ctx, spr, alpha, radius) {
  const s = DISK_OUT * 2 * radius;
  ctx.save();
  ctx.scale(1, TILT);
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "lighter";
  ctx.drawImage(spr, -s / 2, -s / 2, s, s);
  ctx.restore();
}

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

  const boost = 1 + gulp * 1.6;
  spinInner += 0.0055 * boost * dt;
  spinOuter += 0.0024 * boost * dt;
  if (!fx.reduceMotion) shimmerT += 0.035 * dt;

  holeSprites(b);
  const inner = diskTexture(palette, b, 0);
  const arc = arcSprite(palette, b);
  const dop = dopplerSprite(b);
  const glowA = 0.88 + breath * 0.12 + gulp * 0.2;

  ctx.save();
  ctx.translate(x, y);

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
    const gr = radius * (4.1 + breath * 1.1) + 14 / zoom;
    ctx.beginPath();
    ctx.arc(0, 0, gr, 0, TAU);
    ctx.strokeStyle = `rgba(180, 200, 255, ${0.1 + breath * 0.12})`;
    ctx.lineWidth = 2 / zoom;
    ctx.stroke();
  }

  // Soft outer glow + warm bloom
  const gs = radius * 4.2 * (1 + (breath - 0.5) * 0.08);
  ctx.globalAlpha = glowA;
  ctx.drawImage(glowSprite, -gs, -gs, gs * 2, gs * 2);
  if (high) {
    const bl = bloomFor(b), bs = radius * 4.6 * (1 + gulp * 0.05);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.75 + breath * 0.2;
    ctx.save(); ctx.scale(1, 0.55);
    ctx.drawImage(bl, -bs, -bs, bs * 2, bs * 2);
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  const half = radius * DISK_OUT * 1.05;
  // Far half of the disk (behind the hole)
  ctx.save();
  ctx.beginPath(); ctx.rect(-half, -half, half * 2, half); ctx.clip();
  if (high) drawDisk(ctx, inner, spinOuter + 1.7, 0.45 * glowA, radius * 1.04);
  drawDisk(ctx, inner, spinInner, glowA, radius);
  drawDoppler(ctx, dop, 0.7 * glowA, radius);
  ctx.restore();

  // Lensed back-of-disk: bright arc over the shadow, thin arc under it
  const as = radius * arc.R * (1 + gulp * 0.04);
  ctx.globalAlpha = glowA;
  ctx.drawImage(arc.c, -as, -as, as * 2, as * 2);

  // Shadow + photon ring
  const g = 1 + gulp * 0.08;
  const rs = radius * 1.3 * g;
  ctx.globalAlpha = 1;
  ctx.drawImage(ringSprite, -rs, -rs, rs * 2, rs * 2);
  if (high && !fx.reduceMotion) {
    const sh = rs * (1.015 + 0.012 * Math.sin(shimmerT));
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.12 + 0.06 * Math.sin(shimmerT * 1.7);
    ctx.drawImage(ringSprite, -sh, -sh * 0.985, sh * 2, sh * 1.97);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }

  // Near half of the disk (in front of the hole)
  ctx.save();
  ctx.beginPath(); ctx.rect(-half, 0, half * 2, half); ctx.clip();
  if (high) drawDisk(ctx, inner, spinOuter + 1.7, 0.45 * glowA, radius * 1.04);
  drawDisk(ctx, inner, spinInner, glowA, radius);
  drawDoppler(ctx, dop, glowA, radius);
  ctx.restore();

  ctx.restore();
}

/** v8.1: a small cached violet hole for rivals (own disk, lensed arc, ring). */
const rivalCache = new Map();
export function rivalSprite(rpx, edible) {
  const b = bucketFor(rpx);
  const key = b + (edible ? "e" : "v");
  let s = rivalCache.get(key);
  if (s) return s;
  const P = edible ? PALETTES.calm : { hot: [246, 236, 255], warm: [200, 170, 255], ember: [150, 110, 240], deep: [90, 60, 170] };
  const R = b * DISK_OUT, size = Math.ceil(R * 2) + 2;
  const c = makeCanvas(size);
  const g = c.getContext("2d");
  g.translate(size / 2, size / 2);
  // tiny disk texture painted inline (small, cheap)
  const tmp = makeCanvas(size);
  const t = tmp.getContext("2d");
  t.translate(size / 2, size / 2);
  const base = t.createRadialGradient(0, 0, b * DISK_IN * 0.95, 0, 0, R);
  base.addColorStop(0, `rgba(${colAt(P, 0)}, 0)`);
  base.addColorStop(0.05, `rgba(${colAt(P, 0)}, 0.9)`);
  base.addColorStop(0.3, `rgba(${colAt(P, 0.35)}, 0.5)`);
  base.addColorStop(1, `rgba(${colAt(P, 1)}, 0)`);
  t.fillStyle = base;
  t.beginPath(); t.arc(0, 0, R, 0, TAU); t.arc(0, 0, b * DISK_IN * 0.95, TAU, 0, true); t.fill();
  const r = rng(77 + b);
  t.globalCompositeOperation = "lighter";
  t.lineCap = "round";
  for (let i = 0; i < 50; i++) {
    const q = Math.pow(r(), 1.4), a0 = r() * TAU;
    t.strokeStyle = `rgba(${colAt(P, q)}, ${0.08 + r() * 0.15})`;
    t.lineWidth = Math.max(0.5, b * 0.05);
    t.beginPath(); t.arc(0, 0, b * (DISK_IN + (DISK_OUT - DISK_IN) * q), a0, a0 + 0.5 + r() * 1.8); t.stroke();
  }
  // glow
  const gl = g.createRadialGradient(0, 0, b, 0, 0, R);
  gl.addColorStop(0, `rgba(${colAt(P, 0.3)}, 0.22)`);
  gl.addColorStop(1, `rgba(${colAt(P, 1)}, 0)`);
  g.fillStyle = gl; g.fillRect(-R, -R, R * 2, R * 2);
  // far half
  g.save(); g.beginPath(); g.rect(-R, -R, R * 2, R); g.clip(); g.scale(1, 0.24); g.drawImage(tmp, -size / 2, -size / 2); g.restore();
  // lensed arc
  g.save();
  g.beginPath(); g.arc(0, 0, b * 1.9, Math.PI, TAU); g.arc(0, 0, b * 1.0, TAU, Math.PI, true); g.closePath(); g.clip();
  const k = 1.04 / DISK_IN; g.scale(k, k * 0.95); g.globalAlpha = 0.85; g.drawImage(tmp, -size / 2, -size / 2);
  g.restore();
  // shadow + ring
  const sh = g.createRadialGradient(0, 0, b * 0.92, 0, 0, b * 1.12);
  sh.addColorStop(0, "rgba(2, 1, 6, 1)");
  sh.addColorStop(0.55, `rgba(${colAt(P, 0)}, 0.95)`);
  sh.addColorStop(1, `rgba(${colAt(P, 0.2)}, 0)`);
  g.fillStyle = sh; g.beginPath(); g.arc(0, 0, b * 1.12, 0, TAU); g.fill();
  g.fillStyle = "rgba(2, 1, 6, 1)"; g.beginPath(); g.arc(0, 0, b * 0.97, 0, TAU); g.fill();
  // near half
  g.save(); g.beginPath(); g.rect(-R, 0, R * 2, R); g.clip(); g.scale(1, 0.24); g.drawImage(tmp, -size / 2, -size / 2); g.restore();
  s = { c, k: size / b };
  rivalCache.set(key, s);
  if (rivalCache.size > 16) rivalCache.delete(rivalCache.keys().next().value);
  return s;
}

/** v8.1 tier reveal: a gentle bloom swell and an expanding ring of dust. */
let revRing = null, revBloom = null;
export function drawRevealFx(ctx, x, y, radius, p, still) {
  if (!revRing) {
    revRing = makeCanvas(256);
    const g = revRing.getContext("2d");
    g.translate(128, 128);
    const gr = g.createRadialGradient(0, 0, 80, 0, 0, 128);
    gr.addColorStop(0, "rgba(255, 230, 200, 0)");
    gr.addColorStop(0.55, "rgba(255, 230, 200, 0.4)");
    gr.addColorStop(1, "rgba(200, 190, 255, 0)");
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 128, 0, TAU); g.fill();
    const r = rng(99);
    for (let i = 0; i < 260; i++) {
      const a = r() * TAU, d = 92 + r() * 30;
      g.fillStyle = `rgba(255, ${220 + Math.floor(r() * 35)}, ${200 + Math.floor(r() * 55)}, ${0.3 + r() * 0.5})`;
      g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, 0.6 + r() * 1.4, 0, TAU); g.fill();
    }
    revBloom = makeCanvas(128);
    const b = revBloom.getContext("2d");
    const bg = b.createRadialGradient(64, 64, 0, 64, 64, 64);
    bg.addColorStop(0, "rgba(255, 236, 210, 0.5)");
    bg.addColorStop(0.4, "rgba(220, 200, 255, 0.15)");
    bg.addColorStop(1, "rgba(200, 190, 255, 0)");
    b.fillStyle = bg; b.fillRect(0, 0, 128, 128);
  }
  const env = Math.sin(Math.PI * p);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const bs = radius * (5 + env * 3);
  ctx.globalAlpha = env * 0.55;
  ctx.drawImage(revBloom, x - bs, y - bs, bs * 2, bs * 2);
  const rs = radius * (still ? 7 : 3 + p * 11);
  ctx.globalAlpha = env * (still ? 0.25 : 0.45);
  ctx.translate(x, y); ctx.scale(1, 0.85);
  ctx.drawImage(revRing, -rs, -rs, rs * 2, rs * 2);
  ctx.restore();
}

/** Pre-paint the common hole textures (e.g. while the title screen is up). */
export function warmHole(rpx) {
  const b = bucketFor(rpx * 1.1);
  holeSprites(b);
  diskTexture("calm", b, 0);
  arcSprite("calm", b);
}
