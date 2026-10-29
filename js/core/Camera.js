// ─── Camera ───
// Zoom, anchor (tier framing) and on-screen speed scale. Stable surface so the
// framing system can be swapped or tuned without touching the main loop.
// Fields live on the shared game state; this class owns the behaviour.

const HOLE_PX = 13;
export const REVEAL_FRAMES = 160;   // ~2.7s camera pull-back on tier-up

export class Camera {
  constructor(state) { this.state = state; }

  /** Target world→screen zoom so the hole reads at HOLE_PX on screen. */
  zoomTarget(screenW, screenH) {
    const s = this.state;
    const k = Math.min(1.5, Math.max(0.85, Math.min(screenW, screenH) / 420));
    return HOLE_PX * k / s.anchorSmooth;
  }

  /** Ease the camera pull-back during a tier reveal. */
  updateAnchor(dt) {
    const s = this.state, rv = s.reveal;
    if (rv) {
      rv.p = Math.min(1, rv.p + dt / rv.dur);
      const e = 0.5 - 0.5 * Math.cos(Math.PI * rv.p);
      s.anchorSmooth = rv.from * Math.pow(rv.to / rv.from, e);
      if (rv.p >= 1) s.reveal = null;
    } else {
      s.anchorSmooth = s.anchorR;
    }
  }

  /** Sync zoom, view size and speedScale. Call with snap=true after a hard cut. */
  updateScale(screenW, screenH, snap = false) {
    const s = this.state;
    const zt = this.zoomTarget(screenW, screenH) * s.camMul;
    s.zoom = snap ? zt : s.zoom + (zt - s.zoom) * 0.04;
    s.viewW = screenW / s.zoom;
    s.viewH = screenH / s.zoom;
    const A = s.anchorSmooth;
    s.speedScale = (A / HOLE_PX) * Math.pow(Math.max(1, s.radius / A), 0.45);
  }

  /** Begin a tier reveal: pull the camera back so the hole is small again. */
  beginReveal(reduceMotion) {
    const s = this.state;
    const dur = reduceMotion ? REVEAL_FRAMES * 0.6 : REVEAL_FRAMES;
    s.reveal = { from: s.anchorSmooth, to: s.radius, p: 0, dur };
    s.anchorR = s.radius;
  }

  holePx() { return HOLE_PX; }
}
