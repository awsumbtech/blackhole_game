// ─── BigCatchOutline ───
// One job: draw the baked gold edge for a big catch.
// The pictures live in assets/fx/outline/. This file only loads and draws them.
// Nothing here stamps, fills, blurs or composites a new shape.

import { artCache, cacheGen } from "../art/quality.js";

const SHIP_LOOKS = 8;
const SHIP_CLASSES = ["drone", "shuttle", "freighter", "cruiser", "capital"];
const LOOKS = {
  junk: 10, meteor: 12, comet: 6, moon: 12, planet: 30,
  star: 12, system: 8, nebula: 10, cluster: 6, galaxy: 10, dust: 8
};

const images = artCache();
let genSeen = -1;
let manifest = null;
let asked = false;

/** Stable id for a baked silhouette. Colour is not part of it. */
export function outlineId(e) {
  if (!e || !e.type) return "";
  if (e.type === "craft") {
    const ship = SHIP_CLASSES.indexOf(e.ship) >= 0 ? e.ship : "drone";
    const look = ((e.look | 0) % SHIP_LOOKS + SHIP_LOOKS) % SHIP_LOOKS;
    return "craft-" + ship + "-" + (e.wreck ? 1 : 0) + "-" + look;
  }
  if (e.type === "neutron") return "neutron";
  const n = LOOKS[e.type];
  if (!n) return "";
  const look = e.look >= 0 ? ((e.look % n) + n) % n : (((e.seed | 0) >>> 3) % n);
  const variant = e.type === "planet" ? ((e.variant | 0) % 4 + 4) % 4 : 0;
  return e.type + "-" + look + "-" + variant;
}

function ensure() {
  if (genSeen !== cacheGen) genSeen = cacheGen;
  if (manifest || asked) return;
  asked = true;
  fetch("assets/fx/outline/map.json")
    .then(r => r.ok ? r.json() : null)
    .then(data => { manifest = data || {}; })
    .catch(() => { manifest = {}; });
}

function imageFor(id) {
  ensure();
  if (!manifest) return null;
  const meta = manifest[id];
  if (!meta) return null;
  let img = images.get(id);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.src = "assets/fx/outline/" + meta.file;
    images.set(id, img);
    return null;
  }
  if (!img.complete || !img.naturalWidth) return null;
  return { img, srcW: meta.srcW };
}

/**
 * Draw the baked outline in the caller's transform, centred on the sprite.
 * If the picture is not here yet, or this look has none, draw nothing.
 */
export function drawBigCatchOutline(ctx, e, sprite, drawn, alpha) {
  if (!sprite || !(drawn > 0) || !(alpha > 0)) return;
  const got = imageFor(outlineId(e));
  if (!got) return;
  const scale = drawn / got.srcW;
  const dw = got.img.naturalWidth * scale;
  const dh = got.img.naturalHeight * scale;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  ctx.drawImage(got.img, -dw / 2, -dh / 2, dw, dh);
  ctx.globalAlpha = prev;
}
