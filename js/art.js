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
  heatCache.clear();
  tailCache.clear();
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

// ─── v9 looks: seeded variety per instance ───
// Every type has a set of looks (archetype + seeded details). The look comes from
// the entity's seed (or an explicit e.look >= 0), so the cache holds one sprite
// per type / look / size rather than one per object.
const LOOKS = { dust: 8, junk: 10, meteor: 12, comet: 6, moon: 12, planet: 30, star: 12, system: 8, nebula: 10, cluster: 6, galaxy: 10 };
// Types that paint their own palette from the look (e.color is only a minimap tint)
const OWN = { dust: 1, junk: 1, meteor: 1, comet: 1, moon: 1, planet: 1, star: 1, system: 1 };
export function lookOf(e) {
  const n = LOOKS[e.type];
  if (!n) return 0;
  return e.look >= 0 ? e.look % n : (((e.seed | 0) >>> 3) % n);
}
const ARCH = 10;                                          // planet archetypes (look % ARCH)
const ringedPlanet = (look, v) => { const a = look % ARCH; return a === 7 || (v === 0 && (a === 5 || a === 6 || a === 9)); };

/** How far (in radii) each type's art extends from the centre. */
function extentFor(type, variant, look) {
  switch (type) {
    case "star": return 2.7;
    case "neutron": return 3.1;
    case "comet": return 2.3;
    case "planet": return ringedPlanet(look, variant) ? 2.05 : variant === 1 ? 1.65 : 1.35;
    case "meteor": return 1.4;
    case "system": return 2.5;
    case "nebula": return 1.75;
    case "cluster": return 1.9;
    case "galaxy": return 1.75;
    case "dust": return 1.6;
    default: return 1.3;
  }
}

function baseKeyFor(e) {
  const L = lookOf(e), t = e.type;
  if (OWN[t]) return t + "||" + L + "|" + (t === "planet" ? e.variant || 0 : 0);
  return `${t}|${e.color}|${e.bands ? e.bands[0] : ""}|${e.variant || 0}|${L}`;
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
  const variant = e.variant || 0, look = lookOf(e);
  const ext = extentFor(e.type, variant, look);
  const size = Math.ceil(b * ext * 2) + 2;
  const c = makeCanvas(size);
  const g = c.getContext("2d");
  g.translate(size / 2, size / 2);
  // one look always paints the same (whichever object asked first)
  const r = rng(LOOKS[e.type] ? (look + 1) * 2654435761 + variant * 40503 + e.type.length * 977 : e.seed || 7);
  const painter = PAINTERS[e.type] || PAINTERS.dust;
  painter(g, b, e, r, variant, look);
  // `scale` converts canvas px to entity radii: drawn width = size / b * radius
  return { c, k: size / b, b, g: cacheGen, used: frameNo };
}

// ─── Painters (g is centred; R = radius in canvas px) ───

const PAINTERS = {
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

// ─── v9 painters: every type and tier its own recognisable little painting ───
// Light always comes from the upper left (LX, LY). Paint time only.
const LX = -0.74, LY = -0.67;
const css = (c, a = 1) => "rgba(" + (c[0] | 0) + ", " + (c[1] | 0) + ", " + (c[2] | 0) + ", " + a + ")";
const mx3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const jit = (c, r, k) => [0, 1, 2].map(i => Math.max(0, Math.min(255, c[i] * (1 + (r() - 0.5) * k))));
const K0 = [4, 5, 14], K1 = [255, 250, 236];
const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

// An irregular closed outline: low harmonics give lumpy, rock-like silhouettes
function lumpy(R, r, n, amp, elong) {
  const h = [], pts = [];
  for (let k = 2; k <= 5; k++) h.push([amp / (k - 1) * (0.6 + r() * 0.8), r() * TAU]);
  const rot = r() * TAU, ex = 1 + elong, ey = 1 - elong * 0.55;
  let mx = 0;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    let d = 1;
    for (let k = 0; k < h.length; k++) d += h[k][0] * Math.cos((k + 2) * a + h[k][1]);
    d *= 1 + (r() - 0.5) * amp * 0.25;
    const x = Math.cos(a) * d * ex, y = Math.sin(a) * d * ey;
    const xr = x * Math.cos(rot) - y * Math.sin(rot), yr = x * Math.sin(rot) + y * Math.cos(rot);
    pts.push([xr, yr]);
    mx = Math.max(mx, Math.hypot(xr, yr));
  }
  for (const p of pts) { p[0] *= R / mx; p[1] *= R / mx; }
  return pts;
}
// Angular chip: few vertices, straight edges
function chip(R, r, n) {
  const pts = [], off = r() * TAU;
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * TAU + (r() - 0.5) * (TAU / n) * 0.6;
    const d = R * (0.55 + r() * 0.45);
    pts.push([Math.cos(a) * d, Math.sin(a) * d]);
  }
  return pts;
}
function polyAt(g, pts, x, y, s) {
  g.beginPath();
  g.moveTo(x + pts[0][0] * s, y + pts[0][1] * s);
  for (let i = 1; i < pts.length; i++) g.lineTo(x + pts[i][0] * s, y + pts[i][1] * s);
  g.closePath();
}
// Low-poly facets lit from the upper left: reads instantly as a broken stone
function facets(g, pts, x, y, s, base, contrast) {
  const n = pts.length;
  const cx = x + LX * 0.18 * s * maxR(pts), cy = y + LY * 0.18 * s * maxR(pts);
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const mxp = (a[0] + b[0]) / 2, myp = (a[1] + b[1]) / 2, l = Math.hypot(mxp, myp) || 1;
    const nx = mxp / l * 0.75, ny = myp / l * 0.75, nz = 0.66;
    const lum = Math.max(-1, nx * LX + ny * LY + nz * 0.35);
    const c = lum > 0 ? mx3(base, K1, lum * 0.45 * contrast) : mx3(base, K0, -lum * 0.8 * contrast);
    g.fillStyle = css(c);
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(x + a[0] * s, y + a[1] * s); g.lineTo(x + b[0] * s, y + b[1] * s); g.closePath();
    g.fill();
  }
  // the top face catches the most light
  g.fillStyle = css(mx3(base, K1, 0.16 * contrast), 0.55);
  g.beginPath();
  for (let i = 0; i < n; i++) { const p = pts[i]; const px = cx + (x + p[0] * s - cx) * 0.42, py = cy + (y + p[1] * s - cy) * 0.42; i ? g.lineTo(px, py) : g.moveTo(px, py); }
  g.closePath(); g.fill();
}
function maxR(pts) { let m = 0; for (const p of pts) m = Math.max(m, Math.hypot(p[0], p[1])); return m || 1; }

