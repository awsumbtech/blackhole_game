// ─── Flagship (v9.6) ───
// The Ruined Armada's landmark: one huge, broken capital wreck that sits just
// behind play. It has one job: paint that wreck once, in high detail, into a
// cached sprite, then stamp it each frame.
//
// Look (DESIGN §3, same language as ships.js at a larger scale): a long armoured
// prow, a stepped bridge tower, an edge-on habitat ring seen at an angle, hangar
// wings, swept radiator vanes and a bank of cold drives. The spine has snapped
// behind the ring and the stern has drifted a little apart, with bare girders
// and shards in the gap. Plates carry painterly tone, seams and brush grain.
// Warm key light rims the upper edges and the galaxy's own colour bounces off
// the lower edges. Most windows are dark, with a few warm clusters still lit.
//
// Calm rules (§0/§2): nothing blinks or flashes. A small, separate ember layer
// (lit clusters, the torn spine, two banked drives, steady marker lights)
// breathes slowly with the galaxy. Reduce Motion holds it still.
//
// Cost: painting runs once per look and galaxy light (2-entry cache). Each frame
// does two drawImage calls (hull plus ember glow).

const TAU = Math.PI * 2;
const X0 = -1.16, X1 = 1.16, YH = 0.56;            // sprite bounds in ship units
const UNIT = 1.25;                                  // world size per ship unit, in flagship.size
const KEY = [255, 236, 206];
const HULLS = [[112, 104, 114], [102, 106, 118], [118, 108, 98], [98, 106, 110]];
const ACCENTS = [[150, 86, 60], [160, 128, 70], [70, 112, 120], [134, 70, 62]];

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const c3 = (c, a) => `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${a})`;
const tone = (c, t) => t >= 0 ? [c[0] + (255 - c[0]) * t, c[1] + (250 - c[1]) * t, c[2] + (240 - c[2]) * t] : [c[0] * (1 + t), c[1] * (1 + t), c[2] * (1 + t)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Parts are polygons in ship units: nose at +x, stern at -x, beam along y.
// t = tone, win = window rows, deck = plating density, aft = drifts with the stern
const quad = (x0, x1, w0, w1, cy = 0) => [x0, cy - w0, x1, cy - w1, x1, cy + w1, x0, cy + w0];
function sym(top) {   // symmetric outline from its upper half (nose to tail)
  const p = top.slice();
  for (let i = top.length - 2; i >= 0; i -= 2) if (top[i + 1] !== 0) p.push(top[i], -top[i + 1]);
  return p;
}
const mirror = p => p.map((v, i) => i & 1 ? -v : v);

/** The wreck's layout for one look: parts, lights, damage. Pure data. */
function layout(look) {
  const r = rng((look + 3) * 2246822519);
  const j = (a, b) => a + (b - a) * r();
  const P = [];
  const add = (p, o = {}) => { const q = Object.assign({ p, t: 0, deck: 1 }, o); P.push(q); return q; };
  const both = (p, o) => { add(p, o); add(mirror(p), Object.assign({}, o, { lower: 1 })); };
  const sw = j(0.07, 0.085), ringX = j(-0.34, -0.26), brkX = ringX - j(0.1, 0.14);

  // drive section and stern block
  add(quad(-1.04, -0.66, 0.2, 0.16), { t: -0.06, greeble: 1 });
  add(quad(-0.98, -0.72, 0.13, 0.11), { t: 0.08, greeble: 1, win: 1 });
  both([-0.94, -0.2, -0.78, -0.2, -0.86, -0.27, -0.98, -0.27], { t: -0.12 });
  // radiator vanes, swept back; the wreck has lost some of their length
  for (let i = 0; i < 3; i++) {
    const x = -0.64 + i * 0.07, len = j(0.13, 0.2) * (i === 1 ? 0.65 : 1), len2 = j(0.1, 0.2);
    add([x, -sw, x + 0.04, -sw, x - 0.05, -sw - len, x - 0.075, -sw - len * 0.94], { t: -0.14, vane: 1, aft: 1 });
    add([x, sw, x + 0.04, sw, x - 0.05, sw + len2, x - 0.075, sw + len2 * 0.94], { t: -0.16, vane: 1, aft: 1, lower: 1 });
  }
  // the long spine (fore and aft of the break)
  add(quad(-0.7, brkX, sw, sw), { t: -0.04, win: 1 });
  add(quad(brkX + 0.04, 0.3, sw, sw * 0.9), { t: -0.02, win: 1, greeble: 1 });
  // hangar wings either side of the spine, forward of the ring
  both(quad(ringX + 0.07, 0.12, 0.05, 0.04, -(sw + 0.06)), { t: 0.02, win: 1, hangar: 1 });
  // armoured prow: three stepped plates, each lighter
  add(sym([1.12, 0, 0.9, -0.07, 0.55, -0.17, 0.2, -0.2, 0.08, -0.13, 0.08, 0]), { t: 0.02, win: 1 });
  add(sym([1.0, 0, 0.8, -0.05, 0.5, -0.12, 0.22, -0.14, 0.14, -0.09, 0.14, 0]), { t: 0.12, win: 1 });
  add(sym([0.86, 0, 0.62, -0.05, 0.3, -0.08, 0.22, -0.06, 0.22, 0]), { t: 0.22, greeble: 1 });
  both(quad(0.3, 0.76, 0.008, 0.006, -0.075), { t: 0, accent: 1, deck: 0 });     // prow stripe
  // the bridge tower, stepping up
  const bx = j(0.02, 0.1);
  for (let i = 0; i < 4; i++) {
    const a = bx - 0.16 + i * 0.03, b = bx + 0.12 - i * 0.025, w = 0.075 - i * 0.015;
    add(quad(a, b, w, w * 0.8), { t: 0.14 + i * 0.08, win: i < 3 ? 1 : 0, greeble: i === 3 ? 1 : 0, tower: 1 });
  }
  // damage: scorch / torn plates, kept off the bridge
  const holes = [];
  for (let i = 0; i < 9; i++) holes.push([j(-0.95, 0.95), j(-0.16, 0.16) * (r() < 0.3 ? 1.6 : 1), j(0.018, 0.05), (r() * 1e6) | 0]);
  // a few warm window clusters still lit (in ship units)
  const lit = [];
  for (let i = 0; i < 6; i++) lit.push([j(-0.9, 0.85), j(-0.18, 0.18), j(0.04, 0.09)]);
  // steady marker lights: prow, tower top, stern (never blink)
  const marks = [[1.08, 0, [255, 150, 110]], [bx + 0.0, 0, [255, 200, 140]], [-1.02, -0.18, [255, 120, 100]]];
  // two drives still banked warm
  const drives = [];
  for (let i = 0; i < 5; i++) drives.push([-1.05, (i - 2) * 0.075, 0.032]);
  const warm = [(r() * 5) | 0, (r() * 5) | 0];
  for (const p of P) if (!p.aft) { let mx = 0; for (let i = 0; i < p.p.length; i += 2) mx += p.p[i]; p.aft = mx / (p.p.length / 2) < brkX; }
  return { P, holes, lit, marks, drives, warm, ringX, brkX, sw, brk: { rot: j(0.05, 0.09) * (r() < 0.5 ? -1 : 1), dx: -j(0.03, 0.05), dy: j(-0.015, 0.015) },
    hull: HULLS[look % HULLS.length], accent: ACCENTS[(look * 3) % ACCENTS.length], seed: (r() * 1e9) | 0 };
}

function trace(g, p) {
  g.beginPath(); g.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
  g.closePath();
}
function inside(p, x, y) {
  let a = false;
  for (let i = 0, k = p.length - 2; i < p.length; k = i, i += 2)
    if ((p[i + 1] > y) !== (p[k + 1] > y) && x < (p[k] - p[i]) * (y - p[i + 1]) / (p[k + 1] - p[i + 1]) + p[i]) a = !a;
  return a;
}
function bbox(p) {
  let a = 9, b = 9, c = -9, d = -9;
  for (let i = 0; i < p.length; i += 2) { a = Math.min(a, p[i]); c = Math.max(c, p[i]); b = Math.min(b, p[i + 1]); d = Math.max(d, p[i + 1]); }
  return [a, b, c, d];
}

export class Flagship {
  constructor() { this.cache = new Map(); this.job = null; this.lastMs = 0; }

  /**
   * The cached sprite for a look, galaxy light and quality ({ hull, ember, w, h, ppu, ms }),
   * or null while it is still being painted. Painting is spread over frames
   * (a few ms each) so arriving in the Armada never hitches.
   * ring = false paints the Zen look: no habitat ring loop, only short stubs
   * at the hub (Brian: never a ring around the hole in Zen).
   */
  /** Cache lookup only. Does not paint. born is the wall-clock time the sprite finished. */
  peek(look, light, lite, ring = true) {
    const key = `${look}|${light.key}|${lite ? 1 : 0}|${ring ? 1 : 0}`;
    const s = this.cache.get(key);
    return s ? { ready: true, born: s.born || 0 } : { ready: false, born: 0 };
  }

  sprite(look, light, lite, ring = true, budgetMs = 4) {
    const key = `${look}|${light.key}|${lite ? 1 : 0}|${ring ? 1 : 0}`;
    const s = this.cache.get(key);
    if (s) return s;
    if (!this.job || this.job.key !== key) this.job = { key, it: this.paint(layout(look), light.rgb, lite ? 1280 : 2048, ring), ms: 0 };
    const t0 = performance.now();
    let res;
    do res = this.job.it.next(); while (!res.done && performance.now() - t0 < budgetMs);
    this.job.ms += performance.now() - t0;
    if (!res.done) return null;
    res.value.ms = this.lastMs = this.job.ms; res.value.born = performance.now();
    this.job = null;
    if (this.cache.size >= 2) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, res.value);
    return res.value;
  }

  /**
   * Stamp the wreck. (x, y) world centre, size = flagship.size, rot = heading,
   * a = hull opacity, glowA = ember-layer opacity (already breathing).
   */
  draw(ctx, sp, x, y, size, rot, a, glowA) {
    const k = size * UNIT / sp.ppu, w = sp.w * k, h = sp.h * k;
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.globalAlpha = a;
    ctx.drawImage(sp.hull, -w / 2, -h / 2, w, h);
    if (glowA > 0.01) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = glowA;
      ctx.drawImage(sp.ember, -w / 2, -h / 2, w, h);
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.rotate(-rot); ctx.translate(-x, -y);
  }

  // ─── Painting (once, as a generator: one part per step) ───
  *paint(L, bounce, W, hasRing = true) {
    const ppu = W / (X1 - X0), H = Math.ceil(YH * 2 * ppu);
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d");
    const px = 1 / ppu, r = rng(L.seed);
    g.translate(W / 2, H / 2); g.scale(ppu, ppu);
    const base = L.hull, aft = L.brk;
    const aftT = (fn) => { g.save(); g.translate(L.brkX + aft.dx, aft.dy); g.rotate(aft.rot); g.translate(-L.brkX, 0); fn(); g.restore(); };
    // Canvas defers drawing until something reads it; stamping into a 1px canvas
    // after each step makes the raster work happen here, a slice per frame.
    const tap = document.createElement("canvas"); tap.width = tap.height = 1;
    const tg = tap.getContext("2d"), flush = () => tg.drawImage(c, 0, 0, 1, 1, 0, 0, 1, 1);

    // the habitat ring, far half behind the hull
    if (hasRing) { this.ring(g, L, base, bounce, px, r, false); flush(); yield; }
    // stern first (it sits a touch further away), then the gap, then the fore hull
    for (const p of L.P) if (p.aft) { aftT(() => this.part(g, p, L, base, bounce, px, r)); flush(); yield; }
    aftT(() => this.drives(g, L, base, px));
    this.girders(g, L, base, bounce, px, r); flush(); yield;
    for (const p of L.P) if (!p.aft && !p.tower) { this.part(g, p, L, base, bounce, px, r); flush(); yield; }
    if (hasRing) this.ring(g, L, base, bounce, px, r, true); else this.stubs(g, L, base, bounce, px, r);
    flush(); yield;
    for (const p of L.P) if (p.tower) { this.part(g, p, L, base, bounce, px, r); flush(); yield; }
    this.damage(g, L, base, px); flush(); yield;
    this.windows(g, L, px, r, aftT); flush(); yield;
    for (const _ of this.finish(g, L, bounce, px, r)) { flush(); yield; }
    const ember = this.embers(L, bounce, W, H, ppu);
    return { hull: c, ember, w: W, h: H, ppu };
  }

  part(g, q, L, base, bounce, px, r) {
    const p = q.p, [x0, y0, x1, y1] = bbox(p);
    const col = q.accent ? mix(L.accent, base, 0.25) : base;
    const c = tone(col, q.t);
    // soft contact shadow so raised plates sit on what's under them
    const sh = px > 0 ? 1 / px / 120 : 1;   // shadow size scales with the sprite
    g.save(); g.globalCompositeOperation = "source-atop"; g.shadowColor = "rgba(2, 2, 8, 0.75)"; g.shadowBlur = 16 * sh; g.shadowOffsetY = 7 * sh;
    trace(g, p); g.fillStyle = c3(tone(c, -0.6), 1); g.fill(); g.restore();
    // rims: warm key above, galaxy bounce below
    const rim = Math.max(1.6 * px, 0.0035);
    g.save(); g.translate(0, -rim); trace(g, p); g.fillStyle = c3(tone(KEY, -0.05), q.lower ? 0.35 : 0.8); g.fill(); g.restore();
    g.save(); g.translate(0, rim); trace(g, p); g.fillStyle = c3(tone(bounce, 0.15), q.lower ? 0.7 : 0.45); g.fill(); g.restore();
    // body, lit from above
    trace(g, p);
    const lg = g.createLinearGradient(0, y0, 0, y1);
    lg.addColorStop(0, c3(tone(c, 0.2), 1)); lg.addColorStop(0.3, c3(c, 1)); lg.addColorStop(1, c3(tone(c, -0.62), 1));
    g.fillStyle = lg; g.fill();
    g.save(); trace(g, p); g.clip();
    const w = x1 - x0, h = y1 - y0;
    // painterly tonal unevenness: big soft light/dark washes
    for (let i = 0, n = 3 + (w * h * 400 | 0); i < Math.min(n, 18); i++) {
      const cx = x0 + r() * w, cy = y0 + r() * h, rr = Math.max(w, h) * (0.15 + r() * 0.3);
      const gg = g.createRadialGradient(cx, cy, 0, cx, cy, rr), light = r() < 0.5;
      gg.addColorStop(0, light ? "rgba(255, 246, 230, 0.07)" : "rgba(8, 6, 16, 0.12)"); gg.addColorStop(1, "rgba(0, 0, 0, 0)");
      g.fillStyle = gg; g.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
    }
    if (q.deck) {
      // plating: staggered rows of plates with tone jitter and dark seams
      const rowH = q.vane ? 0.014 : 0.024 + r() * 0.01;
      g.lineWidth = Math.max(0.7 * px, 0.0012);
      for (let y = y0, row = 0; y < y1; y += rowH, row++) {
        let x = x0 - r() * 0.03;
        while (x < x1) {
          const pw = 0.03 + r() * 0.07;
          const v = (r() - 0.5) * 0.12;
          g.fillStyle = v > 0 ? `rgba(255, 248, 232, ${v * 0.5})` : `rgba(6, 6, 14, ${-v})`;
          g.fillRect(x, y, pw, rowH);
          g.strokeStyle = c3(tone(c, -0.6), 0.2);
          g.strokeRect(x, y, pw, rowH);
          x += pw;
        }
        // highlight seam on each row's upper edge
        g.strokeStyle = c3(tone(c, 0.4), 0.07);
        g.beginPath(); g.moveTo(x0, y + 1.2 * px); g.lineTo(x1, y + 1.2 * px); g.stroke();
      }
      // brush grain along the hull's length
      g.lineCap = "round";
      for (let i = 0, n = Math.min(160, 20 + w * h * 3000 | 0); i < n; i++) {
        const sx = x0 + r() * w, sy = y0 + r() * h, len = 0.02 + r() * 0.08;
        g.strokeStyle = r() < 0.5 ? "rgba(255, 244, 224, 0.05)" : "rgba(0, 0, 12, 0.07)";
        g.lineWidth = (1 + r() * 2.5) * px;
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + len, sy + (r() - 0.5) * 0.004); g.stroke();
      }
    }
    if (q.deck && w > 0.25 && h > 0.06) {
      // long recessed trenches: a dark cut with a lit far wall (sells the size)
      for (let i = 0, n = h > 0.2 ? 3 : 1; i < n; i++) {
        const ty = y0 + h * (0.25 + 0.5 * (n === 1 ? 0.5 : i / (n - 1))) + (r() - 0.5) * 0.01, tw = 0.004 + r() * 0.004;
        g.fillStyle = "rgba(6, 6, 14, 0.6)"; g.fillRect(x0, ty, w, tw);
        g.fillStyle = c3(tone(KEY, -0.1), 0.16); g.fillRect(x0, ty + tw, w, 1.2 * px);
      }
    }
    if (q.vane) {
      g.strokeStyle = c3(tone(c, -0.55), 0.55); g.lineWidth = 1.1 * px;
      g.beginPath(); for (let y = y0; y < y1; y += 0.009) { g.moveTo(x0, y); g.lineTo(x1, y); } g.stroke();
    }
    if (q.hangar) {
      // dark hangar mouths with a faint warm floor still lit
      for (let i = 0; i < 3; i++) {
        const hx = x0 + 0.02 + i * (w - 0.04) / 3, hw = (w - 0.04) / 3 - 0.012, hy = (y0 + y1) / 2;
        g.fillStyle = "rgba(8, 9, 18, 0.85)"; g.fillRect(hx, hy - 0.014, hw, 0.028);
        g.fillStyle = "rgba(255, 186, 120, 0.16)"; g.fillRect(hx + 0.004, hy + 0.006, hw - 0.008, 0.005);
      }
    }
    if (q.deck && w * h > 0.01) {
      // city blocks: raised superstructure, each with a soft shadow and a lit top edge
      for (let i = 0, n = Math.min(24, w * h * 180 | 0); i < n; i++) {
        const bw = 0.012 + r() * 0.035, bh = 0.008 + r() * 0.016, bx = x0 + r() * (w - bw), by = y0 + Math.round(r() * (h - bh) / 0.024) * 0.024;
        if (!inside(p, bx, by) || !inside(p, bx + bw, by + bh)) continue;
        const t = (r() - 0.4) * 0.25;
        g.fillStyle = "rgba(2, 2, 8, 0.35)"; g.fillRect(bx + 0.003, by + 0.004, bw, bh);
        g.fillStyle = c3(tone(c, t), 1); g.fillRect(bx, by, bw, bh);
        g.fillStyle = c3(tone(KEY, -0.05), 0.35); g.fillRect(bx, by, bw, 1.4 * px);
        g.fillStyle = "rgba(4, 4, 12, 0.35)"; g.fillRect(bx, by + bh - 1.4 * px, bw, 1.4 * px);
      }
    }
    if (q.greeble) {
      // grouped greebles: vents, tanks, blocks, each with its own shadow and lit top
      for (let i = 0, n = 6 + (w * 14 | 0); i < n; i++) {
        const gx = x0 + w * (0.08 + 0.84 * r()), gy = y0 + h * (0.25 + 0.5 * r());
        for (let m = 0, k = 2 + (r() * 3 | 0); m < k; m++) {
          const bw = 0.005 + r() * 0.012, bh = 0.004 + r() * 0.009, bx = gx + m * (bw + 0.003);
          g.fillStyle = "rgba(4, 4, 12, 0.45)"; g.fillRect(bx + 0.002, gy + 0.002, bw, bh);
          g.fillStyle = c3(tone(c, 0.02 + r() * 0.12), 0.9); g.fillRect(bx, gy, bw, bh);
          g.fillStyle = c3(tone(KEY, -0.1), 0.18); g.fillRect(bx, gy, bw, 1.2 * px);
        }
      }
    }
    g.restore();
    // crisp edge line so the silhouette holds when it's small
    trace(g, p); g.strokeStyle = c3(tone(c, -0.7), 0.6); g.lineWidth = 1 * px; g.stroke();
  }

  ring(g, L, base, bounce, px, r, front) {
    // an edge-on habitat ring seen at a slant: an ellipse band; the near half
    // crosses in front of the spine. One segment of it is torn away.
    const cx = L.ringX, rx = 0.085, ry = 0.44, th = 0.026;
    g.save();
    g.beginPath();
    if (front) g.rect(cx, -YH, 1, YH * 2); else g.rect(cx - 1, -YH, 1, YH * 2);
    g.clip();
    // the torn gap
    g.beginPath(); g.rect(-2, -YH, 4, YH * 2);
    g.moveTo(cx - 0.2, 0.25); g.lineTo(cx + 0.2, 0.22); g.lineTo(cx + 0.2, 0.31); g.lineTo(cx - 0.2, 0.29); g.closePath();
    g.clip("evenodd");
    const c = tone(base, front ? 0.04 : -0.35);
    g.lineWidth = th;
    g.save(); g.translate(0, -1.5 * px); g.strokeStyle = c3(tone(KEY, -0.1), front ? 0.45 : 0.2);
    g.beginPath(); g.ellipse(cx, 0, rx, ry, 0, 0, TAU); g.stroke(); g.restore();
    g.save(); g.translate(0, 1.5 * px); g.strokeStyle = c3(bounce, 0.35);
    g.beginPath(); g.ellipse(cx, 0, rx, ry, 0, 0, TAU); g.stroke(); g.restore();
    const lg = g.createLinearGradient(0, -ry, 0, ry);
    lg.addColorStop(0, c3(tone(c, 0.2), 1)); lg.addColorStop(0.5, c3(c, 1)); lg.addColorStop(1, c3(tone(c, -0.4), 1));
    g.strokeStyle = lg; g.beginPath(); g.ellipse(cx, 0, rx, ry, 0, 0, TAU); g.stroke();
    // segment seams and dark window slots along the band
    g.lineWidth = 1 * px; g.strokeStyle = c3(tone(c, -0.6), 0.35);
    for (let a = 0; a < TAU; a += TAU / 36) {
      const ex = cx + Math.cos(a) * rx, ey = Math.sin(a) * ry;
      g.beginPath(); g.moveTo(ex - th * 0.5, ey); g.lineTo(ex + th * 0.5, ey); g.stroke();
    }
    if (front) {
      // spokes to the hub
      g.lineWidth = 0.006; g.strokeStyle = c3(tone(base, -0.15), 0.9);
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx, s * 0.06); g.lineTo(cx + 0.03, s * (ry - 0.02)); g.stroke(); }
    }
    g.restore();
    if (front) {
      // hub collar on the spine
      const p = quad(cx - 0.035, cx + 0.035, L.sw + 0.025, L.sw + 0.025);
      this.part(g, { p, t: 0.1, deck: 1, win: 0 }, L, base, bounce, px, r);
      // the torn ends: ragged dark edges with a faint ember line
      for (const yy of [0.235, 0.305]) {
        g.fillStyle = "rgba(20, 14, 14, 0.9)";
        g.beginPath(); g.ellipse(cx + rx * Math.cos(Math.asin(yy / ry)), yy, th * 0.7, 0.006, 0, 0, TAU); g.fill();
      }
    }
  }

  stubs(g, L, base, bounce, px, r) {
    // Zen look: the ring is gone; two short torn spars stand off the hub collar
    // (short open arcs, never a loop), with dark ragged tips
    const cx = L.ringX, th = 0.024;
    g.lineCap = "butt";
    for (const s of [-1, 1]) {
      const y0 = s * (L.sw + 0.02), y1 = s * (L.sw + 0.02 + 0.1);
      const lg = g.createLinearGradient(0, y0, 0, y1);
      lg.addColorStop(0, c3(tone(base, 0.05), 1)); lg.addColorStop(1, c3(tone(base, -0.35), 1));
      g.strokeStyle = lg; g.lineWidth = th;
      g.beginPath(); g.moveTo(cx, y0); g.lineTo(cx + 0.012, y1); g.stroke();
      g.strokeStyle = c3(tone(KEY, -0.1), s < 0 ? 0.4 : 0.15); g.lineWidth = 1.2 * px;
      g.beginPath(); g.moveTo(cx - th / 2, y0); g.lineTo(cx + 0.012 - th / 2, y1); g.stroke();
      g.fillStyle = "rgba(20, 14, 14, 0.9)";
      g.beginPath(); g.ellipse(cx + 0.012, y1, th * 0.6, 0.006, 0, 0, TAU); g.fill();
    }
    const p = quad(cx - 0.035, cx + 0.035, L.sw + 0.025, L.sw + 0.025);
    this.part(g, { p, t: 0.1, deck: 1, win: 0 }, L, base, bounce, px, r);
  }

  girders(g, L, base, bounce, px, r) {
    // bare frame between the snapped halves: two rails, a zigzag truss, shards
    const a = L.brkX - 0.06, b = L.brkX + 0.05, w = L.sw * 0.7;
    g.lineCap = "round";
    for (const s of [-1, 1]) {
      g.strokeStyle = c3(tone(base, -0.3), 0.95); g.lineWidth = 0.007;
      g.beginPath(); g.moveTo(a, s * w); g.lineTo(b - (s > 0 ? 0.02 : 0), s * w * 0.9); g.stroke();
      g.strokeStyle = c3(tone(KEY, -0.1), 0.35); g.lineWidth = 1.2 * px;
      g.beginPath(); g.moveTo(a, s * w - 0.0035); g.lineTo(b - 0.02, s * w * 0.9 - 0.0035); g.stroke();
    }
    g.strokeStyle = c3(tone(base, -0.4), 0.85); g.lineWidth = 0.0035;
    g.beginPath();
    for (let x = a, k = 0; x < b - 0.01; x += 0.018, k++) { g.moveTo(x, -w); g.lineTo(x + 0.018, w * (k & 1 ? -1 : 1)); }
    g.stroke();
    // shards drifting in the gap
    for (let i = 0; i < 9; i++) {
      const sx = L.brkX + (r() - 0.6) * 0.12, sy = (r() - 0.5) * 0.32, s = 0.006 + r() * 0.014, rot = r() * TAU;
      g.save(); g.translate(sx, sy); g.rotate(rot);
      g.fillStyle = c3(tone(base, -0.1 - r() * 0.3), 0.95);
      g.beginPath(); g.moveTo(-s, -s * 0.4); g.lineTo(s * 1.4, -s * 0.2); g.lineTo(s * 0.6, s * 0.6); g.lineTo(-s * 0.8, s * 0.5); g.closePath(); g.fill();
      g.fillStyle = c3(tone(KEY, -0.1), 0.35); g.fillRect(-s, -s * 0.4, s * 2, 1.2 * px);
      g.restore();
    }
  }

  drives(g, L, base, px) {
    // big engine bells, cold and dark inside; two still hold a banked glow (ember layer)
    for (let i = 0; i < L.drives.length; i++) {
      const [x, y, s] = L.drives[i];
      g.beginPath(); g.ellipse(x, y, s * 0.5, s, 0, 0, TAU);
      g.fillStyle = c3(tone(base, -0.6), 1); g.fill();
      g.lineWidth = 2 * px; g.strokeStyle = c3(tone(base, 0.25), 0.75); g.stroke();
      g.beginPath(); g.ellipse(x - s * 0.08, y, s * 0.32, s * 0.72, 0, 0, TAU);
      g.fillStyle = L.warm.includes(i) ? "rgba(96, 58, 48, 0.9)" : "rgba(10, 10, 20, 0.95)"; g.fill();
    }
  }

  damage(g, L, base, px) {
    g.save();
    g.globalCompositeOperation = "source-atop";
    for (const [x, y, s] of L.holes) {
      const sg = g.createRadialGradient(x, y, 0, x, y, s * 2.8);
      sg.addColorStop(0, "rgba(20, 12, 10, 0.75)"); sg.addColorStop(0.5, "rgba(36, 22, 18, 0.3)"); sg.addColorStop(1, "rgba(36, 22, 18, 0)");
      g.fillStyle = sg; g.fillRect(x - s * 3, y - s * 3, s * 6, s * 6);
      const st = g.createLinearGradient(x, 0, x - s * 6, 0);
      st.addColorStop(0, "rgba(18, 12, 12, 0.32)"); st.addColorStop(1, "rgba(18, 12, 12, 0)");
      g.fillStyle = st; g.fillRect(x - s * 6, y - s * 0.4, s * 6, s * 0.8);
    }
    g.restore();
    for (const [x, y, s, seed] of L.holes) {
      const hr = rng(seed), n = 9, pts = [];
      for (let i = 0; i < n; i++) { const a = i / n * TAU, rr = s * (0.45 + hr() * 0.6); pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7); }
      g.save();
      g.globalCompositeOperation = "source-atop";
      trace(g, pts); g.fillStyle = "rgba(10, 9, 18, 0.9)"; g.fill();
      g.clip();
      // ribs showing through the tear
      g.strokeStyle = c3(tone(base, -0.3), 0.6); g.lineWidth = Math.max(1.2 * px, s * 0.07);
      g.beginPath();
      for (let k = -1; k <= 1; k++) { const o = k * s * 0.45 + (rng(seed + k)() - 0.5) * s * 0.2; g.moveTo(x + o, y - s); g.lineTo(x + o - s * 0.1, y + s); }
      g.stroke();
      g.restore();
      g.save(); g.globalCompositeOperation = "source-atop";
      trace(g, pts); g.strokeStyle = "rgba(40, 24, 18, 0.9)"; g.lineWidth = 1.6 * px; g.stroke();
      g.restore();
    }
  }

  windows(g, L, px, r, aftT) {
    // rows of tiny windows along each plate's long edges: mostly dark, warm where a cluster survives
    const ws = Math.max(1.2 * px, 0.0035);
    const paint = list => {
      for (const q of list) {
        if (!q.win) continue;
        const [x0, y0, x1, y1] = bbox(q.p);
        for (const yy of [y0 + 0.008, y1 - 0.012, (y0 + y1) / 2 - 0.004]) {
          if (y1 - y0 < 0.05 && yy === (y0 + y1) / 2 - 0.004) continue;
          for (let x = x0 + 0.012; x < x1 - 0.01; x += 0.0085) {
            // only where the row is inside the plate
            if (!inside(q.p, x, yy)) continue;
            let lit = 0.015;
            for (const [cx, cy, cr] of L.lit) { const d = Math.hypot(x - cx, (yy - cy) * 1.6); if (d < cr) lit = Math.max(lit, 0.85 * (1 - d / cr)); }
            const on = r() < lit;
            g.fillStyle = on ? (r() < 0.88 ? "rgba(255, 206, 140, 0.95)" : "rgba(196, 224, 255, 0.85)") : "rgba(14, 14, 24, 0.3)";
            g.fillRect(x, yy, ws * 1.5, ws);
          }
        }
      }
    };
    aftT(() => paint(L.P.filter(q => q.aft)));
    paint(L.P.filter(q => !q.aft));
  }

  *finish(g, L, bounce, px, r) {
    // aerial haze: the far (stern) end and the edges lean toward the galaxy's colour
    g.save();
    g.globalCompositeOperation = "source-atop";
    const hz = g.createLinearGradient(X0, 0, X1, 0);
    hz.addColorStop(0, c3(bounce, 0.1)); hz.addColorStop(0.5, c3(bounce, 0)); hz.addColorStop(1, c3(bounce, 0.04));
    g.fillStyle = hz; g.fillRect(X0, -YH, X1 - X0, YH * 2);
    // one big light for the whole ship: key from above, the underside falls into shadow
    const kl = g.createLinearGradient(0, -0.3, 0, 0.3);
    kl.addColorStop(0, "rgba(255, 236, 206, 0.08)"); kl.addColorStop(0.5, "rgba(0, 0, 0, 0)"); kl.addColorStop(1, "rgba(4, 2, 12, 0.3)");
    g.fillStyle = kl; g.fillRect(X0, -YH, X1 - X0, YH * 2);
    yield;
    // fine grain so big plates don't read as flat fills
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = r() < 0.5 ? "rgba(255, 250, 240, 0.05)" : "rgba(0, 0, 10, 0.08)";
      g.fillRect(X0 + r() * (X1 - X0), (r() - 0.5) * YH * 2, px * 1.6, px * 1.6);
    }
    g.restore();
    yield;
    // painterly softening: a down-sampled copy laid back over itself (a cheap blur)
    const sc = document.createElement("canvas"); sc.width = Math.ceil(g.canvas.width / 3); sc.height = Math.ceil(g.canvas.height / 3);
    const sg = sc.getContext("2d"); sg.imageSmoothingQuality = "high"; sg.drawImage(g.canvas, 0, 0, sc.width, sc.height);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-atop"; g.globalAlpha = 0.28; g.imageSmoothingQuality = "high";
    g.drawImage(sc, 0, 0, g.canvas.width, g.canvas.height);
    g.restore();
    // steady marker lights (painted core; their halo lives in the ember layer)
    for (const [x, y, col] of L.marks) {
      g.fillStyle = c3(col, 0.95); g.beginPath(); g.arc(x, y, 0.0045, 0, TAU); g.fill();
    }
  }

  embers(L, bounce, W, H, ppu) {
    // a quarter-resolution glow layer: soft, so it can be small and cheap
    const q = 4, c = document.createElement("canvas");
    c.width = Math.ceil(W / q); c.height = Math.ceil(H / q);
    const g = c.getContext("2d");
    g.translate(c.width / 2, c.height / 2); g.scale(ppu / q, ppu / q);
    const blob = (x, y, rr, col, a) => {
      const gg = g.createRadialGradient(x, y, 0, x, y, rr);
      gg.addColorStop(0, c3(col, a)); gg.addColorStop(0.4, c3(col, a * 0.35)); gg.addColorStop(1, c3(col, 0));
      g.fillStyle = gg; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    };
    const aftT = fn => { g.save(); g.translate(L.brkX + L.brk.dx, L.brk.dy); g.rotate(L.brk.rot); g.translate(-L.brkX, 0); fn(); g.restore(); };
    for (const [x, y, cr] of L.lit) blob(x, y, cr * 1.1, [255, 190, 120], 0.16);
    blob(L.brkX, 0, 0.09, [255, 140, 80], 0.32);                      // the torn spine still smoulders
    blob(L.brkX + 0.02, 0.02, 0.04, [255, 180, 110], 0.4);
    aftT(() => { for (const i of L.warm) { const [x, y, s] = L.drives[i]; blob(x - 0.01, y, s * 2.4, [255, 168, 128], 0.26); } });
    for (const [x, y, col] of L.marks) blob(x, y, 0.025, col, 0.55);
    for (const [x, y, s] of L.holes) if (s > 0.035) blob(x, y, s * 1.2, [255, 130, 80], 0.12);
    return c;
  }
}
