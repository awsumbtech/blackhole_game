// ─── ART (v4) ───
// Soft, painterly procedural art. Every object is painted once into a small
// cached canvas keyed by type / colour / variant / on-screen size, then just
// stamped each frame. Nothing here runs per-frame except cache lookups.
// v9.6.1: split by kind of space object under js/art/; this file is the public API.
//   quality.js  quality + size buckets + cache registry
//   kit.js      colour, path and shading helpers
//   sprites.js  sprite cache, looks, painter table
//   dust / rocks / comets / planets / stars / deepsky.js  one painter set each
//   hole.js     the player's hole (disk, ring, arc, reveal fx); rival.js  rival holes

export { setArtQuality, getArtQuality } from "./art/quality.js";
export { rng } from "./art/kit.js";
export { lookOf, spriteFor, beginArtFrame, artStats } from "./art/sprites.js";
export { heatFor } from "./art/rocks.js";
export { tailFor } from "./art/comets.js";
export { drawBlackHoleArt, drawRevealFx, warmHole } from "./art/hole.js";
export { rivalSprite } from "./art/rival.js";
