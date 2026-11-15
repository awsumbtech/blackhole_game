// ─── SHIPS (v9.8) ───
// Identity only. Which class a craft is, which look it keeps, and whether it
// steers or tumbles. Drawing lives on Ship: a sheet frame, never a painter.
// setShipLight stays so the flagship and the galaxy can still name the rim
// colour. It does not tint a ship; the painted frame already has its colour.

export const SHIP_CLASSES = ["drone", "shuttle", "freighter", "cruiser", "capital"];
const EXTENT = { drone: 1.45, shuttle: 1.45, freighter: 1.5, cruiser: 1.5, capital: 1.55, scrap: 1.2 };
export const shipExtent = cls => EXTENT[cls] || 1.45;
export const SHIP_LOOKS = 8;

/** Class for a tier (big = a "bigger fish" / hull, one class up). */
export function shipClassFor(tier, big = false, roll = Math.random()) {
  const t = tier | 0;
  let i = t <= 2 ? (roll < 0.6 ? 0 : 1) : t === 3 ? (roll < 0.55 ? 1 : 2) : t <= 5 ? (roll < 0.6 ? 2 : 3) : t <= 7 ? 3 : 4;
  if (big) i = Math.min(4, i + 1);
  return SHIP_CLASSES[i];
}

/**
 * Give a freshly made craft entity its ship identity. Wrecks (Armada, derelict
 * flotillas) tumble slowly; living ships steer nose-first along their path.
 * The look is chosen once, here, and kept. Ship reads that same number as a row.
 */
export function adoptShip(e, tier, wreck, big = false) {
  e.ship = shipClassFor(tier, big);
  e.look = (Math.random() * SHIP_LOOKS) | 0;
  setWreck(e, wreck);
}
export function setWreck(e, wreck) {
  e.wreck = !!wreck;
  e.steer = !wreck;
  e.rotSpeed = wreck ? (Math.random() - 0.5) * 0.0024 : 0;
  if (!wreck) e.rotation = Math.atan2(e.vy, e.vx);
  e._artBase = null; e._sp = null;
}
export function upgradeShip(e) {
  const i = SHIP_CLASSES.indexOf(e.ship);
  if (i >= 0 && i < 4) { e.ship = SHIP_CLASSES[i + 1]; e._artBase = null; e._sp = null; }
}

/**
 * A crumb torn off `parent`. Class and look come from that hull. The plate
 * is the crumb's index, so three crumbs off one hull are three different
 * plates and the same hull always gives the same ones.
 */
export function scrapFrom(parent, index) {
  const cls = SHIP_CLASSES.includes(parent.ship)
    ? parent.ship
    : SHIP_CLASSES[((parent.seed | 0) >>> 0) % SHIP_CLASSES.length];
  const lookSrc = parent.look >= 0 ? parent.look : ((parent.seed | 0) >>> 3);
  const look = ((lookSrc % SHIP_LOOKS) + SHIP_LOOKS) % SHIP_LOOKS;
  const plate = ((index % 4) + 4) % 4;
  return { cls, look, plate };
}

// Galaxy light. Kept for the flagship and for callers that still ask.
// Ship art is already painted, so this colour never recolours a hull.
let bounce = [150, 170, 220], lightKey = "";
export function setShipLight(rgb, key) { bounce = rgb.slice(0, 3); lightKey = key || ""; }
export function shipLight() { return { rgb: bounce, key: lightKey }; }
export function shipKey(e) { return `craft|${e.ship || "drone"}|${e.wreck ? 1 : 0}|${lightKey}`; }