// Body shading for any clipped shape: a curved terminator and a dark limb
function shade(g, R, night, warm) {
  const sx = LX * R * 0.5, sy = LY * R * 0.5;
  const sg = g.createRadialGradient(sx, sy, 0, sx, sy, R * 1.5);
  sg.addColorStop(0, warm ? "rgba(255, 246, 225, 0.16)" : "rgba(255, 250, 240, 0.1)");
  sg.addColorStop(0.36, "rgba(0, 0, 0, 0)");
  sg.addColorStop(0.56, css(K0, night * 0.42));
  sg.addColorStop(0.72, css(K0, night * 0.84));
  sg.addColorStop(0.9, css(K0, night * 0.97));
  sg.addColorStop(1, css([20, 30, 60], night * 0.9));
  g.fillStyle = sg;
  g.fillRect(-R * 1.7, -R * 1.7, R * 3.4, R * 3.4);
}
// Atmosphere: a halo (thicker on the lit side) painted before the globe, and a
// scattered-light limb painted inside the globe before shading (so night hides it)
function atmoHalo(g, R, col, k) {
  const cx = LX * R * 0.1, cy = LY * R * 0.1;
  const at = g.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.24);
  at.addColorStop(0, css(col, 0.24 * k)); at.addColorStop(1, css(col, 0));
  g.fillStyle = at;
  g.beginPath(); g.arc(cx, cy, R * 1.24, 0, TAU); g.fill();
}
function atmoLimb(g, R, col, k) {
  const sc = g.createRadialGradient(0, 0, R * 0.7, 0, 0, R);
  sc.addColorStop(0, css(col, 0)); sc.addColorStop(1, css(col, 0.6 * k));
  g.globalCompositeOperation = "lighter";
  g.fillStyle = sc; g.fillRect(-R, -R, R * 2, R * 2);
  g.globalCompositeOperation = "source-over";
}
function sphereClip(g, R) { g.save(); g.beginPath(); g.arc(0, 0, R, 0, TAU); g.clip(); }
function blob(g, x, y, rad, r, rough) {
  const n = 9, pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU, d = rad * (1 - rough / 2 + r() * rough); pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d]); }
  smoothPath(g, pts);
}
function softBlob(g, x, y, rad, col, a) {
  const gr = g.createRadialGradient(x, y, 0, x, y, rad);
  gr.addColorStop(0, css(col, a)); gr.addColorStop(0.6, css(col, a * 0.5)); gr.addColorStop(1, css(col, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
}
// A crater lit from the upper left: shadowed near wall, bright far wall and rim
function crater(g, x, y, cr, base, k = 1) {
  g.save();
  g.beginPath(); g.arc(x, y, cr, 0, TAU); g.clip();
  g.fillStyle = css(mx3(base, K0, 0.55), 0.6 * k);
  g.fillRect(x - cr, y - cr, cr * 2, cr * 2);
  g.fillStyle = css(mx3(base, K1, 0.08), 0.75 * k);
  g.beginPath(); g.arc(x - LX * cr * 0.32, y - LY * cr * 0.32, cr * 0.86, 0, TAU); g.fill();
  g.restore();
  g.strokeStyle = css(mx3(base, K1, 0.4), 0.45 * k);
  g.lineWidth = Math.max(0.5, cr * 0.18);
  g.beginPath(); g.arc(x, y, cr * 1.02, Math.PI * 0.95, Math.PI * 1.75); g.stroke();
}
function speck(g, R, n, cols, r, a0, a1, s0, s1, spread = 1) {
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * R * spread, sz = Math.max(0.45, R * (s0 + r() * (s1 - s0)));
    g.fillStyle = css(pick(r, cols), a0 + r() * (a1 - a0));
    g.fillRect(Math.cos(a) * d - sz / 2, Math.sin(a) * d - sz / 2, sz, sz);
  }
}
// A small, static four-point glint (paint time only, never blinks)
function glint(g, x, y, l, col, a) {
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 2; i++) {
    const lg = g.createLinearGradient(x - (i ? 0 : l), y - (i ? l : 0), x + (i ? 0 : l), y + (i ? l : 0));
    lg.addColorStop(0, css(col, 0)); lg.addColorStop(0.5, css(col, a)); lg.addColorStop(1, css(col, 0));
    g.fillStyle = lg;
    if (i) g.fillRect(x - Math.max(0.35, l * 0.07), y - l, Math.max(0.7, l * 0.14), l * 2);
    else g.fillRect(x - l, y - Math.max(0.35, l * 0.07), l * 2, Math.max(0.7, l * 0.14));
  }
  softBlob(g, x, y, l * 0.35, col, a * 0.8);
  g.restore();
}
function ringPass(g, R, tilt, col, front, wide, shadow) {
  g.save();
  g.rotate(tilt);
  g.beginPath(); g.rect(-R * 2.2, front ? 0 : -R * 2.2, R * 4.4, R * 2.2); g.clip();
  if (!front) { g.beginPath(); g.rect(-R * 2.2, -R * 2.2, R * 4.4, R * 2.2); g.arc(0, 0, R, 0, TAU, true); g.clip(); }
  const n = quality === "high" ? 9 : 5;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    g.beginPath();
    g.ellipse(0, 0, R * (1.3 + t * 0.62 * wide), R * (0.3 + t * 0.15 * wide), 0, 0, TAU);
    g.strokeStyle = css(mx3(col, i % 3 ? K1 : K0, (i % 3) * 0.12), (0.22 + ((i * 5) % 4) * 0.08) * (1 - t * 0.3));
    g.lineWidth = Math.max(0.6, R * 0.075 * wide);
    g.stroke();
  }
  g.beginPath(); g.ellipse(0, 0, R * (1.3 + 0.42 * wide), R * (0.3 + 0.1 * wide), 0, 0, TAU);
  g.strokeStyle = "rgba(4, 5, 14, 0.55)"; g.lineWidth = Math.max(0.5, R * 0.035); g.stroke();
  g.restore();
  if (!front && shadow) {
    // the globe's shadow falls on the ring behind it (light is upper left)
    g.save(); g.globalCompositeOperation = "destination-out";
    const sg = g.createRadialGradient(R * 0.6, R * 0.5, R * 0.4, R * 0.6, R * 0.5, R * 1.3);
    sg.addColorStop(0, "rgba(0,0,0,0.8)"); sg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = sg; g.fillRect(-R * 2.2, -R * 2.2, R * 4.4, R * 4.4);
    g.restore();
  }
}
// Wavy horizontal band across a globe (gas giants)
function band(g, R, y0, y1, amp, f, ph) {
  const s = R * 0.12;
  g.beginPath();
  g.moveTo(-R * 1.3, y0);
  for (let x = -R * 1.3; x <= R * 1.3 + 0.1; x += s) g.lineTo(x, y0 + Math.sin(x / R * f + ph) * amp);
  for (let x = R * 1.3; x >= -R * 1.3 - 0.1; x -= s) g.lineTo(x, y1 + Math.sin(x / R * f * 1.37 + ph * 1.9) * amp);
  g.closePath();
}

