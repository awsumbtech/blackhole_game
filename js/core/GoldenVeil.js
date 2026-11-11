// ─── GoldenVeil (v9.7) ───
// One job: a warm haze on a golden galaxy. The painting covers the frame and
// is drawn in 'screen' at 0.35, so black in the file leaves the sky alone.
// If the file is missing, draw is a no-op.

const SRC = "assets/sky/golden_veil.jpg";
const OPACITY = 0.35;

export class GoldenVeil {
  constructor() {
    this.ok = false;
    this.img = new Image();
    this.img.decoding = "async";
    this.img.onload = () => { this.ok = this.img.naturalWidth > 0; };
    this.img.onerror = () => { this.ok = false; };
    this.img.src = SRC;
  }

  /** Cover the view. Only when this galaxy rolled golden and the image loaded. */
  draw(ctx, w, h, golden) {
    if (!golden || !this.ok) return;
    const img = this.img;
    const ir = img.naturalWidth / img.naturalHeight;
    const vr = w / h;
    let dw, dh, dx, dy;
    if (vr > ir) { dw = w; dh = w / ir; dx = 0; dy = (h - dh) / 2; }
    else { dh = h; dw = h * ir; dy = 0; dx = (w - dw) / 2; }
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = OPACITY;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
  }
}
