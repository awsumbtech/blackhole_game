// Art quality and size buckets. Every cache registers here so a quality change clears them all.

const caches = [];
/** A Map that setArtQuality clears. */
export function artCache() { const m = new Map(); caches.push(m); return m; }

// ─── Quality ───
export let quality = "high";             // "high" | "balanced"
export let cacheGen = 0;
export function setArtQuality(q) {
  if (q === quality) return;
  quality = q;
  cacheGen++;
  for (const m of caches) m.clear();
}
export function getArtQuality() { return quality; }

// On-screen radius buckets (device px). Sprites are painted at the bucket at or
// just above the real size, so they are always downscaled (crisp, never blurry).
// v9.4: ships may paint larger (their detail is what sells scale)
const BUCKETS = [3, 4, 6, 8, 11, 15, 20, 27, 36, 48, 64, 85, 112, 150, 200, 260];
export function bucketFor(rpx, big) {
  const cap = quality === "high" ? (big ? 260 : 150) : (big ? 150 : 85);
  const r = Math.min(rpx, cap);
  for (const b of BUCKETS) if (b >= r * 0.9) return b;
  return BUCKETS[BUCKETS.length - 1];
}
