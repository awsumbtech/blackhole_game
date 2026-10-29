// ─── SKY (v8.1) ───
// One big painted nebula per biome, so every galaxy has its own look at a
// glance: soft reef banks, icy currents, nursery pillars, armada smoke, the
// rift, the golden meadow and the forge's shock shells. Painted once per
// biome + screen size into a half-res canvas, then stamped (opaque, so it
// also replaces the old background fill) with a slow parallax drift.

const TAU = Math.PI * 2;
let can = null, key = "", style = "reef", pal = [[110, 140, 210], [90, 170, 200], [150, 120, 220]], deepTint = "#0d1633";
const STYLES = { "Debris Reef": "reef", "Comet Current": "current", "Planet Nursery": "nursery", "Ruined Armada": "armada", "Void Rift": "void", "Star Meadow": "meadow", "Neutron Forge": "forge" };

export function setSky(name, palette, tint) {
  style = STYLES[name] || "reef";
  if (palette && palette.length >= 3) pal = palette;
  if (tint) deepTint = tint;
  key = "";
}

function srng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rgba = (c, a) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
function hexRGB(h) { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }

function puff(g, x, y, r, c, a) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(c, a));
  gr.addColorStop(0.45, rgba(c, a * 0.45));
  gr.addColorStop(1, rgba(c, 0));
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}
function cloudBank(g, r, cx, cy, sx, sy, n, cols, a, size) {
  for (let i = 0; i < n; i++) {
    const x = cx + (r() - 0.5) * sx, y = cy + (r() - 0.5) * sy;
    puff(g, x, y, size * (0.4 + r() * 0.9), cols[Math.floor(r() * cols.length)], a * (0.5 + r() * 0.7));
  }
}
function dustLane(g, x, y, len, wid, ang, a) {
  g.save();
  g.translate(x, y); g.rotate(ang); g.scale(1, wid / len);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, len);
  gr.addColorStop(0, `rgba(2, 3, 8, ${a})`);
  gr.addColorStop(1, "rgba(2, 3, 8, 0)");
  g.fillStyle = gr;
  g.fillRect(-len, -len, len * 2, len * 2);
  g.restore();
}
function farGalaxy(g, r, x, y, s, c) {
  g.save(); g.translate(x, y); g.rotate(r() * TAU); g.scale(1, 0.35 + r() * 0.4);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, s);
  // v9: a faint, distant smudge (no bright eye-like core or arcs: never mistaken for food)
  gr.addColorStop(0, "rgba(255, 246, 228, 0.32)");
  gr.addColorStop(0.25, rgba(c, 0.16));
  gr.addColorStop(1, rgba(c, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, s, 0, TAU); g.fill();
  g.restore();
}
function stars(g, r, W, H, n, bright) {
  const cols = [[255, 255, 255], [200, 220, 255], [255, 236, 200], [255, 210, 170]];
  for (let i = 0; i < n; i++) {
    const c = cols[Math.floor(r() * 4)], s = r() < 0.08 ? 1.4 : 0.7;
    g.fillStyle = rgba(c, (0.25 + r() * 0.6) * bright);
    g.fillRect(r() * W, r() * H, s, s);
  }
}