Object.assign(PAINTERS, {
  // Space dust: never a round blob. A faint drift of gas carrying grains and
  // glints: silicate grit, ice glints, carbon soot, a pink gas wisp.
  dust(g, R, e, r, v, look) {
    const kind = look % 4, hi = quality === "high";
    const PAL = [
      [[214, 196, 168], [182, 170, 156], [236, 222, 196]],      // silicate grains
      [[214, 238, 255], [180, 214, 255], [246, 252, 255]],      // ice glints
      [[150, 128, 116], [118, 104, 100], [186, 160, 140]],      // carbon soot
      [[236, 176, 214], [196, 168, 240], [255, 214, 236]]       // gas wisp
    ][kind];
    const ang = r() * TAU, curve = (r() - 0.5) * 1.6;
    // the drifting wisp the grains ride in: elongated, off-centre, faint
    g.save();
    g.rotate(ang);
    const wl = R * (1.35 + r() * 0.3), wa = kind === 3 ? 0.36 : kind === 2 ? 0.24 : 0.2;
    for (let i = 0; i < 3; i++) {
      const t = i - 1 + (r() - 0.5) * 0.5;
      const x = t * wl * 0.55, y = Math.sin(t * 1.5) * curve * R * 0.3;
      g.save(); g.translate(x, y); g.scale(1, 0.42 + r() * 0.2);
      softBlob(g, 0, 0, R * (0.45 + r() * 0.35), pick(r, PAL), wa * (0.6 + r() * 0.5));
      g.restore();
    }
    // grains along the filament
    const n = kind === 1 ? 4 + Math.floor(r() * 3) : 6 + Math.floor(r() * (hi ? 6 : 3));
    const big = Math.floor(r() * n);
    for (let i = 0; i < n; i++) {
      const t = (r() * 2 - 1);
      const x = t * wl * 0.62, y = Math.sin(t * 1.5) * curve * R * 0.3 + (r() - 0.5) * R * (kind === 2 ? 1.1 : 0.6);
      const s = Math.max(0.8, R * (i === big ? 0.24 : 0.09 + r() * 0.1));
      const c = pick(r, PAL);
      if (kind === 2) {
        // soot: tiny dark-cored fluff
        const p = chip(s * 0.7, r, 5);
        softBlob(g, x + (r() - 0.5) * s, y + (r() - 0.5) * s, s * (1.2 + r()), c, 0.32);
        polyAt(g, p, x, y, 1); g.fillStyle = css(mx3(c, K0, 0.3), 0.85); g.fill();
      } else if (kind === 1) {
        glint(g, x, y, s * (i === big ? 2.6 : 1.6), c, i === big ? 0.9 : 0.55);
      } else {
        // a little angular grain with a lit corner
        const p = chip(s, r, 4 + Math.floor(r() * 2));
        polyAt(g, p, x, y, 1); g.fillStyle = css(mx3(c, K0, 0.25), 0.95); g.fill();
        g.fillStyle = css(mx3(c, K1, 0.5), 0.9);
        g.fillRect(x + LX * s * 0.4 - s * 0.25, y + LY * s * 0.4 - s * 0.25, s * 0.5, s * 0.5);
      }
    }
    g.restore();
    // one glint so even the smallest speck catches the light
    if (kind !== 1) glint(g, (r() - 0.5) * R * 0.8, (r() - 0.5) * R * 0.8, R * (kind === 3 ? 0.35 : 0.45), PAL[2], kind === 2 ? 0.45 : 0.7);
  },

  // Grit & pebbles: angular chips, gravel, ice flakes, dark basalt and rust
  junk(g, R, e, r, v, look) {
    const kind = look % 5, hi = quality === "high";
    const base = jit([[150, 146, 140], [128, 136, 152], [196, 222, 240], [92, 86, 84], [158, 112, 86]][kind], r, 0.18);
    if (kind === 1) {
      // gravel: a loose handful of chips
      const n = 3 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const a = r() * TAU, d = i ? R * (0.35 + r() * 0.35) : 0, s = R * (i ? 0.28 + r() * 0.2 : 0.5);
        const p = chip(1, r, 5 + Math.floor(r() * 2));
        const t = 0.85 + r() * 0.3;
        facets(g, p, Math.cos(a) * d, Math.sin(a) * d, s, [base[0] * t, base[1] * t, base[2] * t], 1.1);
      }
      return;
    }
    if (kind === 2) {
      // ice flake: a thin translucent plate with a bright edge
      const p = chip(R, r, 6);
      polyAt(g, p, 0, 0, 1);
      const lg = g.createLinearGradient(LX * R, LY * R, -LX * R, -LY * R);
      lg.addColorStop(0, css(mx3(base, K1, 0.6), 0.9)); lg.addColorStop(0.5, css(base, 0.55)); lg.addColorStop(1, css(mx3(base, [40, 80, 140], 0.5), 0.6));
      g.fillStyle = lg; g.fill();
      g.strokeStyle = css(K1, 0.55); g.lineWidth = Math.max(0.6, R * 0.07); g.stroke();
      if (R > 5) {
        g.strokeStyle = css([150, 200, 240], 0.35); g.lineWidth = Math.max(0.5, R * 0.035);
        for (let i = 0; i < 3; i++) { const a = r() * TAU; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * R * 0.7, Math.sin(a) * R * 0.7); g.stroke(); }
      }
      glint(g, p[0][0] * 0.7, p[0][1] * 0.7, R * 0.5, K1, 0.6);
      return;
    }
    const p = chip(R, r, 5 + Math.floor(r() * 3));
    facets(g, p, 0, 0, 1, base, kind === 3 ? 1.3 : 1);
    if (R > 4) {
      g.save(); polyAt(g, p, 0, 0, 1); g.clip();
      speck(g, R, hi ? Math.round(R * 3) : Math.round(R), [mx3(base, K0, 0.5), mx3(base, K1, 0.3)], r, 0.15, 0.35, 0.03, 0.07);
      if (kind === 4) for (let i = 0; i < 3; i++) softBlob(g, (r() - 0.5) * R, (r() - 0.5) * R, R * 0.35, [190, 110, 60], 0.3);
      g.restore();
    }
    g.lineJoin = "round";
    g.strokeStyle = css(mx3(base, K0, 0.5), 0.5); g.lineWidth = Math.max(0.5, R * 0.05);
    polyAt(g, p, 0, 0, 1); g.stroke();
    if (kind === 3 && R > 4) glint(g, LX * R * 0.35, LY * R * 0.35, R * 0.35, [220, 230, 255], 0.5);   // a glassy basalt flash
  },

  // Asteroids: lumpy potatoes and contact binaries in stony, iron and carbon
  meteor(g, R, e, r, v, look) {
    const min = look % 4, shape = Math.floor(look / 4) % 3, hi = quality === "high";
    const base = jit([[152, 140, 120], [128, 134, 150], [82, 76, 72], [150, 108, 88]][min], r, 0.14);
    let pts;
    if (shape === 1) {
      // contact binary: two lobes merged
      const a = lumpy(R * 0.62, r, 18, 0.12, 0.1), b = lumpy(R * 0.5, r, 18, 0.14, 0.05);
      const ang = r() * TAU, dx = Math.cos(ang) * R * 0.42, dy = Math.sin(ang) * R * 0.42;
      g.save();
      g.beginPath(); smoothSub(g, a, -dx * 0.8, -dy * 0.8); smoothSub(g, b, dx, dy); g.clip();
      bodyFill(g, R, base, min, r, hi);
      g.restore();
      return;
    }
    pts = lumpy(R, r, 22, shape === 2 ? 0.2 : 0.13, shape === 2 ? 0.34 : 0.12 + r() * 0.15);
    g.save(); smoothPath(g, pts); g.clip();
    bodyFill(g, R, base, min, r, hi);
    g.restore();
    rimLightSmooth(g, R, pts);
  },

  // Comets: a small dark icy nucleus lit on one side, a soft coma (cyan, the
  // green of C2, or pale white) and sunward jets. The two tails are drawn rotated.
  comet(g, R, e, r, v, look) {
    const coma = [[150, 225, 255], [150, 255, 200], [225, 240, 255]][look % 3];
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, R * 2.3);
    gr.addColorStop(0, css(mx3(coma, K1, 0.8), 0.9));
    gr.addColorStop(0.16, css(coma, 0.5));
    gr.addColorStop(0.45, css(coma, 0.12));
    gr.addColorStop(1, css(coma, 0));
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, R * 2.3, 0, TAU); g.fill();
    g.save(); g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 3; i++) {
      const a = Math.atan2(LY, LX) + (r() - 0.5) * 1.3, l = R * (0.9 + r() * 0.7);
      g.save(); g.rotate(a);
      const jg = g.createLinearGradient(0, 0, l, 0);
      jg.addColorStop(0, css(mx3(coma, K1, 0.6), 0.2)); jg.addColorStop(1, css(coma, 0));
      g.fillStyle = jg;
      g.beginPath(); g.moveTo(0, -R * 0.05); g.lineTo(l, -R * 0.22); g.lineTo(l, R * 0.22); g.lineTo(0, R * 0.05); g.fill();
      g.restore();
    }
    g.restore();
    const nr = R * 0.4, pts = lumpy(nr, r, 14, 0.16, 0.25);
    g.save(); smoothPath(g, pts); g.clip();
    const ng = g.createLinearGradient(LX * nr, LY * nr, -LX * nr, -LY * nr);
    ng.addColorStop(0, "rgba(250, 252, 255, 1)"); ng.addColorStop(0.45, "rgba(170, 190, 210, 1)"); ng.addColorStop(1, "rgba(60, 66, 84, 1)");
    g.fillStyle = ng; g.fillRect(-nr, -nr, nr * 2, nr * 2);
    if (R > 8) speck(g, nr, Math.round(nr * 3), [[255, 255, 255], [80, 90, 110]], r, 0.2, 0.5, 0.06, 0.14);
    g.restore();
    softBlob(g, LX * nr * 0.3, LY * nr * 0.3, nr * 0.9, [255, 255, 255], 0.7);
  },

  // Moons: cratered, no air. Grey maria, icy cracked, volcanic, dark dusty, bright icy, rusty.
  moon(g, R, e, r, v, look) {
    const kind = look % 6, hi = quality === "high";
    const base = jit([[176, 174, 170], [226, 216, 196], [222, 196, 104], [112, 98, 84], [222, 234, 242], [160, 124, 104]][kind], r, 0.1);
    sphereClip(g, R);
    const lg = g.createLinearGradient(-R, -R, R, R);
    lg.addColorStop(0, css(mx3(base, K1, 0.12))); lg.addColorStop(1, css(mx3(base, K0, 0.15)));
    g.fillStyle = lg; g.fillRect(-R, -R, R * 2, R * 2);
    const det = R > 5;
    if (kind === 0 && det) {
      for (let i = 0; i < 3 + Math.floor(r() * 3); i++) { blob(g, (r() - 0.5) * R * 1.3, (r() - 0.5) * R * 1.3, R * (0.18 + r() * 0.28), r, 0.5); g.fillStyle = css(mx3(base, K0, 0.42), 0.55); g.fill(); }
    } else if (kind === 1 && det) {
      g.lineCap = "round";
      for (let i = 0; i < (hi ? 14 : 7); i++) {
        const a = r() * TAU, x = (r() - 0.5) * R * 2, y = (r() - 0.5) * R * 2, l = R * (0.6 + r() * 1.2);
        g.strokeStyle = css([150, 84, 60], 0.35 + r() * 0.3); g.lineWidth = Math.max(0.5, R * (0.02 + r() * 0.03));
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
    } else if (kind === 2 && det) {
      for (let i = 0; i < 6; i++) softBlob(g, (r() - 0.5) * R * 1.6, (r() - 0.5) * R * 1.6, R * (0.2 + r() * 0.3), pick(r, [[236, 150, 60], [250, 240, 200], [190, 120, 50]]), 0.5);
      for (let i = 0; i < (hi ? 6 : 4); i++) {
        const x = (r() - 0.5) * R * 1.6, y = (r() - 0.5) * R * 1.6, s = R * (0.02 + r() * 0.04);
        softBlob(g, x, y, s * 4, [190, 80, 40], 0.35);
        blob(g, x, y, s, r, 0.6); g.fillStyle = "rgba(70, 40, 26, 0.75)"; g.fill();
      }
    } else if (kind === 4 && det) {
      g.lineCap = "round";
      for (let i = 0; i < 4; i++) {
        const y = R * (0.35 + i * 0.13), x0 = -R * (0.2 + r() * 0.35), x1 = R * (0.2 + r() * 0.35);
        g.strokeStyle = "rgba(110, 170, 230, 0.4)"; g.lineWidth = Math.max(0.6, R * 0.035);
        g.beginPath(); g.moveTo(x0, y + R * 0.08); g.quadraticCurveTo((x0 + x1) / 2, y - R * 0.1 + r() * R * 0.08, x1, y); g.stroke();
      }
    }
    if (det && kind !== 2) {
      const nc = kind === 3 ? (hi ? 26 : 12) : kind === 4 || kind === 1 ? 3 : (hi ? 11 : 6);
      for (let i = 0; i < nc; i++) {
        const a = r() * TAU, d = Math.sqrt(r()) * R * 0.92, cr = R * (kind === 3 ? 0.03 + r() * 0.06 : 0.05 + r() * r() * 0.2);
        if (kind === 3) { g.fillStyle = css(mx3(base, K1, 0.55), 0.7); g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, cr, 0, TAU); g.fill(); }
        else crater(g, Math.cos(a) * d, Math.sin(a) * d, cr, base, 0.9);
      }
      if (kind === 5) crater(g, R * 0.15, -R * 0.1, R * 0.38, base, 1);
      if (kind === 0 && hi && R > 12) {
        // one young ray crater
        const x = -R * 0.3 + r() * R * 0.4, y = -R * 0.3 + r() * R * 0.4;
        g.strokeStyle = css(K1, 0.12); g.lineWidth = Math.max(0.5, R * 0.025);
        for (let i = 0; i < 9; i++) { const a = r() * TAU, l = R * (0.3 + r() * 0.5); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
        crater(g, x, y, R * 0.07, mx3(base, K1, 0.4), 1);
      }
    }
    if (hi && det) speck(g, R, Math.round(R * 2.5), [mx3(base, K0, 0.4), mx3(base, K1, 0.3)], r, 0.06, 0.18, 0.02, 0.05);
    shade(g, R, 0.94, false);
    g.restore();
  },

  // Planets: ten archetypes, each instance with its own seeded continents,
  // storms, bands and tints. Never two quite alike.
  planet(g, R, e, r, variant, look) {
    const a = look % ARCH, hi = quality === "high", det = R > 6;
    const tilt = -0.42 + r() * 0.84;
    const ringed = ringedPlanet(look, variant);
    const P = planetPalette(a, r);
    if (ringed) ringPass(g, R, tilt * 0.6, P.ring, false, a === 7 ? 1.25 : 0.75, true);
    if (P.atmo) atmoHalo(g, R, P.atmo, P.atmoK);
    sphereClip(g, R);
    g.fillStyle = css(P.base); g.fillRect(-R, -R, R * 2, R * 2);
    if (a === 5 || a === 6 || a === 7 || a === 9 || a === 8) {
      // banded / clouded worlds
      g.save(); g.rotate(tilt * 0.6);
      if (hi && det && "filter" in g) g.filter = "blur(" + Math.max(0.5, R * (a === 8 ? 0.06 : 0.025)).toFixed(1) + "px)";
      const nb = a === 6 ? 5 : a === 8 ? 7 : hi ? 12 : 7;
      let y = -R * 1.05;
      for (let i = 0; i < nb; i++) {
        const h = (R * 2.1 / nb) * (0.55 + r() * 0.9);
        band(g, R, y, y + h, R * (a === 8 ? 0.12 : 0.035) * (0.5 + r()), 3 + r() * 5, r() * TAU);
        g.fillStyle = css(jit(pick(r, P.bands), r, 0.08), a === 6 ? 0.35 : 0.55 + r() * 0.4); g.fill();
        y += h;
      }
      if (a === 8) for (let i = 0; i < 5; i++) { g.save(); g.translate((r() - 0.5) * R, (r() - 0.5) * R * 1.4); g.scale(1.8, 0.5); softBlob(g, 0, 0, R * 0.4, mx3(P.base, K1, 0.3), 0.35); g.restore(); }
      g.filter = "none";
      if (det && a === 5) {
        // a great storm
        const sx = (r() - 0.3) * R * 0.8, sy = R * (0.15 + r() * 0.25), sr = R * (0.13 + r() * 0.08);
        g.save(); g.translate(sx, sy); g.scale(1.7, 1);
        softBlob(g, 0, 0, sr * 1.4, [250, 230, 210], 0.35);
        g.fillStyle = css(P.storm, 0.85); g.beginPath(); g.arc(0, 0, sr, 0, TAU); g.fill();
        g.strokeStyle = css(mx3(P.storm, K1, 0.4), 0.5); g.lineWidth = Math.max(0.5, sr * 0.2); g.stroke();
        g.restore();
      }
      if (det && a === 6) {
        const sx = (r() - 0.5) * R * 0.8, sy = (r() - 0.6) * R * 0.6;
        g.save(); g.translate(sx, sy); g.scale(1.6, 1);
        g.fillStyle = "rgba(20, 40, 110, 0.7)"; g.beginPath(); g.arc(0, 0, R * 0.12, 0, TAU); g.fill(); g.restore();
        for (let i = 0; i < 3; i++) { g.save(); g.translate(sx + R * (0.1 + r() * 0.2), sy + R * (0.12 + r() * 0.1)); g.scale(2.4, 0.4); softBlob(g, 0, 0, R * 0.08, [240, 250, 255], 0.8); g.restore(); }
      }
      if (hi && det && a !== 8) for (let i = 0; i < 5; i++) {
        g.save(); g.translate((r() - 0.5) * R * 1.6, (r() - 0.5) * R * 1.6); g.scale(2.2, 0.55);
        softBlob(g, 0, 0, R * (0.05 + r() * 0.06), mx3(pick(r, P.bands), K1, 0.35), 0.5); g.restore();
      }
      g.restore();
    } else if (a === 4) {
      // lava: dark crust; the glowing cracks are painted after shading
      for (let i = 0; i < 6; i++) { blob(g, (r() - 0.5) * R * 1.6, (r() - 0.5) * R * 1.6, R * (0.2 + r() * 0.3), r, 0.6); g.fillStyle = css(jit(P.bands[i % 2], r, 0.2), 0.7); g.fill(); }
    } else {
      // rocky / ocean / desert / ice surfaces
      if (hi && det && "filter" in g) g.filter = "blur(" + Math.max(0.4, R * 0.012).toFixed(1) + "px)";
      const nl = a === 1 ? 4 + Math.floor(r() * 3) : 6 + Math.floor(r() * 4);
      for (let i = 0; i < nl; i++) {
        const x = (r() - 0.5) * R * 1.7, y = (r() - 0.5) * R * 1.5, s = R * (a === 1 ? 0.22 + r() * 0.3 : 0.12 + r() * 0.3);
        blob(g, x, y, s, r, 0.7);
        g.fillStyle = css(jit(pick(r, P.bands), r, 0.12), a === 1 ? 0.95 : 0.55); g.fill();
        if (a === 1 && det) { blob(g, x + s * 0.2, y + s * 0.1, s * 0.5, r, 0.6); g.fillStyle = css(P.storm, 0.5); g.fill(); }
      }
      if (a === 2 && det) {
        // dune sweeps
        g.strokeStyle = css(mx3(P.base, K0, 0.25), 0.3); g.lineWidth = Math.max(0.5, R * 0.025);
        for (let i = 0; i < 9; i++) { const y = (r() - 0.5) * R * 1.8; g.beginPath(); g.moveTo(-R, y); g.bezierCurveTo(-R * 0.3, y - R * 0.2, R * 0.3, y + R * 0.2, R, y); g.stroke(); }
      }
      if (a === 3 && det) {
        g.strokeStyle = "rgba(90, 150, 210, 0.45)"; g.lineWidth = Math.max(0.5, R * 0.02);
        for (let i = 0; i < 10; i++) { const x = (r() - 0.5) * R * 2, y = (r() - 0.5) * R * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * R, y + (r() - 0.5) * R); g.lineTo(x + (r() - 0.5) * R * 1.4, y + (r() - 0.5) * R * 1.4); g.stroke(); }
      }
      g.filter = "none";
      if (a === 0 || a === 2) for (let i = 0; i < (det ? 5 : 0); i++) crater(g, (r() - 0.5) * R * 1.5, (r() - 0.5) * R * 1.5, R * (0.04 + r() * 0.07), P.base, 0.55);
      if (a !== 2) {
        // polar caps
        g.fillStyle = css([246, 250, 255], a === 3 ? 0.4 : 0.85);
        g.save(); g.rotate(tilt * 0.5); g.beginPath(); g.ellipse(0, -R * 0.98, R * (0.38 + r() * 0.25), R * 0.2, 0, 0, TAU); g.fill();
        if (a === 1) { g.beginPath(); g.ellipse(0, R * 0.98, R * 0.4, R * 0.16, 0, 0, TAU); g.fill(); }
        g.restore();
      }
      if (a === 1 && det) {
        // swirling white clouds
        if (hi && "filter" in g) g.filter = "blur(" + Math.max(0.5, R * 0.03).toFixed(1) + "px)";
        g.strokeStyle = "rgba(255, 255, 255, 0.7)"; g.lineCap = "round";
        for (let i = 0; i < (hi ? 9 : 5); i++) {
          const x = (r() - 0.5) * R * 1.8, y = (r() - 0.5) * R * 1.6, l = R * (0.3 + r() * 0.6);
          g.lineWidth = Math.max(0.6, R * (0.04 + r() * 0.06));
          g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l * 0.5, y - l * 0.25, x + l, y + (r() - 0.5) * l * 0.4); g.stroke();
        }
        g.filter = "none";
      }
    }
    if (hi && det) speck(g, R, Math.round(R * 1.5), [mx3(P.base, K0, 0.4), mx3(P.base, K1, 0.3)], r, 0.04, 0.12, 0.02, 0.05);
    if (P.atmo) atmoLimb(g, R, P.atmo, P.atmoK);
    shade(g, R, a === 4 ? 0.97 : 0.92, false);
    if (a === 4 && R > 3) {
      // glowing lava rivers show on the night side too
      g.globalCompositeOperation = "lighter"; g.lineCap = "round"; g.lineJoin = "round";
      for (let pass = 0; pass < 2; pass++) {
        const rr = rng(look * 31 + 7);
        g.strokeStyle = pass ? "rgba(255, 196, 120, 0.7)" : "rgba(255, 90, 40, 0.22)";
        g.lineWidth = Math.max(0.5, R * (pass ? 0.018 : 0.08));
        for (let i = 0; i < 9; i++) {
          let x = (rr() - 0.5) * R * 1.8, y = (rr() - 0.5) * R * 1.8, a = rr() * TAU;
          g.beginPath(); g.moveTo(x, y);
          for (let k = 0; k < 4; k++) {
            a += (rr() - 0.5) * 1.4;
            const l = R * (0.15 + rr() * 0.2), nx = x + Math.cos(a) * l, ny = y + Math.sin(a) * l;
            g.quadraticCurveTo(x + Math.cos(a + 0.5) * l * 0.6, y + Math.sin(a + 0.5) * l * 0.6, nx, ny); x = nx; y = ny;
          }
          g.stroke();
        }
      }
      g.globalCompositeOperation = "source-over";
    }
    g.restore();
    if (a === 4) softBlob(g, 0, 0, R * 1.25, [255, 110, 50], 0.08);
    if (ringed) {
      sphereClip(g, R);
      g.rotate(tilt * 0.6);
      g.strokeStyle = "rgba(4, 5, 14, 0.4)"; g.lineWidth = R * 0.14;
      g.beginPath(); g.ellipse(R * 0.1, R * 0.16, R * 1.5, R * 0.42, 0, 0.05 * Math.PI, 0.95 * Math.PI); g.stroke();
      g.restore();
      ringPass(g, R, tilt * 0.6, P.ring, true, a === 7 ? 1.25 : 0.75, false);
    }
    if (variant === 1) {
      // a small companion moon, lit the same way
      const ma = -0.9 + r() * 0.6, mxp = Math.cos(ma) * R * 1.38, myp = Math.sin(ma) * R * 1.38, mr = R * (0.13 + r() * 0.08);
      g.save(); g.translate(mxp, myp);
      sphereClip(g, mr); g.fillStyle = css(jit([186, 182, 176], r, 0.2)); g.fillRect(-mr, -mr, mr * 2, mr * 2); shade(g, mr, 0.95, false); g.restore();
      g.restore();
    }
  },

  // Stars by spectral type: red dwarfs with spots to blue-white giants
  star(g, R, e, r, v, look) {
    const S = SPECTRA[SPEC_OF[look % SPEC_OF.length]], hi = quality === "high";
    const co = g.createRadialGradient(0, 0, R * 0.8, 0, 0, R * 2.7);
    co.addColorStop(0, css(S.co, 0.5 * S.glow));
    co.addColorStop(0.28, css(S.co, 0.17 * S.glow));
    co.addColorStop(1, css(S.co, 0));
    g.fillStyle = co;
    g.beginPath(); g.arc(0, 0, R * 2.7, 0, TAU); g.fill();
    if (hi) {
      g.save(); g.globalCompositeOperation = "lighter";
      for (let i = 0; i < 9; i++) {
        const a = r() * TAU, l = R * (1.5 + r() * 1.1 * S.glow);
        g.save(); g.rotate(a);
        const sg = g.createLinearGradient(R * 0.8, 0, l, 0);
        sg.addColorStop(0, css(mx3(S.co, K1, 0.4), 0.09)); sg.addColorStop(1, css(S.co, 0));
        g.fillStyle = sg;
        const bend = (r() - 0.5) * R * 0.5;
        g.beginPath(); g.moveTo(R * 0.8, -R * 0.3); g.quadraticCurveTo(l * 0.7, bend - R * 0.1, l, bend); g.quadraticCurveTo(l * 0.7, bend + R * 0.1, R * 0.8, R * 0.3); g.fill();
        g.restore();
      }
      g.restore();
    }
    const cg = g.createRadialGradient(-R * 0.12, -R * 0.12, 0, 0, 0, R);
    cg.addColorStop(0, css(mx3(S.core, K1, 0.75)));
    cg.addColorStop(0.5, css(mx3(S.core, K1, 0.3)));
    cg.addColorStop(0.88, css(S.core));
    cg.addColorStop(1, css(S.limb));
    g.fillStyle = cg;
    g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
    if (R > 5) {
      sphereClip(g, R);
      const cells = hi ? Math.min(260, Math.round(R * 8)) : Math.min(60, Math.round(R * 2));
      for (let i = 0; i < cells; i++) {
        const a = r() * TAU, d = Math.sqrt(r()) * R;
        g.fillStyle = r() < 0.6 ? css(K1, 0.07) : css(S.limb, 0.08);
        g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, R * (0.025 + r() * 0.04), 0, TAU); g.fill();
      }
      for (let i = 0; i < S.spots; i++) {
        const a = r() * TAU, d = r() * R * 0.6, s = R * (0.06 + r() * 0.07);
        softBlob(g, Math.cos(a) * d, Math.sin(a) * d, s * 1.8, S.limb, 0.45);
        g.fillStyle = css(mx3(S.limb, K0, 0.5), 0.6); g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, s * 0.6, 0, TAU); g.fill();
      }
      const ld = g.createRadialGradient(0, 0, R * 0.5, 0, 0, R);
      ld.addColorStop(0, "rgba(0,0,0,0)"); ld.addColorStop(1, css(S.limb, 0.55));
      g.fillStyle = ld; g.fillRect(-R, -R, R * 2, R * 2);
      g.restore();
    }
  },

  // Star systems: a sun (by spectral type), tilted orbits, little lit worlds,
  // sometimes a companion star or an asteroid belt
  system(g, R, e, r, v, look) {
    const S = SPECTRA[SPEC_OF[(look * 5) % SPEC_OF.length]], hi = quality === "high";
    const halo = g.createRadialGradient(0, 0, 0, 0, 0, R * 2.5);
    halo.addColorStop(0, css(S.co, 0.24)); halo.addColorStop(0.4, css(S.co, 0.07)); halo.addColorStop(1, css(S.co, 0));
    g.fillStyle = halo; g.beginPath(); g.arc(0, 0, R * 2.5, 0, TAU); g.fill();
    const tilt = r() * TAU, flat = 0.35 + r() * 0.3, no = 2 + (look % 3);
    g.save(); g.rotate(tilt); g.scale(1, flat);
    g.lineWidth = Math.max(0.5, R * 0.025);
    for (let i = 0; i < no; i++) { g.strokeStyle = css(S.co, 0.2 - i * 0.03); g.beginPath(); g.arc(0, 0, R * (0.75 + i * 0.5), 0, TAU); g.stroke(); }
    if (look % 4 === 1) speck(g, R * (1.2 + 0.25), hi ? 120 : 50, [[200, 190, 170], [150, 150, 160]], r, 0.3, 0.7, 0.015, 0.03, 1);
    g.restore();
    const WORLDS = [[110, 170, 230], [216, 168, 120], [150, 210, 160], [200, 176, 240], [230, 210, 160], [170, 110, 90]];
    for (let i = 0; i < no; i++) {
      const rr = R * (0.75 + i * 0.5), a = r() * TAU, pr = R * (0.08 + r() * 0.09);
      const x0 = Math.cos(a) * rr, y0 = Math.sin(a) * rr * flat;
      const px = x0 * Math.cos(tilt) - y0 * Math.sin(tilt), py = x0 * Math.sin(tilt) + y0 * Math.cos(tilt);
      g.save(); g.translate(px, py);
      sphereClip(g, pr); g.fillStyle = css(pick(r, WORLDS)); g.fillRect(-pr, -pr, pr * 2, pr * 2); shade(g, pr, 0.95, false); g.restore();
      g.restore();
    }
    const sun = (x, y, s, C) => {
      const cg = g.createRadialGradient(x, y, 0, x, y, s);
      cg.addColorStop(0, css(K1)); cg.addColorStop(0.35, css(mx3(C.core, K1, 0.4), 0.95)); cg.addColorStop(0.6, css(C.co, 0.35)); cg.addColorStop(1, css(C.co, 0));
      g.fillStyle = cg; g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill();
    };
    sun(0, 0, R * 0.6, S);
    if (look % 3 === 0) { const a = r() * TAU; sun(Math.cos(a) * R * 0.32, Math.sin(a) * R * 0.32, R * 0.36, SPECTRA[look % 2 ? "M" : "B"]); }
  },

  // Nebulae: emission clouds, blue reflection, planetary rings, dark pillars, supernova filaments
  nebula(g, R, e, r, v, look) {
    const kind = look % 5, hi = quality === "high", base = rgb(e.color);
    const second = [[255, 120, 150], [120, 210, 255], [120, 230, 200], [255, 170, 110], [190, 140, 255]][look % 5];
    const blurOn = "filter" in g && R > 8;
    if (kind === 2) {
      // planetary nebula: a glowing shell around a white dwarf
      g.save(); g.rotate(r() * TAU); g.scale(1, 0.7 + r() * 0.25);
      if (blurOn) g.filter = "blur(" + (R * 0.05).toFixed(1) + "px)";
      const sh = g.createRadialGradient(0, 0, R * 0.3, 0, 0, R * 1.2);
      sh.addColorStop(0, css(second, 0.15)); sh.addColorStop(0.45, css(second, 0.35)); sh.addColorStop(0.7, css(base, 0.5)); sh.addColorStop(0.85, css(base, 0.15)); sh.addColorStop(1, css(base, 0));
      g.fillStyle = sh; g.beginPath(); g.arc(0, 0, R * 1.2, 0, TAU); g.fill();
      g.filter = "none";
      g.restore();
      softBlob(g, 0, 0, R * 0.25, [240, 250, 255], 0.5);
      g.fillStyle = "rgba(255, 255, 255, 0.95)"; g.beginPath(); g.arc(0, 0, Math.max(0.7, R * 0.04), 0, TAU); g.fill();
      return;
    }
    if (kind === 4) {
      // supernova remnant: lacy filaments around an empty heart
      const sh = g.createRadialGradient(0, 0, R * 0.5, 0, 0, R * 1.2);
      sh.addColorStop(0, css(second, 0)); sh.addColorStop(0.7, css(second, 0.12)); sh.addColorStop(1, css(second, 0));
      g.fillStyle = sh; g.beginPath(); g.arc(0, 0, R * 1.2, 0, TAU); g.fill();
      g.save(); g.globalCompositeOperation = "lighter"; g.lineCap = "round";
      if (blurOn) g.filter = "blur(" + (R * 0.012).toFixed(1) + "px)";
      for (let i = 0; i < (hi ? 26 : 12); i++) {
        const a0 = r() * TAU, len = 0.5 + r() * 1.2, rr = R * (0.75 + r() * 0.4);
        g.strokeStyle = css(i % 3 ? base : second, 0.18 + r() * 0.22); g.lineWidth = Math.max(0.6, R * (0.015 + r() * 0.04));
        g.beginPath();
        const f = 2 + r() * 3, ph = r() * TAU;
        for (let k = 0; k <= 24; k++) { const a = a0 + len * k / 24, d = rr * (1 + Math.sin(a * f + ph) * 0.05); k ? g.lineTo(Math.cos(a) * d, Math.sin(a) * d) : g.moveTo(Math.cos(a) * d, Math.sin(a) * d); }
        g.stroke();
      }
      g.filter = "none"; g.restore();
      return;
    }
    const col = kind === 1 ? [130, 170, 255] : base;
    if (blurOn) g.filter = "blur(" + (R * 0.08).toFixed(1) + "px)";
    for (let i = 0; i < (hi ? 16 : 8); i++) {
      const a = r() * TAU, d = r() * R * 0.62, cr = R * (0.3 + r() * 0.5);
      softBlob(g, Math.cos(a) * d, Math.sin(a) * d * 0.8, cr, i % 3 === 1 ? second : col, (kind === 1 ? 0.22 : 0.3) * (0.6 + r() * 0.5));
    }
    if (kind === 0) softBlob(g, (r() - 0.5) * R * 0.3, (r() - 0.5) * R * 0.3, R * 0.45, mx3(second, K1, 0.3), 0.35);   // a hot ionised core
    g.filter = "none";
    if (kind === 3 && R > 6) {
      // dark pillars of dust with bright rims, rising from below
      for (let i = 0; i < 3; i++) {
        const x = (r() - 0.5) * R * 1.0, w = R * (0.14 + r() * 0.12), top = -R * (0.1 + r() * 0.5);
        g.beginPath(); g.moveTo(x - w * 1.6, R * 1.1); g.quadraticCurveTo(x - w, top + R * 0.3, x - w * 0.4, top); g.quadraticCurveTo(x, top - w, x + w * 0.5, top + w * 0.2);
        g.quadraticCurveTo(x + w, top + R * 0.4, x + w * 1.5, R * 1.1); g.closePath();
        g.save(); g.globalCompositeOperation = "source-atop";   // only where the glow is
        if (blurOn) g.filter = "blur(" + (R * 0.03).toFixed(1) + "px)";
        const pg = g.createLinearGradient(0, top, 0, R);
        pg.addColorStop(0, "rgba(14, 10, 22, 0.85)"); pg.addColorStop(1, "rgba(14, 10, 22, 0.5)");
        g.fillStyle = pg; g.fill();
        g.strokeStyle = css(mx3(col, K1, 0.6), 0.5); g.lineWidth = Math.max(0.5, R * 0.025);
        g.beginPath(); g.moveTo(x - w, top + R * 0.3); g.quadraticCurveTo(x - w * 0.9, top + R * 0.05, x - w * 0.4, top); g.quadraticCurveTo(x, top - w, x + w * 0.5, top + w * 0.2); g.stroke();
        g.filter = "none"; g.restore();
      }
    } else if (R > 6) {
      g.save(); g.globalCompositeOperation = "destination-out"; g.rotate(r() * TAU); g.scale(1, 0.15);
      const dl = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.1);
      dl.addColorStop(0, "rgba(0,0,0,0.55)"); dl.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = dl; g.fillRect(-R * 1.2, -R * 1.2, R * 2.4, R * 2.4); g.restore();
    }
    if (kind === 1) { softBlob(g, 0, 0, R * 0.3, [220, 235, 255], 0.5); glint(g, 0, 0, R * 0.35, [235, 245, 255], 0.8); }
    g.fillStyle = "rgba(255, 250, 240, 0.85)";
    for (let i = 0; i < 9; i++) { g.beginPath(); g.arc((r() - 0.5) * R * 1.3, (r() - 0.5) * R, Math.max(0.5, R * (0.012 + r() * 0.02)), 0, TAU); g.fill(); }
  },

  // Star clusters: dense round globulars or loose blue open clusters with nebulosity
  cluster(g, R, e, r, v, look) {
    const glob = look % 2 === 0, hi = quality === "high";
    if (glob) {
      const halo = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.5);
      halo.addColorStop(0, "rgba(255, 236, 196, 0.6)"); halo.addColorStop(0.25, "rgba(255, 226, 180, 0.2)"); halo.addColorStop(1, "rgba(255, 220, 170, 0)");
      g.fillStyle = halo; g.beginPath(); g.arc(0, 0, R * 1.5, 0, TAU); g.fill();
      const n = R > 10 ? (hi ? 320 : 140) : 60;
      for (let i = 0; i < n; i++) {
        const d = Math.pow(r(), 2.2) * R * 1.35, a = r() * TAU, s = Math.max(0.5, R * (0.012 + r() * 0.022));
        g.fillStyle = r() < 0.75 ? "rgba(255, 240, 210, 0.85)" : r() < 0.5 ? "rgba(255, 190, 140, 0.9)" : "rgba(200, 215, 255, 0.85)";
        g.fillRect(Math.cos(a) * d - s / 2, Math.sin(a) * d - s / 2, s, s);
      }
      softBlob(g, 0, 0, R * 0.32, [255, 248, 230], 0.6);
    } else {
      const neb = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.6);
      neb.addColorStop(0, "rgba(130, 170, 255, 0.18)"); neb.addColorStop(1, "rgba(130, 170, 255, 0)");
      g.fillStyle = neb; g.beginPath(); g.arc(0, 0, R * 1.6, 0, TAU); g.fill();
      const n = 14 + Math.floor(r() * 10);
      for (let i = 0; i < n; i++) {
        const d = Math.pow(r(), 0.9) * R * 1.3, a = r() * TAU, s = R * (0.03 + r() * r() * 0.07);
        const c = r() < 0.8 ? [190, 215, 255] : [255, 196, 140];
        softBlob(g, Math.cos(a) * d, Math.sin(a) * d, s * 3, c, 0.35);
        g.fillStyle = css(mx3(c, K1, 0.6)); g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, Math.max(0.6, s), 0, TAU); g.fill();
        if (s > R * 0.06 && hi) glint(g, Math.cos(a) * d, Math.sin(a) * d, s * 4, c, 0.4);
      }
    }
  },

  // Galaxies: grand spirals, barred spirals, smooth ellipticals, clumpy irregulars, edge-on disks
  galaxy(g, R, e, r, v, look) {
    const kind = look % 5, hi = quality === "high", tint = rgb(e.color);
    g.save();
    g.rotate(r() * TAU);
    if (kind === 2) {
      g.scale(1, 0.55 + r() * 0.35);
      const el = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.5);
      el.addColorStop(0, "rgba(255, 244, 220, 0.95)"); el.addColorStop(0.12, "rgba(255, 220, 170, 0.6)");
      el.addColorStop(0.45, "rgba(230, 180, 140, 0.18)"); el.addColorStop(1, "rgba(210, 160, 130, 0)");
      g.fillStyle = el; g.beginPath(); g.arc(0, 0, R * 1.5, 0, TAU); g.fill();
      g.restore();
      return;
    }
    if (kind === 4) {
      // edge-on: a thin bright disk with a dark dust lane through it
      g.restore(); g.save(); g.rotate(tiltOf(look));
      g.scale(1, 0.18);
      const d = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.5);
      d.addColorStop(0, "rgba(255, 240, 210, 0.9)"); d.addColorStop(0.3, css(mx3(tint, K1, 0.3), 0.45)); d.addColorStop(1, css(tint, 0));
      g.fillStyle = d; g.beginPath(); g.arc(0, 0, R * 1.5, 0, TAU); g.fill();
      g.restore();
      softBlob(g, 0, 0, R * 0.32, [255, 236, 200], 0.55);
      g.save(); g.rotate(tiltOf(look)); g.fillStyle = "rgba(12, 8, 18, 0.5)"; g.fillRect(-R * 1.2, -Math.max(0.5, R * 0.025), R * 2.4, Math.max(1, R * 0.05)); g.restore();
      return;
    }
    g.scale(1, 0.5 + r() * 0.4);
    const halo = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.6);
    halo.addColorStop(0, css(tint, 0.28)); halo.addColorStop(1, css(tint, 0));
    g.fillStyle = halo; g.beginPath(); g.arc(0, 0, R * 1.6, 0, TAU); g.fill();
    const n = R > 10 ? (hi ? 520 : 220) : 80;
    if (kind === 3) {
      // irregular: clumps of young blue stars and pink star-forming knots
      const cl = [];
      for (let i = 0; i < 6; i++) { const x = (r() - 0.5) * R * 1.5, y = (r() - 0.5) * R * 1.1; cl.push([x, y]); softBlob(g, x, y, R * (0.22 + r() * 0.3), r() < 0.5 ? [160, 190, 255] : tint, 0.26); }
      for (let i = 0; i < n * 0.5; i++) {
        const c = cl[i % cl.length], a = r() * TAU, d = Math.pow(r(), 1.6) * R * 0.4, s = Math.max(0.5, R * 0.025);
        g.fillStyle = r() < 0.12 ? "rgba(255, 150, 200, 0.75)" : "rgba(200, 220, 255, 0.6)";
        g.beginPath(); g.arc(c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d, s, 0, TAU); g.fill();
      }
      g.restore();
      return;
    }
    const bar = kind === 1, arms = 2, wind = 3.2 + r() * 1.4, d0 = bar ? 0.3 : 0.12;
    if (bar) { g.save(); g.scale(1, 0.28); softBlob(g, 0, 0, R * 0.55, [255, 230, 190], 0.6); g.restore(); }
    // the arms' diffuse glow first, then their stars
    for (let i = 0; i < 28; i++) {
      const arm = i % arms, t = (i >> 1) / 14;
      const ang = arm * Math.PI + t * wind, d = R * (d0 + t * 1.15);
      softBlob(g, Math.cos(ang) * d, Math.sin(ang) * d, R * (0.16 + t * 0.12), mx3(tint, [170, 200, 255], 0.4), 0.16 * (1 - t * 0.5));
    }
    for (let i = 0; i < n; i++) {
      const arm = i % arms, t = r();
      const ang = arm * Math.PI + t * wind + (r() - 0.5) * 0.5;
      const d = R * (d0 + t * 1.15) * (1 + (r() - 0.5) * 0.28);
      const s = Math.max(0.5, R * 0.03 * (1 - t * 0.5));
      g.fillStyle = t < 0.25 ? "rgba(255, 232, 196, 0.5)" : r() < 0.35 ? "rgba(170, 200, 255, 0.6)" : r() < 0.08 ? "rgba(255, 150, 200, 0.7)" : css(mx3(tint, [190, 210, 255], 0.3), 0.45);
      g.beginPath(); g.arc(Math.cos(ang) * d, Math.sin(ang) * d, s, 0, TAU); g.fill();
    }
    if (R > 10) {
      // dust lanes along the inner edges of the arms
      g.strokeStyle = "rgba(10, 6, 16, 0.32)"; g.lineWidth = Math.max(0.6, R * 0.035);
      for (let arm = 0; arm < arms; arm++) {
        g.beginPath();
        for (let k = 0; k <= 20; k++) { const t = 0.08 + k / 20 * 0.7, ang = arm * Math.PI + t * wind - 0.25, d = R * ((bar ? 0.3 : 0.12) + t * 1.2); k ? g.lineTo(Math.cos(ang) * d, Math.sin(ang) * d) : g.moveTo(Math.cos(ang) * d, Math.sin(ang) * d); }
        g.stroke();
      }
    }
    const core = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.42);
    core.addColorStop(0, "rgba(255, 250, 235, 0.95)"); core.addColorStop(1, "rgba(255, 230, 190, 0)");
    g.fillStyle = core; g.beginPath(); g.arc(0, 0, R * 0.42, 0, TAU); g.fill();
    g.restore();
  }
});

