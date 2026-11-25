// ─── Camera ───
// Zoom, anchor (tier framing) and on-screen speed scale. Stable surface so the
// framing system can be swapped or tuned without touching the main loop.
// Fields live on the shared game state; this class owns the behaviour.

export class Camera {
  static HOLE_PX = 13;
  static REVEAL_FRAMES = 160;   // ~2.7s camera pull-back on tier-up

  constructor(state) { this.state = state; }

  /** Target world→screen zoom so the hole reads at HOLE_PX on screen. */
  zoomTarget(screenW, screenH) {
    const s = this.state;
    const k = Math.min(1.5, Math.max(0.85, Math.min(screenW, screenH) / 420));
    return Camera.HOLE_PX * k / s.anchorSmooth;
  }

  /** Ease the camera pull-back during a tier reveal, and advance a growth-step ease. */
  updateAnchor(dt) {
    const s = this.state, rv = s.reveal;
    if (rv) {
      rv.p = Math.min(1, rv.p + dt / rv.dur);
      const e = 0.5 - 0.5 * Math.cos(Math.PI * rv.p);
      s.anchorSmooth = rv.from * Math.pow(rv.to / rv.from, e);
      if (rv.p >= 1) s.reveal = null;
      if (s.easeBack) s.easeBack = null;
    } else {
      s.anchorSmooth = s.anchorR;
      const eb = s.easeBack;
      if (eb) eb.p = Math.min(1, eb.p + dt / eb.dur);
    }
  }

  /** Sync zoom, view size and speedScale. Call with snap=true after a hard cut. */
  updateScale(screenW, screenH, snap = false) {
    const s = this.state;
    const base = this.zoomTarget(screenW, screenH) * s.camMul;
    const eb = s.easeBack;
    if (snap || s.reveal) {
      s.easeBack = null;
      s.zoom = snap ? base : s.zoom + (base - s.zoom) * 0.04;
    } else if (eb) {
      const u = Math.min(1, eb.p);
      const bell = 0.5 - 0.5 * Math.cos(Math.PI * 2 * u);
      s.zoom = eb.rest * (1 - eb.pull * bell);
      if (eb.p >= 1) {
        s.zoom = eb.rest;
        s.easeBack = null;
      }
    } else {
      s.zoom = s.zoom + (base - s.zoom) * 0.04;
    }
    s.viewW = screenW / s.zoom;
    s.viewH = screenH / s.zoom;
    const A = s.anchorSmooth;
    s.speedScale = (A / Camera.HOLE_PX) * Math.pow(Math.max(1, s.radius / A), 0.45);
  }

  /** Begin a tier reveal: pull the camera back so the hole is small again. */
  beginReveal(reduceMotion) {
    const s = this.state;
    const dur = reduceMotion ? Camera.REVEAL_FRAMES * 0.6 : Camera.REVEAL_FRAMES;
    s.reveal = { from: s.anchorSmooth, to: s.radius, p: 0, dur };
    s.anchorR = s.radius;
    s.easeBack = null;
  }

  /**
   * A short pull-back that returns. `seconds` is real time (dt is in 60Hz frames).
   * `pull` is how far the zoom dips at mid-ease (0.15 = fifteen percent wider).
   * The curve is a raised cosine: flat at both ends and at the turn, no snap.
   * Returns false when a tier reveal already owns the camera.
   */
  beginEaseBack(seconds, pull) {
    const s = this.state;
    if (s.reveal || s.easeBack) return false;
    const dur = Math.max(1, Number(seconds) * 60);
    const dip = Math.max(0, Number(pull) || 0);
    s.easeBack = { p: 0, dur, pull: dip, rest: s.zoom };
    return true;
  }

  /** Stop a growth-step ease where it is. The next scale update eases toward the frame. */
  cancelEaseBack() {
    this.state.easeBack = null;
  }

  holePx() { return Camera.HOLE_PX; }
}
