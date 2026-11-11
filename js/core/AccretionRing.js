// ─── AccretionRing (v9.7) ───
// One job: the constant ring around the hole, in every mode including Zen.
// Two supplied halves (far, then the hole, then near) so the shadow sits in
// the opening. Scaled with the hole. Motion is a slow turn plus the galaxy
// breath as a tiny scale change — transform only, no flicker.
// Alpha paintings, drawn source-over at a fixed 0.72. Additive blew toward
// white on the warmer lanes (meadow, nursery); the alpha pair keeps the cream.

const OPACITY = 0.72;
// The painting's empty centre is 0.397 of its width. The hole's dark core is
// about 2 radii across, so the ring frames that core.
const WIDTH_PER_R = 2 / 0.397;
const SPIN = 0.00045;

function load(src) {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  return img;
}

export class AccretionRing {
  constructor() {
    this.back = load("assets/hole_ring_back.png");
    this.front = load("assets/hole_ring_front.png");
    this.ang = 0;
    this.draws = 0;
  }

  /** Both halves decoded. Tests use this for "present in every mode". */
  get present() {
    return this.back.complete && this.back.naturalWidth > 0
      && this.front.complete && this.front.naturalWidth > 0;
  }

  update(dt, still) {
    if (still || dt <= 0) return;
    this.ang += SPIN * dt;
    if (this.ang > 6.283185307) this.ang -= 6.283185307;
  }

  drawBack(ctx, x, y, radius, breath, still, filter) {
    this._half(this.back, ctx, x, y, radius, breath, still, filter);
  }

  drawFront(ctx, x, y, radius, breath, still, filter) {
    this._half(this.front, ctx, x, y, radius, breath, still, filter);
  }

  _half(img, ctx, x, y, radius, breath, still, filter) {
    if (!img.complete || !img.naturalWidth || radius <= 0) return;
    const sc = still ? 1 : 1 + ((breath || 0.5) - 0.5) * 0.03;
    const s = radius * WIDTH_PER_R * sc;
    ctx.save();
    if (filter) ctx.filter = filter;
    ctx.globalAlpha = OPACITY;
    ctx.translate(x, y);
    ctx.rotate(this.ang);
    ctx.drawImage(img, -s / 2, -s / 2, s, s);
    this.draws++;
    ctx.restore();
  }
}
