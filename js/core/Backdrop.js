// ─── Backdrop (v9.7) ───
// One job: paint the galaxy's sky from the supplied portrait, and nothing else.
// The coded nebula, star field and four parallax layers used to sit here. They
// are gone from the frame; this image is the sky.
//
// No parallax. Each painting is a full-frame portrait with a dust lane placed
// on purpose. Sliding it would crop that lane, and any warmth left near the
// middle would walk off the hole. The world still drifts over a still sky.

const KEYS = {
  "Debris Reef": "reef",
  "Comet Current": "current",
  "Planet Nursery": "nursery",
  "Ruined Armada": "armada",
  "Void Rift": "void",
  "Star Meadow": "meadow",
  "Neutron Forge": "forge"
};
const ORDER = ["reef", "current", "nursery", "armada", "void", "meadow", "forge"];

export class Backdrop {
  constructor() {
    this.key = "reef";
    this.images = {};
    for (let i = 0; i < ORDER.length; i++) {
      const k = ORDER[i];
      const img = new Image();
      img.decoding = "async";
      img.src = "assets/backdrop_" + k + ".jpg";
      this.images[k] = img;
    }
  }

  /** Biome name from biomes.js. Unknown names fall back to the reef sky. */
  set(biomeName) {
    this.key = KEYS[biomeName] || "reef";
  }

  get ready() {
    const img = this.images[this.key];
    return !!(img && img.complete && img.naturalWidth);
  }

  /** Cover the CSS-pixel viewport. Letterboxing is a flat tint, never a second sky. */
  draw(ctx, w, h, tint) {
    ctx.fillStyle = tint || "#04060c";
    ctx.fillRect(0, 0, w, h);
    const img = this.images[this.key];
    if (!img || !img.complete || !img.naturalWidth) return;
    const ir = img.naturalWidth / img.naturalHeight;
    const vr = w / h;
    let dw, dh, dx, dy;
    if (vr > ir) { dw = w; dh = w / ir; dx = 0; dy = (h - dh) / 2; }
    else { dh = h; dw = h * ir; dy = 0; dx = (w - dw) / 2; }
    ctx.drawImage(img, dx, dy, dw, dh);
  }
}
