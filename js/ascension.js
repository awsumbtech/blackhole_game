// ─── ASCENSION (v7, one loop since v9) ───
// Born -> grow -> collapse -> reborn stronger. Growth (tier-ups and layer
// merges) is the progression inside a run; Collapse is the only reset, Dark
// Matter the only meta currency and the constellation the only upgrade screen.
// A run starts again from dust at Galaxy 1 and each
// galaxy deeper asks a little more of you: bigger galaxies (more growth to
// clear), sparser food and calm rival holes that drift and compete for food.
// Nothing punishes you; it just gets slower, until it feels like a wall.
// Then you can Collapse into a singularity: the run resets, and you earn
// Dark Matter (grows faster than linearly with depth). Dark Matter buys
// permanent perks on the constellation, so the next run reaches further.
//
// Everything here is pure logic (no DOM), so the collapse-curve simulator in
// tools/ can import it directly and stay in step with the game.

// ─── DEPTH (how each galaxy deeper escalates) ───
export const DEPTH = {
  CLIMB_GROWTH: 1.18,   // each galaxy needs 18% more growth (in tiers) than the last
  DENSITY_STEP: 0.035,  // food thins 3.5% per galaxy...
  DENSITY_MIN: 0.62,    // ...down to 62%
  RIVAL_FROM: 3,        // calm rival holes from galaxy 3
  RIVAL_MAX: 3
};

export function depthInfo(depth) {
  const d = Math.max(1, depth | 0);
  return {
    climbK: Math.pow(DEPTH.CLIMB_GROWTH, d - 1),
    density: Math.max(DEPTH.DENSITY_MIN, 1 - DEPTH.DENSITY_STEP * (d - 1)),
    rivals: d < DEPTH.RIVAL_FROM ? 0 : Math.min(DEPTH.RIVAL_MAX, 1 + Math.floor((d - DEPTH.RIVAL_FROM) / 2)),
    rivalSize: 1.5 + 0.12 * (d - DEPTH.RIVAL_FROM)   // times your radius
  };
}

// ─── DARK MATTER ───
// DM = (3 * cleared^1.5 + 2 * peakTier) * fortune multipliers (+ per-find bonus)
export function dmFor(run, mods) {
  const c = Math.max(0, run.cleared | 0);
  if (c < 1) return { total: 0, parts: [] };
  const parts = [
    ["Depth reached", Math.round(3 * Math.pow(c, 1.5))],
    ["Largest scale", 2 * (run.peakTier | 0)]
  ];
  if (mods.dmPerFind && run.finds) parts.push(["Discoveries", mods.dmPerFind * run.finds]);
  if (run.goldenCleared) parts.push(["Golden galaxies", 5 * run.goldenCleared]);
  const base = parts.reduce((s, p) => s + p[1], 0);
  const mul = mods.dmMul;
  if (mul > 1.001) parts.push([`Fortune ×${mul.toFixed(2)}`, Math.round(base * (mul - 1))]);
  return { total: parts.reduce((s, p) => s + p[1], 0), parts };
}
export const COLLAPSE_MIN_CLEARED = 3;   // you can collapse once a run has cleared 3 galaxies

// ─── THE PERK CONSTELLATION ───
// Three branches. Each tier is one node, or a fork of two (buy either first;
// the next tier opens when you own at least one node of the tier before).
// Costs climb by tier, so early choices matter and later ones are big goals.
export const TIER_COST = [8, 16, 28, 45, 70, 100, 150];

export const BRANCHES = {
  reach: { name: "Reach", rgb: "140, 200, 255", line: "Pull range and event horizon" },
  appetite: { name: "Appetite", rgb: "255, 190, 130", line: "Bite size and the wisp's hunger" },
  fortune: { name: "Fortune", rgb: "235, 215, 120", line: "Discoveries, rare finds and Dark Matter" }
};

