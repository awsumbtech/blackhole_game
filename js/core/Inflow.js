// ─── Inflow (v9.5) ───
// Event-driven light around the hole, in three pooled layers:
//   1. Accretion inflow: glowing matter spiralling in on the disk plane. Each grain
//      speeds up as it falls (Kepler-ish) and its streak stretches along its motion.
//   2. Motes: soft glowing specks drifting up off the disk.
//   3. Impact: on a tier-up or a big swallow, a radial bloom of streaked particles,
//      fired on the same frame as the soft low swell (audio.playSwell).
// Calm rules (DESIGN §0/§2): no white, no flash, no shake. The bloom eases in over
// ~4 frames (matching the swell's ~60 ms attack) and fades over ~1.2 s.
// All positions are in hole radii, relative to the hole, so the field follows the
// hole and scales with it. Typed-array pools, fixed caps, no per-frame allocation.
// Reduce Motion: a few still embers, no motes, and the impact is a still glow only.

const TAU = Math.PI * 2;
const DISK_TILT = 0.17;                  // art.js TILT: the inflow flattens into the disk plane
const IN_MAX = 112, MOTE_MAX = 20, BURST_MAX = 96;
const R_SPAWN0 = 5.2, R_SPAWN1 = 9.5, R_END = 1.32;
const W0 = 0.24;                          // angular speed at r = 1 (rad/frame), ~ r^-1.5
const V0 = 0.036;                         // infall speed at r = 1 (radii/frame), ~ r^-0.5

// Temperature ramp: ember (outer) -> gold -> hot cream (inner). Never pure white.
const RAMP = ["rgb(214,112,92)", "rgb(240,146,96)", "rgb(255,182,120)", "rgb(255,210,150)", "rgb(255,228,186)", "rgb(255,240,214)"];
const rampIdx = r => { const i = Math.floor((R_SPAWN0 + 1.2 - r) / (R_SPAWN0 + 1.2 - R_END) * RAMP.length); return i < 0 ? 0 : i >= RAMP.length ? RAMP.length - 1 : i; };

/**
 * Stamp a streak sprite from tail (tx,ty) to head (hx,hy), `wd` thick. k is the canvas
 * scale (dpr * zoom; the world ctx has no translation), so one setTransform replaces
 * translate + atan2 + rotate. Callers wrap the batch in save/restore.
 */
function stamp(ctx, k, spr, hx, hy, tx, ty, wd) {
  const dx = hx - tx, dy = hy - ty, d = Math.sqrt(dx * dx + dy * dy);
  const c = d > 1e-6 ? dx / d : 1, s = d > 1e-6 ? dy / d : 0;
  const L = (d < wd * 0.6 ? wd * 0.6 : d) * 1.15;   // the sprite's head sits at 90% of its length
  ctx.setTransform(k * c, k * s, -k * s, k * c, k * hx, k * hy);
  ctx.drawImage(spr, -L * 0.9, -wd / 2, L, wd);
}
const ysAt = r => { const q = (r - 3.6) / 4.5; return DISK_TILT + 0.26 * (q < 0 ? 0 : q > 1 ? 1 : q); };

