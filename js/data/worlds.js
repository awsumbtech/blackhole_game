// ─── WORLD DEFINITIONS (data only) ───
// What each galaxy's signature mechanic is called and says (codex, captions,
// event pairings), and how its landmark sets are laid out: names, glow colours
// (rgb strings), counts and sizes in b0 units (b0 = one set's span).
// The behaviour that reads this lives in js/worlds.js.

// ─── Codex / captions ───
export const MECHANICS = {
  "Debris Reef": {
    name: "Regrowing reefs",
    first: "Reefs of rock gather here and slowly regrow after you graze them.",
    minTier: 1,   // v8.4: a newborn sees the reefs only as haze in the back layer
    codex: "Soft teal reefs hold clusters of rock. Graze one, drift off, and it quietly regrows. Meteor showers reseed the reefs faster.",
    pairs: { meteorShower: "the shower is reseeding the reefs" }
  },
  "Comet Current": {
    name: "Rivers to ride",
    first: "Glide into a river of light and let the current carry you along.",
    codex: "Rivers of light flow across the galaxy. Drift into one and it carries you (and its comets) along. Comet streams pour in upstream.",
    pairs: { cometStream: "comets are pouring into the rivers" }
  },
  "Planet Nursery": {
    name: "The Cradle",
    first: "A young sun sits in this galaxy. Little worlds circle it, slow and patient.",
    codex: "A warm young sun with planets on slow orbits. Come close and they drift out of orbit toward you. Stellar births add new worlds to the rings.",
    pairs: { stellarBirth: "new worlds are joining the orbits", dustBloom: "new worlds are joining the orbits" }
  },
  "Ruined Armada": {
    name: "Breakable hulls",
    first: "Big hulls here are brittle. Nudge one and pieces crumble off for you.",
    codex: "Old hulls too big to swallow crumble softly when you bump them, shedding pieces you can eat. Keep nudging and they shrink until they fit. Flotillas bring more hulls.",
    pairs: { derelictFlotilla: "a few brittle hulls drift in with them" }
  },
  "Void Rift": {
    name: "Aurora feeding line",
    first: "Follow the aurora. Food slowly gathers along its light.",
    codex: "A ribbon of aurora crosses the rift. Small food keeps appearing along it and drifts down its length. A void gift makes it glow and feed faster.",
    pairs: { voidPulse: "the aurora brightens and feeds faster" }
  },
  "Star Meadow": {
    name: "Blooming stars",
    first: "Star buds grow in the meadows. Eat them now, or wait and they bloom bigger.",
    codex: "Little star buds grow in golden meadows and bloom over about half a minute. Patient bites are bigger. A stellar birth makes the nearest meadow bloom all at once.",
    pairs: { stellarBirth: "the meadow is blooming", dustBloom: "the meadow is blooming" }
  },
  "Neutron Forge": {
    name: "Pulsar beams",
    first: "Slow pulsar beams sweep the forge. Inside a beam, everything you eat counts 50% more.",
    codex: "Pulsars turn slowly, sweeping soft beams of light. While you are inside a beam, food gives +50% mass. Gravity waves make the beams flare wider for a while.",
    pairs: { gravitationalWave: "the beams flare wider" }
  }
};

// Later sets of the same galaxy get a prefix ("Greater Shoals", "The Far Cradle")
export const SET_PREFIX = ["Greater", "Outer", "High", "Far", "Grand", "Deep"];

export const LAYOUTS = {
  "Debris Reef": {
    names: ["The Shoals", "Pebble Reach", "Old Reef", "Driftstone"], rgb: "120, 220, 200",
    spots: [4, 0.32, 0.7], reefR: [0.17, 0.06], want: 10, rocks: 6
  },
  "Comet Current": {
    names: ["The Long River", "Glacier Run"], rgb: "170, 225, 255",
    bend: 0.55, width: 0.11
  },
  "Planet Nursery": {
    name: "The Cradle", rgb: "255, 216, 140",
    dist: 0.36, sunR: 0.075, rings: [2.4, 3.6, 5.0, 6.5], lmR: 6.8, worlds: 18,
    sun: { type: "star", color: "#ffd86d", seed: 4242, variant: 0, look: 0 }
  },
  "Ruined Armada": {
    spots: [2, 0.35, 0.62],
    flagship: { name: "The Flagship", rgb: "205, 180, 255", size: 0.16, lmR: 0.22, color: "#8f7fb0", debris: 7, hulls: 3 },
    line: { name: "The Broken Line", rgb: "215, 170, 120", lmR: 0.18, hulls: 4 }
  },
  "Void Rift": {
    bend: 0.4,
    marks: [{ name: "The Aurora", at: 0.5, rgb: "130, 240, 200" }, { name: "Stillwater", at: 0.85, rgb: "150, 150, 255" }], lmR: 0.14
  },
  "Star Meadow": {
    names: ["Goldfield", "Sunpatch", "The Orchard"], rgb: "255, 215, 130",
    spots: [3, 0.3, 0.66], r: 0.17, want: 7, buds: 4
  },
  "Neutron Forge": {
    spots: [2, 0.3, 0.55], lmR: 0.08,
    spin: 0.0019,   // v9.3: slower sweep (was 0.0028): calmer bands, easier to ride
    pulsars: [
      { name: "The Lighthouse", color: "#e0e8ff", rgb: "200, 190, 255" },
      { name: "Ember Pulsar", color: "#ffd2b0", rgb: "255, 190, 140" }
    ]
  }
};