export const PERKS = [
  // Reach
  { id: "r1", b: "reach", t: 0, name: "Long Arms", desc: "+20% pull range" },
  { id: "r2", b: "reach", t: 1, name: "Wide Horizon", desc: "Eat things up to 3% closer to your own size" },
  { id: "r3a", b: "reach", t: 2, name: "Tidal Pull", desc: "+30% pull strength" },
  { id: "r3b", b: "reach", t: 2, name: "Still Water", desc: "Rival holes drift away from your food and barely nudge you" },
  { id: "r4", b: "reach", t: 3, name: "Event Horizon", desc: "Swallow from a little further away (+12% reach)" },
  { id: "r5a", b: "reach", t: 4, name: "Gravity Lens", desc: "+30% pull range" },
  { id: "r5b", b: "reach", t: 4, name: "Solar Wind", desc: "+15% drift speed" },
  { id: "r6", b: "reach", t: 5, name: "Singular Reach", desc: "Eat things up to 4% closer to your size, +15% pull" },
  { id: "r7", b: "reach", t: 6, name: "Horizon of Everything", desc: "+25% pull range and strength, +8% reach" },
  // Appetite
  { id: "a1", b: "appetite", t: 0, name: "Hungry", desc: "Every bite +15%" },
  { id: "a2", b: "appetite", t: 1, name: "Hungry Wisp", desc: "Your wisp nudges a crumb into you every few seconds" },
  { id: "a3a", b: "appetite", t: 2, name: "Big Appetite", desc: "Big catches give 60% more, and the golden halo shows sooner" },
  { id: "a3b", b: "appetite", t: 2, name: "Momentum", desc: "Combos add up to +40% (was +25%), and the combo window is 40% longer" },
  { id: "a4", b: "appetite", t: 3, name: "Feast", desc: "Every bite +20%" },
  { id: "a5a", b: "appetite", t: 4, name: "Second Helping", desc: "Power-ups last 40% longer and show up 25% more often" },
  { id: "a5b", b: "appetite", t: 4, name: "Supernova Seed", desc: "Supernova runs come twice as often" },
  { id: "a6", b: "appetite", t: 5, name: "Devourer", desc: "Every bite +18%" },
  { id: "a7", b: "appetite", t: 6, name: "Endless Hunger", desc: "Every bite +20%" },
  // Fortune
  { id: "f1", b: "fortune", t: 0, name: "Dark Harvest", desc: "+20% Dark Matter from each collapse" },
  { id: "f2", b: "fortune", t: 1, name: "Keen Eye", desc: "One more discovery hides in each galaxy" },
  { id: "f3a", b: "fortune", t: 2, name: "Golden Touch", desc: "Golden galaxies appear twice as often" },
  { id: "f3b", b: "fortune", t: 2, name: "Quiet Cradle", desc: "Breather galaxies need 15% less growth" },
  { id: "f4", b: "fortune", t: 3, name: "Deep Harvest", desc: "+30% Dark Matter" },
  { id: "f5a", b: "fortune", t: 4, name: "Rare Shimmer", desc: "Rare (shining) finds 3× as likely" },
  { id: "f5b", b: "fortune", t: 4, name: "Star Reader", desc: "Galaxy goal stars give double Dark Matter" },
  { id: "f6", b: "fortune", t: 5, name: "Singularity Dividend", desc: "+40% Dark Matter, and +2 for every discovery in the run" },
  { id: "f7", b: "fortune", t: 6, name: "Cosmic Ledger", desc: "+50% Dark Matter" }
];
export const perkById = id => PERKS.find(p => p.id === id);

export function perkCost(p) { return TIER_COST[p.t]; }

/** Can this perk be bought now? Returns { ok, why }. */
export function perkState(asc, p) {
  if (asc.perks[p.id]) return { ok: false, owned: true, why: "Owned" };
  if (p.t > 0 && !PERKS.some(q => q.b === p.b && q.t === p.t - 1 && asc.perks[q.id])) return { ok: false, why: "Needs the star before it" };
  const c = perkCost(p);
  if ((asc.dm || 0) < c) return { ok: false, why: `${c} Dark Matter`, cost: c };
  return { ok: true, cost: c };
}