const tiltOf = look => (look * 1.618) % Math.PI;
// Spectral types: core, limb, corona colours; glow = corona strength; spots
const SPECTRA = {
  M: { core: [255, 150, 100], limb: [190, 60, 40], co: [255, 110, 80], glow: 0.8, spots: 4 },
  K: { core: [255, 196, 130], limb: [220, 110, 50], co: [255, 160, 90], glow: 0.9, spots: 2 },
  G: { core: [255, 230, 160], limb: [240, 150, 60], co: [255, 210, 120], glow: 1, spots: 1 },
  F: { core: [255, 246, 220], limb: [240, 200, 140], co: [255, 240, 200], glow: 1, spots: 0 },
  A: { core: [236, 242, 255], limb: [170, 190, 240], co: [200, 220, 255], glow: 1.1, spots: 0 },
  B: { core: [210, 226, 255], limb: [120, 150, 240], co: [160, 190, 255], glow: 1.25, spots: 0 }
};
const SPEC_OF = ["G", "K", "G", "M", "K", "F", "G", "A", "K", "B", "M", "G"];

function planetPalette(a, r) {
  const j = c => jit(c, r, 0.16);
  switch (a) {
    case 0: return { base: j([176, 96, 62]), bands: [j([120, 62, 44]), j([206, 140, 96]), j([150, 80, 56])], atmo: [255, 190, 160], atmoK: 0.35 };
    case 1: return { base: j([28, 70, 146]), bands: [j([66, 118, 58]), j([96, 136, 66]), j([84, 112, 54])], storm: [168, 146, 98], atmo: [130, 190, 255], atmoK: 1 };
    case 2: return { base: j([214, 172, 112]), bands: [j([180, 130, 80]), j([236, 200, 140]), j([150, 104, 70])], atmo: [255, 220, 170], atmoK: 0.45 };
    case 3: return { base: j([214, 232, 244]), bands: [j([170, 206, 236]), j([240, 248, 255]), j([150, 190, 226])], atmo: [190, 230, 255], atmoK: 0.5 };
    case 4: return { base: j([46, 34, 34]), bands: [j([70, 50, 46]), j([30, 24, 28])], atmo: null };
    case 5: return { base: j([222, 196, 160]), bands: [j([200, 150, 110]), j([238, 224, 200]), j([170, 120, 90]), j([226, 186, 140])], storm: j([200, 100, 70]), ring: [210, 190, 160], atmo: [255, 230, 200], atmoK: 0.55 };
    case 6: return { base: j([60, 110, 210]), bands: [j([90, 150, 230]), j([40, 80, 180]), j([120, 180, 240])], ring: [170, 190, 220], atmo: [140, 200, 255], atmoK: 0.9 };
    case 7: return { base: j([226, 204, 150]), bands: [j([240, 222, 176]), j([206, 176, 120]), j([230, 214, 170])], ring: j([226, 210, 170]), atmo: [255, 236, 190], atmoK: 0.5 };
    case 8: return { base: j([232, 210, 150]), bands: [j([244, 228, 180]), j([214, 186, 120]), j([250, 238, 200])], atmo: [255, 236, 190], atmoK: 1 };
    default: {
      const purple = r() < 0.5;
      return purple
        ? { base: j([150, 90, 170]), bands: [j([180, 120, 200]), j([110, 60, 140]), j([210, 160, 220])], ring: [200, 170, 220], atmo: [220, 170, 255], atmoK: 0.7 }
        : { base: j([90, 170, 150]), bands: [j([120, 200, 170]), j([60, 130, 120]), j([170, 230, 200])], ring: [170, 220, 200], atmo: [160, 255, 220], atmoK: 0.7 };
    }
  }
}