function paint(W, H, high) {
  const g = can.getContext("2d");
  const r = srng(style.length * 977 + pal[0][0] * 31 + pal[1][1]);
  const P = pal, m = Math.min(W, H), soft = high ? 1 : 0.7;
  const t = hexRGB(deepTint);
  // deep base: darker version of the biome tint, a little lighter toward the middle
  g.fillStyle = "#04060c"; g.fillRect(0, 0, W, H);
  const bg = g.createRadialGradient(W / 2, H * 0.48, 0, W / 2, H / 2, Math.max(W, H) * 0.75);
  bg.addColorStop(0, rgba(t, 0.95)); bg.addColorStop(0.6, rgba(t, 0.45)); bg.addColorStop(1, rgba(t, 0.1));
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = 0.85;
  const blur = "filter" in g;
  if (blur) g.filter = `blur(${Math.max(1, m * 0.012).toFixed(1)}px)`;
  const n = high ? 1 : 0.6;
  switch (style) {
    case "reef": {
      cloudBank(g, r, W * 0.3, H * 0.75, W * 0.9, H * 0.45, 40 * n, [P[0], P[2]], 0.12, m * 0.35);
      cloudBank(g, r, W * 0.8, H * 0.2, W * 0.6, H * 0.35, 24 * n, [P[1], P[0]], 0.1, m * 0.3);
      break;
    }
    case "current": {
      // v9.3: calm icy sky. Soft cloud banks and three broad, barely-there
      // lanes (was 60 bright bands that read as distracting waves).
      cloudBank(g, r, W * 0.5, H * 0.5, W * 1.1, H * 1.1, 30 * n, [P[1], P[0], P[2]], 0.08, m * 0.4);
      g.lineCap = "round";
      for (let i = 0; i < 3; i++) {
        const y0 = H * (0.25 + i * 0.3) + (r() - 0.5) * H * 0.1;
        g.strokeStyle = rgba(P[i % 3], 0.025); g.lineWidth = m * 0.28;
        g.beginPath(); g.moveTo(-W * 0.2, y0 + H * 0.12); g.bezierCurveTo(W * 0.3, y0, W * 0.7, y0 + H * 0.04, W * 1.2, y0 - H * 0.12); g.stroke();
      }
      break;
    }
    case "nursery": {
      cloudBank(g, r, W * 0.5, H * 0.45, W * 1.1, H * 0.9, 46 * n, [P[0], P[1], P[2]], 0.1, m * 0.35);
      puff(g, W * 0.62, H * 0.3, m * 0.5, [255, 240, 200], 0.14);
      break;
    }
    case "armada": {
      cloudBank(g, r, W * 0.5, H * 0.5, W * 1.2, H * 1.1, 50 * n, [P[0], P[2]], 0.09, m * 0.4);
      cloudBank(g, r, W * 0.25, H * 0.3, W * 0.5, H * 0.4, 16 * n, [P[1]], 0.1, m * 0.25);
      break;
    }
    case "void": {
      cloudBank(g, r, W * 0.5, H * 0.5, W * 1.2, H * 1.2, 22 * n, [P[0], P[2]], 0.06, m * 0.45);
      // the rift: a long glowing cleft across the sky
      g.save(); g.translate(W * 0.5, H * 0.5); g.rotate(-1.05);
      for (let i = 0; i < 26 * n; i++) {
        const x = (r() - 0.5) * Math.max(W, H) * 1.4, y = (r() - 0.5) * m * 0.12;
        puff(g, x, y, m * (0.08 + r() * 0.16), i % 2 ? P[1] : P[0], 0.16);
      }
      g.restore();
      break;
    }
    case "meadow": {
      cloudBank(g, r, W * 0.5, H * 0.55, W * 1.2, H, 44 * n, [P[0], P[1], P[2]], 0.1, m * 0.35);
      break;
    }
    case "forge": {
      cloudBank(g, r, W * 0.5, H * 0.5, W * 1.1, H * 1.1, 26 * n, [P[1], P[0]], 0.07, m * 0.35);
      const cx = W * 0.72, cy = H * 0.22;
      for (let i = 0; i < 9 * n; i++) {
        const rr = m * (0.25 + i * 0.12), a0 = r() * TAU;
        g.strokeStyle = rgba(P[i % 2], 0.08); g.lineWidth = m * (0.01 + r() * 0.025);   // v9.3: quieter shells (was 0.14)
        g.beginPath(); g.arc(cx, cy, rr, a0, a0 + 1.2 + r() * 2); g.stroke();
      }
      puff(g, cx, cy, m * 0.3, [255, 220, 200], 0.16);
      break;
    }
  }
  g.filter = "none";
  g.globalAlpha = 1;
  // dust lanes cut through every sky (no mud: they only darken, never tint)
  g.globalCompositeOperation = "source-over";
  if (blur) g.filter = `blur(${Math.max(1, m * 0.02).toFixed(1)}px)`;
  const lanes = style === "armada" ? 8 : style === "nursery" ? 6 : 4;
  for (let i = 0; i < lanes * n; i++) dustLane(g, r() * W, r() * H, m * (0.25 + r() * 0.4), m * (0.03 + r() * 0.05), r() * TAU, 0.45);
  if (style === "nursery") {
    // pillars of dust with glowing rims
    for (let i = 0; i < 3; i++) {
      const x = W * (0.2 + i * 0.28 + (r() - 0.5) * 0.08), w0 = m * (0.07 + r() * 0.05), top = H * (0.35 + r() * 0.25);
      g.fillStyle = "rgba(3, 6, 6, 0.7)";
      g.beginPath(); g.moveTo(x - w0, H * 1.05); g.quadraticCurveTo(x - w0 * 0.6, top + (H - top) * 0.4, x, top); g.quadraticCurveTo(x + w0 * 0.6, top + (H - top) * 0.4, x + w0, H * 1.05); g.fill();
      g.globalCompositeOperation = "lighter";
      puff(g, x, top, w0 * 1.4, [255, 236, 190], 0.2);
      g.globalCompositeOperation = "source-over";
    }
  }
  g.filter = "none";
  // distant galaxies and stars
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < (high ? 6 : 3); i++) farGalaxy(g, r, r() * W, r() * H, m * (0.01 + r() * 0.018), P[i % 3]);
  stars(g, r, W, H, (style === "meadow" ? 900 : 260) * soft * (W * H) / (400 * 900), style === "meadow" ? 1 : 0.8);
  g.globalCompositeOperation = "source-over";
}

function tri(x) { const f = x - Math.floor(x / 2) * 2; return Math.abs(f - 1) * 2 - 1; }

/** Draws the opaque painted sky. w/h are the CSS-px viewport. */
export function drawSky(ctx, w, h, camX, camY, high) {
  const sc = high ? 0.6 : 0.42, OV = 1.16;
  const W = Math.ceil(w * OV * sc), H = Math.ceil(h * OV * sc);
  const k = style + W + "x" + H;
  if (k !== key) {
    if (!can) can = document.createElement("canvas");
    can.width = W; can.height = H;
    paint(W, H, high);
    key = k;
  }
  const ex = w * (OV - 1) / 2, ey = h * (OV - 1) / 2;
  const ox = tri(camX * 0.00004) * ex, oy = tri(camY * 0.00004) * ey;
  ctx.drawImage(can, -ex + ox, -ey + oy, w * OV, h * OV);
}
