// Meteor entry streaks only. Comet bodies and comet tails are painted
// pictures on Comet and CometTail. This file does not paint a comet.

import { TAU } from "./kit.js";
import { artCache, bucketFor } from "./quality.js";

const tailCache = artCache();

/** Hot-meteor entry streak. Comet dust and ion tails are gone. */
export function tailFor(color, rpx, ion, hot) {
  if (!hot) return null;
  const b = bucketFor(rpx);
  let byB = tailCache.get(color);
  if (!byB) { byB = {}; tailCache.set(color, byB); }
  const slot = b + 1000;
  let t = byB[slot];
  if (t) return t;
  t = entryStreak(b);
  byB[slot] = t;
  if (tailCache.size > 40) tailCache.delete(tailCache.keys().next().value);
  return t;
}

function entryStreak(b) {
  const len = Math.ceil(b * 10), hgt = Math.ceil(b * 1.6);
  const c = document.createElement("canvas");
  c.width = len; c.height = hgt;
  const g = c.getContext("2d");
  const cy = hgt / 2;
  const lg = g.createLinearGradient(0, 0, len, 0);
  lg.addColorStop(0, "rgba(255, 226, 170, 0.75)");
  lg.addColorStop(0.18, "rgba(255, 160, 90, 0.45)");
  lg.addColorStop(0.6, "rgba(200, 90, 70, 0.12)");
  lg.addColorStop(1, "rgba(160, 70, 80, 0)");
  g.fillStyle = lg;
  if ("filter" in g) g.filter = "blur(" + Math.max(0.5, b * 0.12).toFixed(1) + "px)";
  g.beginPath();
  g.moveTo(0, cy - b * 0.5);
  g.quadraticCurveTo(len * 0.25, cy - b * 0.12, len, cy);
  g.quadraticCurveTo(len * 0.25, cy + b * 0.12, 0, cy + b * 0.5);
  g.fill();
  const ig = g.createLinearGradient(0, 0, len * 0.5, 0);
  ig.addColorStop(0, "rgba(255, 250, 230, 0.6)");
  ig.addColorStop(1, "rgba(255, 250, 230, 0)");
  g.fillStyle = ig;
  g.beginPath();
  g.ellipse(0, cy, len * 0.4, b * 0.14, 0, 0, TAU);
  g.fill();
  g.filter = "none";
  return { c, k: b };
}