// Asteroid surface: mineral tone, mottling, craters, grit, shading (inside a clip)
function bodyFill(g, R, base, min, r, hi) {
  const lg = g.createLinearGradient(LX * R, LY * R, -LX * R, -LY * R);
  lg.addColorStop(0, css(mx3(base, K1, min === 2 ? 0.25 : 0.32))); lg.addColorStop(0.55, css(base)); lg.addColorStop(1, css(mx3(base, K0, 0.4)));
  g.fillStyle = lg; g.fillRect(-R * 1.5, -R * 1.5, R * 3, R * 3);
  if (R > 4) {
    for (let i = 0; i < 5; i++) softBlob(g, (r() - 0.5) * R * 1.6, (r() - 0.5) * R * 1.6, R * (0.25 + r() * 0.35), jit(base, r, 0.35), 0.35);
    const nc = hi ? 4 + Math.floor(r() * 5) : 3;
    for (let i = 0; i < nc; i++) { const a = r() * TAU, d = Math.sqrt(r()) * R * 0.75; crater(g, Math.cos(a) * d, Math.sin(a) * d, R * (0.07 + r() * r() * 0.22), base, 1); }
    speck(g, R * 1.1, hi ? Math.round(R * 3) : Math.round(R), [mx3(base, K0, 0.5), mx3(base, K1, 0.3)], r, 0.08, 0.25, 0.015, 0.04);
    if (min === 1) {
      // iron: bright metallic glints and a tight sheen
      for (let i = 0; i < (hi ? 6 : 3); i++) { g.fillStyle = "rgba(235, 240, 255, 0.55)"; const a = r() * TAU, d = r() * R * 0.7; g.fillRect(Math.cos(a) * d, Math.sin(a) * d, Math.max(0.6, R * 0.05), Math.max(0.6, R * 0.05)); }
      g.save(); g.translate(LX * R * 0.35, LY * R * 0.35); g.scale(1.4, 0.7); softBlob(g, 0, 0, R * 0.32, [240, 244, 255], 0.35); g.restore();
    }
  }
  shade(g, R, 0.78, true);
}
function smoothSub(g, pts, ox, oy) {
  const n = pts.length;
  let mxp = (pts[n - 1][0] + pts[0][0]) / 2 + ox, myp = (pts[n - 1][1] + pts[0][1]) / 2 + oy;
  g.moveTo(mxp, myp);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    g.quadraticCurveTo(p[0] + ox, p[1] + oy, (p[0] + q[0]) / 2 + ox, (p[1] + q[1]) / 2 + oy);
  }
  g.closePath();
}
function rimLightSmooth(g, R, pts) {
  if (R < 4) return;
  g.save();
  smoothPath(g, pts); g.clip();
  g.globalCompositeOperation = "lighter";
  g.lineWidth = Math.max(0.8, R * 0.12);
  const lg = g.createLinearGradient(LX * R, LY * R, 0, 0);
  lg.addColorStop(0, "rgba(255, 244, 225, 0.38)"); lg.addColorStop(1, "rgba(255, 244, 225, 0)");
  g.strokeStyle = lg;
  smoothPath(g, pts); g.stroke();
  g.restore();
}

