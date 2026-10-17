// ─── GRADE (v8) ───
// Soft vignette + gentle per-biome colour grade. It's a CSS layer over the
// game canvas (composited by the GPU, zero canvas fill cost); we only touch it
// when the biome or quality changes.

const $ = id => document.getElementById(id);
let lastBiome, lastHigh;

export function setGrade(biome, high) {
  if (biome === lastBiome && high === lastHigh) return;
  lastBiome = biome; lastHigh = high;
  const rgb = biome && biome.tintRGB ? biome.tintRGB : null;
  const el = $("grade");
  if (!el) return;
  const c = rgb ? [Math.min(255, rgb[0] * 3), Math.min(255, rgb[1] * 3), Math.min(255, rgb[2] * 3)] : [20, 30, 60];
  el.style.setProperty("--grade", `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${high ? 0.09 : 0})`);
}
