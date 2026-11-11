// ─── AccretionRing (v9.7) ───
// One job: the constant ring around the hole, in every mode including Zen.
// Two supplied halves (far, then the hole, then near). The split is horizontal
// in the paintings, so the halves are never rotated: a turn would put the near
// half above the hole. Motion is a uniform scale (the galaxy breath, plus a
// slower shimmer). Both are the same on both halves, so the seam stays level.
// Alpha paintings, source-over at 0.9. Additive washed out on the warm lanes.

const OPACITY = 0.9;
// Visible cream runs from ~0.17 to ~0.37 of the image width. At this scale
// the inner edge hugs the shadow and the outer edge is about 2.45x the dark core.
const WIDTH_PER_R = 5.96;
const SHIMMER = 0.012;

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
    this.phase = 0;
    this.draws = 0;
  }

  get present() {
    return this.back.complete && this.back.naturalWidth > 0
      && this.front.complete && this.front.naturalWidth > 0;
  }

  update(dt, still) {
    if (still || dt <= 0) return;
    this.phase += 0.004 * dt;
    if (this.phase > 6.283185307) this.phase -= 6.283185307;
  }

  drawBack(ctx, x, y, radius, breath, still, filter) {
    this._half(this.back, ctx, x, y, radius, breath, still, filter);
  }

  drawFront(ctx, x, y, radius, breath, still, filter) {
    this._half(this.front, ctx, x, y, radius, breath, still, filter);
  }

  _half(img, ctx, x, y, radius, breath, still, filter) {
    if (!img.complete || !img.naturalWidth || radius <= 0) return;
    const breathe = still ? 1 : 1 + ((breath || 0.5) - 0.5) * 0.03;
    const shim = still ? 1 : 1 + Math.sin(this.phase) * SHIMMER;
    const s = radius * WIDTH_PER_R * breathe * shim;
    ctx.save();
    if (filter) ctx.filter = filter;
    ctx.globalAlpha = OPACITY;
    ctx.translate(x, y);
    // No rotate. The seam is the horizontal midline of the two paintings.
    ctx.drawImage(img, -s / 2, -s / 2, s, s);
    this.draws++;
    ctx.restore();
  }
}