// v9: a meteor entering hot: heated glow on its leading (+x) edge. Cached per size.
const heatCache = new Map();
export function heatFor(rpx) {
  const b = bucketFor(rpx);
  let c = heatCache.get(b);
  if (c) return c;
  const size = Math.ceil(b * 4.4) + 2;
  c = makeCanvas(size);
  const g = c.getContext("2d");
  g.translate(size / 2, size / 2);
  const gr = g.createRadialGradient(b * 0.55, 0, 0, b * 0.55, 0, b * 1.05);
  gr.addColorStop(0, "rgba(255, 226, 180, 0.6)"); gr.addColorStop(0.5, "rgba(255, 150, 80, 0.3)"); gr.addColorStop(1, "rgba(255, 120, 60, 0)");
  g.fillStyle = gr; g.fillRect(-size / 2, -size / 2, size, size);
  // only the leading half glows
  g.globalCompositeOperation = "destination-in";
  const m = g.createLinearGradient(-b * 0.2, 0, b * 1.1, 0);
  m.addColorStop(0, "rgba(0,0,0,0)"); m.addColorStop(1, "rgba(0,0,0,1)");
  g.fillStyle = m; g.fillRect(-size / 2, -size / 2, size, size);
  c = { c, k: size / b };
  heatCache.set(b, c);
  return c;
}

