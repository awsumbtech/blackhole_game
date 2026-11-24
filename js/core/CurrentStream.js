// The comet-current ribbon. Soft overlapping wisps along each river, and a
// small pool of motes that drift with the river's flow. Hushed: about a
// fifth of full opacity, so the black hole stays the bright thing.
// Reduce-motion freezes the motes. Wisps are paintings, so they do not move.

import { Theme } from "./Theme.js";

export class CurrentStream {
  static MOTE_N = 18;
  static motes = Array.from({ length: 18 }, () => (
    { on: false, river: 0, t: 0, side: 0, which: 0, ang: 0 }
  ));
  static atp = { x: 0, y: 0, tx: 1, ty: 0 };
  static flow = { x: 0, y: 0 };
  static _rivers = null;

  static at(pts, t) {
    const spot = this.atp;
    const n = pts.length;
    if (n < 2) { spot.x = 0; spot.y = 0; spot.tx = 1; spot.ty = 0; return spot; }
    const f = Math.max(0, Math.min(n - 1.001, t * (n - 1)));
    const i = f | 0;
    const k = f - i;
    const a = pts[i], b = pts[i + 1] || a;
    const tx = b[0] - a[0], ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1;
    spot.x = a[0] + tx * k;
    spot.y = a[1] + ty * k;
    spot.tx = tx / tl;
    spot.ty = ty / tl;
    return spot;
  }

  static _seed(rivers) {
    this._rivers = rivers;
    for (let i = 0; i < this.MOTE_N; i++) {
      const m = this.motes[i];
      const ri = i % rivers.length;
      const rv = rivers[ri];
      m.on = !!(rv && rv.pts && rv.pts.length > 1);
      m.river = ri;
      m.t = (i + 0.37) / this.MOTE_N;
      m.side = ((i & 1) ? 1 : -1) * (0.12 + (i % 5) * 0.035);
      m.which = i & 1;
      if (m.on) {
        const p = this.at(rv.pts, m.t);
        m.ang = Math.atan2(p.ty, p.tx);
      }
    }
  }

  /**
   * Advance motes. `flowAt(x, y, out)` is the world's river sample, in world
   * units. `worldDt` is frame-time. Reduce-motion leaves every mote where it is.
   */
  static update(W, worldDt, reduceMotion, flowAt) {
    if (!W || !W.rivers || !W.rivers.length) return;
    if (this._rivers !== W.rivers) this._seed(W.rivers);
    if (reduceMotion || !(worldDt > 0) || !W.grid) return;
    const f = W.f || 1;
    const span = (W.b0 || 1) * 2.4;
    for (let i = 0; i < this.MOTE_N; i++) {
      const m = this.motes[i];
      if (!m.on) continue;
      const rv = W.rivers[m.river];
      if (!rv || !rv.pts) continue;
      const p = this.at(rv.pts, m.t);
      const wx = W.ox + p.x * f, wy = W.oy + p.y * f;
      flowAt(wx, wy, this.flow);
      const along = this.flow.x * p.tx + this.flow.y * p.ty;
      const speed = along > 0.2 ? along : 0.35;
      m.t += (speed * worldDt) / (span * f);
      if (m.t > 1) m.t -= 1;
      else if (m.t < 0) m.t += 1;
      const mag = Math.hypot(this.flow.x, this.flow.y);
      m.ang = mag > 0.05 ? Math.atan2(this.flow.y, this.flow.x) : Math.atan2(p.ty, p.tx);
    }
  }

  /**
   * Local river coordinates (the caller has already translated and scaled).
   * `cover` is the set's fade, 1 for the live rivers.
   */
  static draw(ctx, rivers, cover) {
    if (!rivers || !rivers.length || !(cover > 0.02)) return;
    this._wisps(ctx, rivers, cover);
    if (rivers === this._rivers) this._motes(ctx, rivers, cover);
  }

  static _wisps(ctx, rivers, cover) {
    const cat = Theme.current;
    const ids = cat.idsByRole("wisp");
    let sample = null;
    for (let i = 0; i < ids.length; i++) {
      sample = cat.sprite(ids[i]);
      if (sample) break;
    }
    if (!sample) return;
    for (let r = 0; r < rivers.length; r++) {
      const rv = rivers[r];
      const pts = rv.pts;
      if (!pts || pts.length < 2) continue;
      const drawH = rv.w * 1.15;
      const drawW = drawH * (sample.w / sample.h);
      const step = drawW * 0.42;
      if (!(step > 1)) continue;
      let acc = 0;
      let next = step * 0.35;
      let n = 0;
      for (let s = 0; s < pts.length - 1 && n < 48; s++) {
        const ax = pts[s][0], ay = pts[s][1];
        const bx = pts[s + 1][0], by = pts[s + 1][1];
        const dx = bx - ax, dy = by - ay;
        const len = Math.hypot(dx, dy);
        if (!(len > 0)) continue;
        while (acc + len >= next && n < 48) {
          const k = (next - acc) / len;
          const x = ax + dx * k, y = ay + dy * k;
          const ang = Math.atan2(dy, dx);
          const spr = cat.sprite(ids[(n + r) % ids.length]);
          const op = (n % 3 === 0 ? 0.14 : n % 3 === 1 ? 0.17 : 0.2) * cover;
          next += step;
          n++;
          if (!spr) continue;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(ang);
          ctx.globalCompositeOperation = "screen";
          ctx.globalAlpha = op;
          cat.blit(ctx, spr, 0, 0, drawW, drawH);
          ctx.restore();
        }
        acc += len;
      }
    }
  }

  static _motes(ctx, rivers, cover) {
    const cat = Theme.current;
    const ids = cat.idsByRole("mote");
    if (!ids.length) return;
    for (let i = 0; i < this.MOTE_N; i++) {
      const m = this.motes[i];
      if (!m.on) continue;
      const rv = rivers[m.river];
      if (!rv || !rv.pts) continue;
      const spr = cat.sprite(ids[m.which % ids.length]);
      if (!spr) continue;
      const p = this.at(rv.pts, m.t);
      const nx = -p.ty, ny = p.tx;
      const x = p.x + nx * m.side * rv.w;
      const y = p.y + ny * m.side * rv.w;
      const len = rv.w * 0.14;
      const h = len * (spr.h / spr.w);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(m.ang);
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.28 * cover;
      cat.blit(ctx, spr, 0, 0, len, h);
      ctx.restore();
    }
  }
}
