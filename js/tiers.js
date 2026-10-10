// ─── SCALE TIERS (v5 "Vast") ───
// One continuous ladder across galaxies. Each tier is a 2.6x step in hole
// radius. Each new galaxy starts at the highest size you reached in the last
// one (your "floor"), with fine dust around you, and climbs a little further.

export const TIER_STEP = 2.6;      // hole radius ratio per tier
export const R0 = 5.3;             // tier grid origin (tier 1 begins at ~13.8)
export const START_R = 8;          // a brand-new hole starts here, partway into tier 0,
                                   // so the very first galaxy reveals a tier mid-way

// food / big: type weights for what drifts around at this tier
export const TIERS = [
  { name: "Space Dust", line: "Specks of dust, drifting. Everything starts here.",
    food: { dust: 6, junk: 1 }, big: { junk: 3, meteor: 1 } },
  { name: "Grit & Pebbles", line: "The dust has gathered into grit and pebbles.",
    food: { dust: 3, junk: 4, meteor: 1 }, big: { meteor: 3, junk: 1 } },
  { name: "Asteroids", line: "Stones the size of mountains drift into reach.",
    food: { junk: 3, meteor: 4, comet: 1 }, big: { meteor: 3, craft: 1 } },
  { name: "Comets & Ice", line: "Ice and old wrecks. The quiet is getting wider.",
    food: { meteor: 3, comet: 4, craft: 1 }, big: { comet: 1, craft: 2, moon: 2 } },
  { name: "Moons", line: "Little moons now. You could hold one.",
    food: { comet: 2, moon: 4, meteor: 1 }, big: { moon: 2, planet: 2 } },
  { name: "Planets", line: "Whole worlds turn slowly around you.",
    food: { moon: 3, planet: 4 }, big: { planet: 3, star: 1 } },
  { name: "Giant Worlds", line: "Ringed giants. Their moons are crumbs now.",
    food: { planet: 5, moon: 1 }, big: { planet: 2, star: 2 } },
  { name: "Stars", line: "Stars, soft and warm, are within reach.",
    food: { planet: 2, star: 4, neutron: 1 }, big: { star: 3, system: 1 } },
  { name: "Star Systems", line: "Whole systems, a sun and its worlds, drift by.",
    food: { star: 3, neutron: 1, system: 3 }, big: { system: 2, nebula: 2 } },
  { name: "Nebulae", line: "Clouds where stars are born. You are vast now.",
    food: { system: 3, nebula: 3 }, big: { nebula: 2, cluster: 2 } },
  { name: "Star Clusters", line: "Thousands of suns, gathered like lanterns.",
    food: { nebula: 3, cluster: 3 }, big: { cluster: 2, galaxy: 2 } },
  { name: "Galaxies", line: "Galaxies, turning slowly in the dark.",
    food: { cluster: 2, galaxy: 4 }, big: { galaxy: 3 } },
  { name: "Galaxy Groups", line: "Galaxies gather in quiet families.",
    food: { galaxy: 5, cluster: 1 }, big: { galaxy: 3 } },
  { name: "Cosmic Web", line: "The great web of everything, glowing faintly.",
    food: { galaxy: 5, nebula: 1 }, big: { galaxy: 3 } }
];

const ROMAN = ["", " II", " III", " IV", " V", " VI", " VII", " VIII", " IX", " X"];

export function tierIndexForR(r) {
  return Math.max(0, Math.floor(Math.log(Math.max(r, R0) / R0) / Math.log(TIER_STEP) + 1e-9));
}
export function tier(i) {
  const last = TIERS.length - 1;
  if (i <= last) return TIERS[i];
  const t = TIERS[last];
  const n = i - last + 1;
  return { ...t, name: t.name + (ROMAN[n] || " " + n), line: "Further out than anything has a name." };
}
export function tierName(i) { return tier(i).name; }
export function rForTier(i) { return R0 * Math.pow(TIER_STEP, i); }

// Must match updateRadius() in game.js: R = 4 + sqrt(mass) * 0.9
export function startMass() { return massForR(START_R); }
export function massForR(r) { const s = Math.max(0, (r - 4) / 0.9); return s * s; }
export function rForMass(m) { return Math.max(6, 4 + Math.sqrt(m) * 0.9); }

/** 0..1 position inside the current tier (for the HUD). */
export function tierProgress(r) {
  const x = Math.log(Math.max(r, R0) / R0) / Math.log(TIER_STEP);
  return x - Math.floor(x + 1e-9);
}

// How far one galaxy climbs, in tiers. Regular galaxies always cross at
// least one tier line; breathers are a short, generous half step.
export const REGULAR_CLIMB = 1.12;
export const BREATHER_CLIMB = 0.5;

export function targetMassFrom(startMass, breather) {
  const r = rForMass(startMass) * Math.pow(TIER_STEP, breather ? BREATHER_CLIMB : REGULAR_CLIMB);
  return massForR(r);
}

/** Old saves (v4.1 and earlier) map to a sensible starting tier. */
export function floorMassForLegacyGalaxy(galaxy) {
  const t = Math.min(9, Math.max(0, Math.round((galaxy - 1) * 0.6)));
  return massForR(rForTier(t) * 1.02);
}

/**
 * Food weights for the current moment: the tier's palette, flavoured by the
 * galaxy's biome, and mostly fine dust in the opening of each galaxy so it
 * feels like a fresh start.
 */
export function foodWeights(state) {
  const t = tier(state.tier || 0);
  const w = flavour(t.food, state.biome);
  const p = state.galaxyProgress || 0;
  if (p < 0.12) w.dust = (w.dust || 0) + 8 * (1 - p / 0.12);
  return w;
}
export function bigWeights(state) {
  return flavour(tier(state.tier || 0).big, state.biome);
}
function flavour(base, biome) {
  const out = {};
  const bw = (biome && biome.weights) || {};
  for (const [id, v] of Object.entries(base)) {
    const b = bw[id];
    out[id] = v * (b == null ? 1 : 0.5 + Math.min(2, b / 4));
  }
  // Each biome keeps a hint of its signature object at any scale
  if (biome && biome.signature && !out[biome.signature]) out[biome.signature] = 0.8;
  return out;
}

/** Event streams use the tier's own objects (a "meteor shower" of stars...). */
export function eventType(state, base) {
  const t = state.tier || 0;
  if (base === "meteor" && t <= 3) return "meteor";
  if (base === "comet" && t <= 5) return "comet";
  if (base === "craft" && t <= 6) return "craft";
  const food = tier(t).food;
  let best = "dust", bv = -1;
  for (const [id, v] of Object.entries(food)) if (v > bv) { bv = v; best = id; }
  return best;
}
export function eventBigType(state) {
  const big = tier(state.tier || 0).big;
  let best = "star", bv = -1;
  for (const [id, v] of Object.entries(big)) if (v > bv) { bv = v; best = id; }
  return best;
}