let rs = 0x2f6b1;                         // tiny LCG: no Math.random churn in hot paths
const rnd = () => ((rs = (rs * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

let dotSprite = null, bloomSprite = null;
const streaks = [];                       // one soft streak sprite per RAMP colour
// A soft comet-shaped streak, head on the right: a glowing halo with a brighter core,
// both feathered on every edge (no hard pill ends). Stamped stretched along the motion.
function streakSprite(rgb) {
  const W = 128, H = 32, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  const along = g.createLinearGradient(0, 0, W, 0);
  along.addColorStop(0, "rgba(" + rgb + ",0)"); along.addColorStop(0.7, "rgba(" + rgb + ",0.75)");
  along.addColorStop(0.9, "rgba(" + rgb + ",1)"); along.addColorStop(1, "rgba(" + rgb + ",0)");
  g.fillStyle = along; g.fillRect(0, 0, W, H);
  const across = g.createLinearGradient(0, 0, 0, H);
  across.addColorStop(0, "rgba(0,0,0,0)"); across.addColorStop(0.3, "rgba(0,0,0,0.22)"); across.addColorStop(0.44, "rgba(0,0,0,0.8)");
  across.addColorStop(0.5, "rgba(0,0,0,1)"); across.addColorStop(0.56, "rgba(0,0,0,0.8)"); across.addColorStop(0.7, "rgba(0,0,0,0.22)"); across.addColorStop(1, "rgba(0,0,0,0)");
  g.globalCompositeOperation = "destination-in"; g.fillStyle = across; g.fillRect(0, 0, W, H);
  return c;
}
function sprites() {
  if (dotSprite) return;
  for (let i = 0; i < RAMP.length; i++) streaks.push(streakSprite(RAMP[i].slice(4, -1)));
  const mk = (n, stops) => {
    const c = document.createElement("canvas"); c.width = c.height = n;
    const g = c.getContext("2d"), gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    for (const [o, col] of stops) gr.addColorStop(o, col);
    g.fillStyle = gr; g.fillRect(0, 0, n, n); return c;
  };
  dotSprite = mk(32, [[0, "rgba(255,236,206,1)"], [0.25, "rgba(255,206,150,0.55)"], [1, "rgba(255,170,110,0)"]]);
  bloomSprite = mk(128, [[0, "rgba(255,214,160,0.55)"], [0.35, "rgba(255,180,120,0.28)"], [0.7, "rgba(240,140,110,0.08)"], [1, "rgba(220,120,110,0)"]]);
}

export class Inflow {
  constructor() {
    // inflow grains
    this.ir = new Float32Array(IN_MAX); this.ia = new Float32Array(IN_MAX);
    this.iage = new Float32Array(IN_MAX); this.isz = new Float32Array(IN_MAX); this.ia0 = new Float32Array(IN_MAX);
    // motes
    this.mx = new Float32Array(MOTE_MAX); this.my = new Float32Array(MOTE_MAX); this.mvy = new Float32Array(MOTE_MAX);
    this.mage = new Float32Array(MOTE_MAX); this.mlife = new Float32Array(MOTE_MAX); this.mph = new Float32Array(MOTE_MAX); this.msz = new Float32Array(MOTE_MAX);
    // burst ring buffer
    this.bx = new Float32Array(BURST_MAX); this.by = new Float32Array(BURST_MAX); this.bvx = new Float32Array(BURST_MAX); this.bvy = new Float32Array(BURST_MAX);
    this.bage = new Float32Array(BURST_MAX); this.blife = new Float32Array(BURST_MAX); this.bsz = new Float32Array(BURST_MAX);
    this.bHead = 0; this.bLive = 0;
    this.bloomAge = 1e9; this.bloomLife = 72; this.bloomK = 0;
    this.nIn = 0; this.nMote = 0; this.high = true; this.still = false;
    this.feedGlow = 0;
    this.armA = 0;
    this.burstCount = 0;               // for tests
    for (let i = 0; i < IN_MAX; i++) this._seed(i, true);
    for (let i = 0; i < MOTE_MAX; i++) this._mote(i, true);
  }

  _seed(i, scatter) {
    const r = scatter ? R_END + 0.4 + rnd() * (R_SPAWN1 - R_END) : R_SPAWN0 + rnd() * (R_SPAWN1 - R_SPAWN0);
    // New grains feed in along two slowly turning arms; Kepler shear winds them into
    // trailing spiral streams (scattered start: anywhere, so frame one isn't empty).
    const arm = scatter ? rnd() * TAU : this.armA + (rnd() < 0.5 ? 0 : Math.PI) + (rnd() - 0.5) * 0.32;
    this.ir[i] = r; this.ia[i] = arm; this.ia0[i] = arm;
    this.iage[i] = scatter ? 40 + rnd() * 200 : 0; this.isz[i] = 0.7 + rnd() * 0.9;
  }
  _mote(i, scatter) {
    const a = rnd() * TAU, r = 1.5 + rnd() * 2.1;
    this.mx[i] = Math.cos(a) * r; this.my[i] = Math.sin(a) * r * DISK_TILT;
    this.mvy[i] = -(0.0035 + rnd() * 0.005); this.mph[i] = rnd() * TAU;
    this.mlife[i] = 220 + rnd() * 160; this.mage[i] = scatter ? rnd() * this.mlife[i] : 0;
    this.msz[i] = 0.8 + rnd() * 0.9;
  }

  /** Quality and Reduce Motion. v9.7: the permanent grain cloud and the rising motes are gone (the ring and Absorption own the hole). Impact bursts stay. */
  configure(high, reduceMotion) {
    this.high = high; this.still = reduceMotion;
    this.nIn = 0;
    this.nMote = 0;
  }

  /** A bite: nudge a couple of grains to start where the food was, and warm the stream. */
  feed(ang, distR) {
    if (this.still) return;
    this.feedGlow = Math.min(1, this.feedGlow + 0.12);
    const r = distR < R_SPAWN0 ? R_SPAWN0 : distR > R_SPAWN1 ? R_SPAWN1 : distR;
    for (let k = 0; k < 1; k++) {
      let j = 0, best = -1;           // recycle the outermost grain
      for (let i = 0; i < this.nIn; i++) if (this.ir[i] > best) { best = this.ir[i]; j = i; }
      this.ir[j] = r * (0.92 + 0.16 * rnd()); this.ia[j] = ang + (rnd() - 0.5) * 0.5; this.ia0[j] = this.ia[j]; this.iage[j] = 0;
    }
  }

  /**
   * Impact: radial bloom of streaked particles. strength 1 = tier-up, ~0.6 = big swallow.
   * The caller fires audio.playSwell on the same frame.
   */
  burst(strength = 1) {
    this.burstCount++;
    // a tier-up and a merge can land within a second: never stack bursts, just keep the glow
    if (this.bloomAge < 50) { this.bloomK = Math.max(this.bloomK, strength); return; }
    this.bloomAge = 0; this.bloomK = strength; this.bloomLife = this.still ? 110 : 72;
    if (this.still) return;
    const n = Math.round((this.high ? 40 : 22) * strength);
    for (let k = 0; k < n; k++) {
      const i = this.bHead; this.bHead = (this.bHead + 1) % BURST_MAX;
      const a = (k / n) * TAU + (rnd() - 0.5) * (TAU / n) * 1.6, sp = (0.16 + rnd() * 0.3) * (0.75 + 0.25 * strength);
      const c = Math.cos(a), s = Math.sin(a);
      this.bx[i] = c * 1.55; this.by[i] = s * 1.55 * 0.72;
      this.bvx[i] = c * sp; this.bvy[i] = s * sp * 0.72;
      this.bage[i] = 0; this.blife[i] = 62 + rnd() * 40; this.bsz[i] = 0.8 + rnd() * 0.9;
    }
    this.bLive = Math.min(BURST_MAX, this.bLive + n);
  }

  update(dt) {
    if (this.bloomAge < 1e8) this.bloomAge += dt;
    this.feedGlow *= Math.pow(0.985, dt);
    if (this.still || dt <= 0) return;
    this.armA += 0.0035 * dt;
    for (let i = 0; i < this.nIn; i++) {
      const r = this.ir[i];
      this.ia[i] += W0 / (r * Math.sqrt(r)) * dt;
      this.ir[i] = r - V0 / Math.sqrt(r) * dt;
      this.iage[i] += dt;
      if (this.ir[i] < R_END) this._seed(i, false);
    }
    for (let i = 0; i < this.nMote; i++) {
      this.mage[i] += dt;
      this.my[i] += this.mvy[i] * dt;
      this.mx[i] += Math.sin(this.mage[i] * 0.018 + this.mph[i]) * 0.0018 * dt;
      if (this.mage[i] > this.mlife[i]) this._mote(i, false);
    }
    if (this.bLive) {
      const drag = Math.pow(0.935, dt);
      let alive = 0;
      for (let i = 0; i < BURST_MAX; i++) {
        if (this.bage[i] >= this.blife[i]) continue;
        this.bx[i] += this.bvx[i] * dt; this.by[i] += this.bvy[i] * dt;
        this.bvx[i] *= drag; this.bvy[i] *= drag;
        this.bage[i] += dt; alive++;
      }
      this.bLive = alive;
    }
  }

  /** Near-side grains, motes and the impact: draw after the hole. The far half is unused (nIn is 0). */
  drawFront(ctx, x, y, R, zoom, dpr = 1) {
    this._grains(ctx, x, y, R, zoom, dpr, 1);
    const k = zoom * dpr;
    sprites();
    const px = 1 / zoom;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // Impact bloom: eases in (~4 frames), then a long soft fade. Warm, never white.
    if (this.bloomAge < this.bloomLife) {
      const t = this.bloomAge, L = this.bloomLife;
      const rise = t < 4 ? t / 4 : 1, fall = 1 - (t / L);
      const a = rise * fall * fall * (this.still ? 0.22 : 0.34) * this.bloomK;
      const s = R * (this.still ? 3.2 : 2.4 + 2.6 * Math.sqrt(t / L));
      ctx.globalAlpha = a;
      ctx.drawImage(bloomSprite, x - s, y - s * 0.8, s * 2, s * 1.6);
    }
    // Motes
    for (let i = 0; i < this.nMote; i++) {
      const q = this.mage[i] / this.mlife[i];
      const a = (q < 0.2 ? q / 0.2 : 1) * (1 - q) * 0.7;
      if (a <= 0.01) continue;
      const s = Math.max(2.2 * px, R * 0.07) * this.msz[i] * (1 + q * 0.6);
      ctx.globalAlpha = a;
      ctx.drawImage(dotSprite, x + this.mx[i] * R - s, y + this.my[i] * R - s, s * 2, s * 2);
    }
    // Burst streaks: length follows speed, so fast sparks are streaks and slow ones dots
    if (this.bLive) {
      const trail = this.high ? 7 : 4;
      const lw = Math.max(1.1 * px, R * 0.05);
      for (let i = 0; i < BURST_MAX; i++) {
        const age = this.bage[i], life = this.blife[i];
        if (age >= life) continue;
        const q = age / life, a = (age < 6 ? age / 6 : 1) * (1 - q) * (1 - q);
        const hx = x + this.bx[i] * R, hy = y + this.by[i] * R;
        const tx = hx - this.bvx[i] * R * trail, ty = hy - this.bvy[i] * R * trail;
        ctx.globalAlpha = a * 0.78;
        stamp(ctx, k, streaks[q < 0.25 ? 3 : q < 0.55 ? 2 : 1], hx, hy, tx, ty, lw * this.bsz[i] * (this.high ? 3.4 : 2.4));
      }
    }
    ctx.restore();
  }

  _grains(ctx, x, y, R, zoom, dpr, side) {
    const k = zoom * dpr;
    if (!this.nIn) return;
    sprites();
    const px = 1 / zoom, trail = this.high ? 6 : 4;
    const lw0 = Math.max(1.2 * px, R * 0.05);
    const warm = 1 + this.feedGlow * 0.35;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < this.nIn; i++) {
      const r = this.ir[i], a = this.ia[i], sa = Math.sin(a);
      if ((sa < 0 ? -1 : 1) !== side) continue;
      const ys = ysAt(r);
      const hx = x + Math.cos(a) * r * R, hy = y + sa * r * ys * R;
      // fade in at spawn, out near the inner edge (it slips under the disk glow)
      const fin = this.iage[i] < 40 ? this.iage[i] / 40 : 1;
      const qe = (r - R_END) / 0.9, fout = qe < 1 ? (qe < 0 ? 0 : qe) : 1;
      const near = 1 - (r - R_END) / (R_SPAWN1 - R_END);
      const alpha = fin * fout * (0.26 + 0.8 * near * near) * warm;
      if (alpha < 0.02) continue;
      const spr = streaks[rampIdx(r)];
      const lw = lw0 * this.isz[i] * (0.7 + 0.6 / r);
      if (this.still) {
        ctx.globalAlpha = alpha * 0.8;
        stamp(ctx, k, spr, hx, hy, hx - 0.01, hy, lw * 3);
        continue;
      }
      // tail: where the grain was `trail` frames ago (analytic, so no history buffer)
      // stretch grows faster than speed, so far grains read as dots and near ones as streaks
      const st = 3.4 / r, tr = trail * (st < 0.55 ? 0.55 : st > 2.4 ? 2.4 : st * Math.sqrt(st));
      const w = W0 / (r * Math.sqrt(r)), rt = r + V0 / Math.sqrt(r) * tr, at = a - w * tr;
      const tx = x + Math.cos(at) * rt * R, ty = y + Math.sin(at) * rt * ysAt(rt) * R;
      ctx.globalAlpha = alpha;
      stamp(ctx, k, spr, hx, hy, tx, ty, lw * (this.high ? 3.8 : 2.8));
    }
    ctx.restore();
  }

  info() { return { inflow: this.nIn, motes: this.nMote, burstLive: this.bLive, bursts: this.burstCount, still: this.still, high: this.high, bloom: this.bloomAge < this.bloomLife }; }
}