// ─── Comet tails (cached per colour + size, drawn rotated) ───
const tailCache = new Map();
export function tailFor(color, rpx, ion, hot) {
  const b = bucketFor(rpx);
  let byB = tailCache.get(color);
  if (!byB) { byB = {}; tailCache.set(color, byB); }
  const slot = hot ? b + 1000 : ion ? -b : b;
  let t = byB[slot];
  if (t) return t;
  if (ion) { t = ionTail(color, b); byB[slot] = t; return t; }
  if (hot) { t = entryStreak(b); byB[slot] = t; return t; }
  const len = Math.ceil(b * 9), hgt = Math.ceil(b * 2.4);
  const c = document.createElement("canvas");
  c.width = len; c.height = hgt;
  const g = c.getContext("2d");
  const cy = hgt / 2;
  const lg = g.createLinearGradient(0, 0, len, 0);
  lg.addColorStop(0, light(color, 0.55, 0.5));
  lg.addColorStop(0.35, mix(color, [255, 236, 200], 0.6, 0.2));
  lg.addColorStop(1, mix(color, [255, 236, 200], 0.8, 0));
  g.fillStyle = lg;
  if ("filter" in g) g.filter = "blur(" + Math.max(0.5, b * 0.15).toFixed(1) + "px)";
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
  g.filter = "none";
  t = { c, k: b };
  byB[slot] = t;
  if (tailCache.size > 40) tailCache.delete(tailCache.keys().next().value);
  return t;
}
// v9: a meteor's glowing entry streak: thin, straight, white-hot to ember
function entryStreak(b) {
  const len = Math.ceil(b * 10), hgt = Math.ceil(b * 1.6);
  const c = document.createElement("canvas");
  c.width = len; c.height = hgt;
  const g = c.getContext("2d");
  const cy = hgt / 2;
  const lg = g.createLinearGradient(0, 0, len, 0);
  lg.addColorStop(0, "rgba(255, 226, 170, 0.75)");
  lg.addColorStop(0.18, "rgba(255, 160, 90, 0.45)");
  lg.addColorStop(0.6, "rgba(200, 90, 70, 0.12)");
  lg.addColorStop(1, "rgba(160, 70, 80, 0)");
  g.fillStyle = lg;
  if ("filter" in g) g.filter = "blur(" + Math.max(0.5, b * 0.12).toFixed(1) + "px)";
  g.beginPath(); g.moveTo(0, cy - b * 0.5); g.quadraticCurveTo(len * 0.25, cy - b * 0.12, len, cy); g.quadraticCurveTo(len * 0.25, cy + b * 0.12, 0, cy + b * 0.5); g.fill();
  const ig = g.createLinearGradient(0, 0, len * 0.5, 0);
  ig.addColorStop(0, "rgba(255, 250, 230, 0.6)"); ig.addColorStop(1, "rgba(255, 250, 230, 0)");
  g.fillStyle = ig;
  g.beginPath(); g.ellipse(0, cy, len * 0.4, b * 0.14, 0, 0, TAU); g.fill();
  g.filter = "none";
  return { c, k: b };
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
