// ─── BigCatchOutline ───
// One job: a thin gold edge that follows a sprite's own shape.
// Built once per sprite canvas and size bucket. The sprite itself is not tinted.
// No arcs, paths or gradients are drawn over the object at frame time.

const GOLD = "rgb(255, 214, 140)";
const cache = new Map();

function build(src) {
  const pad = Math.max(8, Math.round(src.width * 0.07));
  const w = src.width + pad * 2;
  const h = src.height + pad * 2;
  const stamp = document.createElement("canvas");
  stamp.width = w;
  stamp.height = h;
  const g = stamp.getContext("2d");
  const steps = 16;
  const rad = Math.max(2, pad * 0.38);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    g.drawImage(src, pad + Math.cos(a) * rad, pad + Math.sin(a) * rad);
  }
  g.globalCompositeOperation = "source-in";
  g.fillStyle = GOLD;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = "destination-out";
  g.drawImage(src, pad, pad);

  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.__bigCatchOutline = true;
  const o = c.getContext("2d");
  o.filter = "blur(" + Math.max(1.2, pad * 0.16).toFixed(2) + "px)";
  o.drawImage(stamp, 0, 0);
  return c;
}

/** The cached outline for this sprite look. `bucket` is the art size bucket. */
export function outlineFor(sprite, bucket) {
  let byB = cache.get(sprite);
  if (!byB) cache.set(sprite, byB = new Map());
  let c = byB.get(bucket);
  if (c) return c;
  c = build(sprite);
  byB.set(bucket, c);
  return c;
}

/**
 * Draw the outline in the caller's current transform, centred, behind the sprite.
 * `drawn` is the sprite's drawn width in the same units as the transform.
 */
export function drawBigCatchOutline(ctx, sprite, bucket, drawn, alpha) {
  const c = outlineFor(sprite, bucket);
  const scale = drawn / sprite.width;
  const dw = c.width * scale;
  const dh = c.height * scale;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  ctx.drawImage(c, -dw / 2, -dh / 2, dw, dh);
  ctx.globalAlpha = prev;
}