export function buyPerk(asc, id) {
  const p = perkById(id);
  const s = perkState(asc, p);
  if (!s.ok) return false;
  asc.dm -= s.cost;
  asc.perks[id] = true;
  return true;
}

// ─── GALAXY GOALS (optional discoveries) ───
// One goal per galaxy type, using its own mechanic, rated 1-3 stars. They are
// optional: each new best star is noted in the logbook and gives a little
// Dark Matter (GOAL_DM, doubled by Star Reader). No perks hang on them.
export const GOALS = {
  "Debris Reef": { id: "reef", name: "Graze the reefs", unit: "reef stones eaten", stars: [20, 45, 80], metric: "reef" },
  "Comet Current": { id: "river", name: "Ride the current", unit: "seconds riding a river", stars: [20, 45, 75], metric: "ride" },
  "Planet Nursery": { id: "cradle", name: "Gather the Cradle's worlds", unit: "orbiting worlds eaten", stars: [3, 7, 12], metric: "orbit" },
  "Ruined Armada": { id: "salvage", name: "Salvage the hulls", unit: "hull pieces eaten", stars: [8, 20, 36], metric: "crumb" },
  "Void Rift": { id: "aurora", name: "Feed in the aurora", unit: "aurora bites", stars: [15, 35, 60], metric: "aurora" },
  "Star Meadow": { id: "bloom", name: "Patient blooms", unit: "full blooms eaten", stars: [4, 9, 16], metric: "bloom" },
  "Neutron Forge": { id: "beam", name: "Feed in the beams", unit: "bites inside a beam", stars: [20, 45, 80], metric: "beam" }
};
export function starsFor(goal, n) { return goal ? goal.stars.filter(s => n >= s).length : 0; }
export const GOAL_DM = 2;   // per new best star

/** A new best star for this galaxy type? Records it and returns the Dark Matter it gives (0 if not new). */
export function noteGoalStar(asc, mods, biome, stars) {
  const prev = asc.goalStars[biome] || 0;
  if (stars <= prev) return 0;
  asc.goalStars[biome] = stars;
  const dm = (stars - prev) * GOAL_DM * (mods.goalDm || 1);
  asc.dm += dm; asc.dmTotal = (asc.dmTotal || 0) + dm;
  return dm;
}

// ─── COLLAPSE MILESTONES (permanent unlocks by number of collapses) ───
export const MILESTONES = [
  { at: 1, id: "golden", name: "Golden galaxies", desc: "Now and then a galaxy shines gold: +5 Dark Matter when you pass through it" },
  { at: 1, id: "skin_ember", name: "Ember skin", desc: "A warm ember accretion disk (Settings > Hole skin)" },
  { at: 3, id: "supernova", name: "Supernova runs", desc: "Some runs begin as a supernova: every bite counts 50% more for the whole run" },
  { at: 3, id: "skin_aurora", name: "Aurora skin", desc: "A soft green-violet aurora disk" },
  { at: 6, id: "skin_pearl", name: "Void Pearl skin", desc: "A pale, pearly disk" }
];
export function hasMilestone(asc, id) {
  const m = MILESTONES.find(x => x.id === id);
  return !!m && (asc.collapses || 0) >= m.at;
}
export function milestonesAt(n) { return MILESTONES.filter(m => m.at === n); }
export function nextMilestone(asc) { return MILESTONES.find(m => m.at > (asc.collapses || 0)) || null; }

export const SKINS = [
  { id: "classic", name: "Classic", hue: 0, unlock: null },
  { id: "ember", name: "Ember", hue: -28, sat: 1.25, unlock: "skin_ember" },
  { id: "aurora", name: "Aurora", hue: 120, sat: 0.95, unlock: "skin_aurora" },
  { id: "pearl", name: "Void Pearl", hue: 0, sat: 0.2, bright: 1.15, unlock: "skin_pearl" }
];

