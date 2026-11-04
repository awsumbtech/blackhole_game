// ─── Breathing ───
// ~6 breaths per minute. Drives the drone swell, the biome glow, the hole's
// halo (plus the optional guide ring) and Zen's breath pull.
export const BREATH_MS = 10000;
export function breathPhase(now) {
  // v7.1: 4 s in, 6 s out (6 breaths a minute)
  const ph = (now % BREATH_MS) / BREATH_MS * 10;
  return ph < 4 ? 0.5 - 0.5 * Math.cos(Math.PI * ph / 4) : 0.5 + 0.5 * Math.cos(Math.PI * (ph - 4) / 6);
}
