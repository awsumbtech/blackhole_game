// Sprite cache: looks, keys, size buckets and the painter table. Per frame only cache lookups.

import { paintShip, shipKey, shipExtent, SHIP_LOOKS } from "../ships.js";
import { COMET_PAINTERS } from "./comets.js";
import { DEEPSKY_PAINTERS } from "./deepsky.js";
import { DUST_PAINTERS } from "./dust.js";
import { rng, makeCanvas } from "./kit.js";
import { ringedPlanet, PLANET_PAINTERS } from "./planets.js";
import { artCache, quality, cacheGen, bucketFor } from "./quality.js";
import { ROCK_PAINTERS } from "./rocks.js";
import { STAR_PAINTERS } from "./stars.js";

// ─── Sprite cache ───
const cache = artCache();          // key -> { c, size, ext, used }
const baseIndex = artCache();      // baseKey -> Set(bucket) for fallbacks
let frameNo = 0;
let genBudget = 0;
let genMs = 0;                    // time spent painting this frame
let generated = 0;
const MAX_SPRITES = 600;

/** Call once per frame before drawing. */
export function beginArtFrame() {
  frameNo++;
  genBudget = quality === "high" ? 6 : 3;
  genMs = 0;
  if (cache.size > MAX_SPRITES && frameNo % 30 === 0) evict();
}
export function artStats() { return { sprites: cache.size, generated, quality }; }

function evict() {
  const arr = [...cache.entries()].sort((a, b) => a[1].used - b[1].used);
  for (let i = 0; i < arr.length - MAX_SPRITES * 0.8; i++) {
    cache.delete(arr[i][0]);
    const [base, b] = splitKey(arr[i][0]);
    baseIndex.get(base)?.delete(b);
  }
}
function splitKey(k) { const i = k.lastIndexOf("|"); return [k.slice(0, i), +k.slice(i + 1)]; }

// ─── v9 looks: seeded variety per instance ───
// Every type has a set of looks (archetype + seeded details). The look comes from
// the entity's seed (or an explicit e.look >= 0), so the cache holds one sprite
// per type / look / size rather than one per object.
const LOOKS = { craft: SHIP_LOOKS, dust: 8, junk: 10, meteor: 12, comet: 6, moon: 12, planet: 30, star: 12, system: 8, nebula: 10, cluster: 6, galaxy: 10 };
// Types that paint their own palette from the look (e.color is only a minimap tint)
const OWN = { dust: 1, junk: 1, meteor: 1, comet: 1, moon: 1, planet: 1, star: 1, system: 1 };
export function lookOf(e) {
  const n = LOOKS[e.type];
  if (!n) return 0;
  return e.look >= 0 ? e.look % n : (((e.seed | 0) >>> 3) % n);
}

/** How far (in radii) each type's art extends from the centre. */
function extentFor(type, variant, look) {
  switch (type) {
    case "star": return 2.7;
    case "neutron": return 3.1;
    case "comet": return 2.3;
    case "planet": return ringedPlanet(look, variant) ? 2.05 : variant === 1 ? 1.65 : 1.35;
    case "meteor": return 1.4;
    case "system": return 2.5;
    case "nebula": return 1.75;
    case "cluster": return 1.9;
    case "galaxy": return 1.75;
    case "dust": return 1.6;
    default: return 1.3;
  }
}

function baseKeyFor(e) {
  const L = lookOf(e), t = e.type;
  if (t === "craft") return shipKey(e) + "|" + L;
  if (OWN[t]) return t + "||" + L + "|" + (t === "planet" ? e.variant || 0 : 0);
  return `${t}|${e.color}|${e.bands ? e.bands[0] : ""}|${e.variant || 0}|${L}`;
}

/** Returns { c, size } where size is the drawn width in entity radii*2 units. */
export function spriteFor(e, rpx) {
  // Hysteresis: keep the current sprite while the on-screen size stays close,
  // so a slowly zooming camera doesn't repaint everything every few frames.
  const cur = e._sp;
  if (cur && cur.g === cacheGen && e._artBase && rpx <= cur.b * 1.05 && rpx >= cur.b * 0.62) { cur.used = frameNo; return cur; }
  const b = bucketFor(rpx, e.type === "craft");
  const base = e._artBase || (e._artBase = baseKeyFor(e));
  const key = base + "|" + b;
  let s = cache.get(key);
  if (!s) {
    const have = baseIndex.get(base);
    if ((genBudget <= 0 || genMs > 2.5) && have && have.size) {
      // Over this frame's budget: use the closest size we already have
      let best = null, bd = Infinity;
      for (const hb of have) { const d = Math.abs(Math.log(hb / b)); if (d < bd) { bd = d; best = hb; } }
      s = cache.get(base + "|" + best);
    }
    if (!s) {
      genBudget--;
      const t0 = performance.now();
      s = paint(e, b);
      genMs += performance.now() - t0;
      cache.set(key, s);
      if (!have) baseIndex.set(base, new Set([b])); else have.add(b);
    }
  }
  s.used = frameNo;
  e._sp = s;
  return s;
}

function paint(e, b) {
  generated++;
  const variant = e.variant || 0, look = lookOf(e);
  const ext = e.type === "craft" ? shipExtent(e.ship) : extentFor(e.type, variant, look);
  const size = Math.ceil(b * ext * 2) + 2;
  const c = makeCanvas(size);
  const g = c.getContext("2d");
  g.translate(size / 2, size / 2);
  // one look always paints the same (whichever object asked first)
  const r = rng(LOOKS[e.type] ? (look + 1) * 2654435761 + variant * 40503 + e.type.length * 977 : e.seed || 7);
  const painter = PAINTERS[e.type] || PAINTERS.dust;
  painter(g, b, e, r, variant, look);
  // `scale` converts canvas px to entity radii: drawn width = size / b * radius
  return { c, k: size / b, b, g: cacheGen, used: frameNo };
}

const PAINTERS = {
  craft(g, R, e) { paintShip(g, R, e); },   // v9.4: the ship system paints every class
  ...DUST_PAINTERS, ...ROCK_PAINTERS, ...COMET_PAINTERS, ...PLANET_PAINTERS,
  ...STAR_PAINTERS, ...DEEPSKY_PAINTERS
};