// ─── STATE + DERIVED MODIFIERS ───
export function defaultAsc() {
  return {
    dm: 0, dmTotal: 0, collapses: 0, perks: {}, goalStars: {}, bestDepth: 0,
    run: freshAscRun(), history: [], skin: "classic", runsStarted: 1
  };
}
export function freshAscRun() {
  return { cleared: 0, peakTier: 0, finds: 0, goldenCleared: 0, supernova: false, started: Date.now(), time: 0 };
}

/** Normalize an asc block from any save (v7 migration starts everyone at zero, keeps the journey). */
export function normalizeAsc(a) {
  const d = defaultAsc();
  if (!a || typeof a !== "object") return d;
  return {
    ...d, ...a,
    perks: { ...(a.perks || {}) }, goalStars: { ...(a.goalStars || {}) },
    run: { ...freshAscRun(), ...(a.run || {}) },
    history: Array.isArray(a.history) ? a.history.slice(-40) : []
  };
}

export function ascMods(asc) {
  const P = id => !!asc.perks[id];
  let gain = 1;
  if (P("a1")) gain *= 1.15;
  if (P("a4")) gain *= 1.2;
  if (P("a6")) gain *= 1.18;
  if (P("a7")) gain *= 1.2;
  let dmMul = 1;
  if (P("f1")) dmMul *= 1.2;
  if (P("f4")) dmMul *= 1.3;
  if (P("f6")) dmMul *= 1.4;
  if (P("f7")) dmMul *= 1.5;
  return {
    gain,
    pullRange: (P("r1") ? 1.2 : 1) * (P("r5a") ? 1.3 : 1) * (P("r6") ? 1.15 : 1) * (P("r7") ? 1.15 : 1),
    pullStrength: (P("r3a") ? 1.3 : 1) * (P("r7") ? 1.15 : 1),
    eatRatioAdd: (P("r2") ? 0.03 : 0) + (P("r6") ? 0.04 : 0),
    reachAdd: (P("r4") ? 0.12 : 0) + (P("r7") ? 0.08 : 0),
    speed: P("r5b") ? 1.15 : 1,
    rivalCalm: P("r3b"),
    wispFeed: P("a2"),
    bigCatch: P("a3a") ? 1.6 : 1, haloFrom: P("a3a") ? 0.72 : 0.82,
    comboCap: P("a3b") ? 40 : 25,
    puDur: P("a5a") ? 1.4 : 1,
    puFreq: P("a5a") ? 1.25 : 1,
    supernovaMul: P("a5b") ? 2 : 1,
    dmMul,
    extraFind: P("f2") ? 1 : 0,
    goldenMul: P("f3a") ? 2 : 1,
    rareMul: P("f5a") ? 3 : 1,
    goalDm: P("f5b") ? 2 : 1,
    dmPerFind: P("f6") ? 2 : 0,
    breatherClimb: P("f3b") ? 0.85 : 1,
    comboWindow: P("a3b") ? 1.4 : 1
  };
}

// ─── VARIABLE REWARDS ───
export const GOLDEN_CHANCE = 0.08;     // per galaxy, once unlocked
export const SUPERNOVA_CHANCE = 0.12;  // per run, once unlocked
export const RARE_FIND_CHANCE = 0.06;  // a find is "shining" (+3 Dark Matter)

export function rollGolden(asc, mods, rnd = Math.random) {
  return hasMilestone(asc, "golden") && rnd() < GOLDEN_CHANCE * mods.goldenMul;
}
export function rollSupernova(asc, mods, rnd = Math.random) {
  return hasMilestone(asc, "supernova") && rnd() < SUPERNOVA_CHANCE * mods.supernovaMul;
}
