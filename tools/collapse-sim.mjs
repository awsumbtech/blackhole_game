// Collapse-curve simulator (v7, updated for v9's one loop: no shop, no galaxy
// perks, no kept upgrades). Models each galaxy's clear time from the bot
// baseline and the measured depth curve (bot time ~ base * climbK^0.72),
// applies constellation perks, and collapses when the next galaxy would take a
// human (1.2x the bot) longer than WALL minutes. Goal stars add a little DM.
// Usage: node tools/collapse-sim.mjs [cycles=10] [wallMin=9]  (9 = the in-game collapse nudge)
import { DEPTH, TIER_COST, depthInfo, dmFor, ascMods, defaultAsc, freshAscRun, PERKS, perkState, buyPerk, MILESTONES } from "../js/ascension.js";
const BASE = [186, 263, 93, 262, 147, 84, 204];        // v9 bot seconds per biome at depth 1 (Reef..Forge), back-fitted from v9 runs
const BREATHER = [false, false, true, false, false, true, false];
const HUMAN = 1.2, EXP = 0.72;
const cycles = +(process.argv[2] || 10), WALL = +(process.argv[3] || 9) * 60;
if (process.env.CLIMB) DEPTH.CLIMB_GROWTH = +process.env.CLIMB;
if (process.env.COST) TIER_COST.splice(0, 7, ...JSON.parse(process.env.COST));

function power(m) {   // how much faster a perk set clears (time divides by this)
  return m.gain * (1 + 0.35 * (m.pullRange * m.pullStrength - 1)) * (1 + 1.5 * m.eatRatioAdd)
    * (1 + 0.5 * m.reachAdd) * Math.sqrt(m.speed) * (m.bigCatch > 1 ? 1.05 : 1) * (m.comboCap > 25 ? 1.04 : 1);
}
function galaxyTime(depth, m) {
  const i = (depth - 1) % 7, d = depthInfo(depth);
  const k = d.climbK * (BREATHER[i] ? m.breatherClimb : 1);
  const thin = 1 + 0.6 * (1 - d.density);               // sparser food, slightly slower
  return BASE[i] * Math.pow(k, EXP) * thin * HUMAN / power(m);
}
// greedy buyer: cheapest buyable, rotating Appetite -> Reach -> Fortune; first fork option
function shop(asc) {
  const order = ["appetite", "reach", "fortune"];
  for (let guard = 0; guard < 99; guard++) {
    const opts = PERKS.filter(p => perkState(asc, p).ok && !(p.fork && PERKS.some(q => q.b === p.b && q.t === p.t && asc.perks[q.id])));
    if (!opts.length) break;
    opts.sort((a, b) => a.t - b.t || order.indexOf(a.b) - order.indexOf(b.b) || a.id.localeCompare(b.id));
    buyPerk(asc, opts[0].id);
  }
}
const asc = defaultAsc();
let total = 0;
console.log("cycle  depth  minutes  cum.min  DM   perks  power");
for (let c = 1; c <= cycles; c++) {
  const m = ascMods(asc);
  asc.run = freshAscRun();
  let t = 0, depth = 1;
  while (depth < 60) {
    const g = galaxyTime(depth, m);
    if (depth > 3 && g > WALL) break;
    t += g; asc.run.cleared = depth; asc.run.peakTier = depth + 1; depth++;
  }
  // goal stars: assume a new best star on ~1 in 3 galaxy types per run early on (+2 DM each, x2 Star Reader)
  const goal = Math.min(depth - 1, 7) * (c <= 6 ? 2 / 3 : 1 / 4) * 2 * (m.goalDm || 1);
  const dm = dmFor(asc.run, m).total + Math.round(goal);
  total += t;
  asc.dm += dm; asc.collapses++;
  console.log(String(c).padStart(5), String(depth - 1).padStart(6), (t / 60).toFixed(1).padStart(8), (total / 60).toFixed(0).padStart(8), String(dm).padStart(4), String(Object.keys(asc.perks).length).padStart(6), power(m).toFixed(2).padStart(6));
  shop(asc);
}
