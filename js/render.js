import { blurFor } from "./depth.js";
import { drawShip } from "./ships.js";
// ─── RENDER ENGINE ───
// All canvas drawing. Starfield, nebula, entities, black hole, effects, boundary.

import { spriteFor, tailFor, heatFor, drawBlackHoleArt, getArtQuality } from "./art.js";
const hypot = (x, y) => Math.sqrt(x * x + y * y);   // 2-arg Math.hypot without the varargs cost

const TAU = Math.PI * 2;

// "Too big to eat" ring colour: soft rose by default, warm amber in the soft palette
let TOO_BIG_RGB = "240, 130, 140", TOO_BIG_DOT = "rgba(240, 130, 140, 0.8)";
// v6 big-catch halo: warm gold; starts once you're 82% of the way to its size
const HALO_RGB = "255, 214, 140";
let BIG_HALO_FROM = 0.82;
export function setHaloFrom(v) { BIG_HALO_FROM = v; }
export function setSoftPalette(on) {
  TOO_BIG_RGB = on ? "235, 185, 110" : "240, 130, 140";
  TOO_BIG_DOT = `rgba(${TOO_BIG_RGB}, 0.8)`;
}

// ─── GALAXY BOUNDARY ───

// ─── ENTITIES ───

// w/h are the zoomed (world-unit) viewport; the caller applies ctx.scale(zoom).
// v4: painted sprites from art.js (cached by type/variant/size), soft tails.
const ROTATES = { junk: true, meteor: true, craft: true };

export function drawEntities(ctx, entities, w, h, camX, camY, playerRadius, time, eatRatio = 0.88, zoom = 1, dpr = 1, breath = 0.5, hx = w / 2, hy = h / 2, still = false) {
  const pxScale = zoom * dpr;
  const twinkle = 0.9 + breath * 0.1;

  for (const e of entities) {
    const sx = e.x - camX + w / 2;
    const sy = e.y - camY + h / 2;

    // Culling (margin covers coronas and comet tails)
    const margin = e.radius * (e.hasTail ? 9 : 3.2) + 20;
    if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin) continue;

    if (e.powerup) {
      drawPowerupPickup(ctx, e, sx, sy, time, zoom);
      continue;
    }

    const spawnAlpha = e._spawnAlpha ?? 1;
    let alpha = spawnAlpha;
    let r = e.radius;
    // v9: rocks tumble gently (a sway, not a spin) so their light stays upper left
    let rot = ROTATES[e.type] ? (e.type === "craft" ? e.rotation : Math.sin(e.rotation) * 0.35) : 0;
    if (e.consuming) {
      // Spiral down into the hole (v6: big catches stretch and swirl slowly)
      const p = e.consumeProgress;
      if (e.swallow) {
        const q = p * p * (3 - 2 * p);
        alpha *= 1 - q * q;
        r *= 1 - q * 0.92;
        rot += q * Math.PI * 3;
      } else {
        alpha *= 1 - p * p;
        r *= 1 - p;
        rot += p * Math.PI * 2;
      }
    }
    if (alpha <= 0.01 || r <= 0.05) continue;

    const rpx = e.radius * pxScale;

    // Comet tail: one cached tapered gradient, rotated along the velocity
    if (e.hasTail) {
      const t = tailFor(e.color, rpx);
      const speed = hypot(e.vx, e.vy);
      const ang = Math.atan2(-e.vy, -e.vx);
      const len = r * (5 + Math.min(4, speed * 3));
      const hgt = r * 2.4;
      ctx.globalAlpha = alpha * 0.9;
      ctx.translate(sx, sy);
      ctx.rotate(ang + 0.12);
      ctx.drawImage(t.c, 0, -hgt / 2, len, hgt);   // curved dust tail, a little off-axis
      ctx.rotate(-0.12);
      if (e.type === "comet") {
        const it = tailFor(e.color, rpx, true);
        ctx.globalAlpha = alpha * 0.8;
        ctx.drawImage(it.c, 0, -r * 0.6, len * 1.35, r * 1.2);   // straight blue ion tail
      }
      ctx.rotate(-ang);
      ctx.translate(-sx, -sy);
    }

    // v9: a meteor entering hot: a glowing entry streak behind it (cools as it slows)
    let heat = 0, hang = 0;
    if (e.hot && !e.consuming && e.depthT >= 1) {
      const speed = hypot(e.vx, e.vy);
      heat = Math.min(1, speed / (e.baseSpeed || 1) * 0.9) * (still ? 0.6 : 1);
      if (heat > 0.05) {
        const t = tailFor(e.color, rpx, false, true);
        hang = Math.atan2(e.vy, e.vx);
        const len = r * (6 + Math.min(4, speed * 4)), hgt = r * 1.6;
        ctx.globalAlpha = alpha * 0.85 * heat;
        ctx.translate(sx, sy); ctx.rotate(hang + Math.PI);
        ctx.drawImage(t.c, r * 0.2, -hgt / 2, len, hgt);
        ctx.rotate(-hang - Math.PI); ctx.translate(-sx, -sy);
      }
    }

    const sp = spriteFor(e, rpx);
    let d = sp.k * r;
    if (e.depthT < 1) {
      // v8.3: drifting in from a back layer: starts hazy, dim and at its apparent
      // size, then sharpens, brightens and grows into the play layer
      // v9.1: a soft warm arrival rim while mergeGlow is set (calm, no flash)
      const q = e.depthT * e.depthT * (3 - 2 * e.depthT);
      const dd = d * (e.depthK0 + (1 - e.depthK0) * q);
      const bl = blurFor(sp.c, still ? 2 : 3), pd = dd * (1 + 2 * bl._pad);
      if (e.mergeGlow && !still) {
        const ga = (1 - q) * 0.55 + q * 0.2;
        const gr = ctx.createRadialGradient(sx, sy, dd * 0.35, sx, sy, dd * 0.85);
        gr.addColorStop(0, `rgba(255, 220, 160, ${0.18 * ga})`);
        gr.addColorStop(1, `rgba(255, 200, 120, 0)`);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(sx, sy, dd * 0.85, 0, Math.PI * 2);
        ctx.fill();
      }
      const tr = e.type === "craft" ? e.rotation : 0;   // ships keep their heading as they arrive
      ctx.translate(sx, sy); ctx.rotate(tr);
      ctx.globalAlpha = alpha * (0.6 + 0.4 * q) * (1 - q);
      ctx.drawImage(bl, -pd / 2, -pd / 2, pd, pd);
      ctx.globalAlpha = alpha * (0.6 + 0.4 * q) * q;
      ctx.drawImage(sp.c, -dd / 2, -dd / 2, dd, dd);
      ctx.rotate(-tr); ctx.translate(-sx, -sy);
      continue;
    }
    if (e.type === "star" || e.type === "neutron") {
      alpha *= twinkle;
      d *= 0.98 + breath * 0.04;
    }
    ctx.globalAlpha = alpha;
    if (e.type === "craft") {
      // v9.4: ships draw themselves (heading, engine glow, break-apart)
      drawShip(ctx, e, sp, sx, sy, sp.k * e.radius, spawnAlpha, breath, still);
    } else if (e.consuming && e.swallow && !still) {
      // v8.1 spaghettification: a big catch stretches toward the hole and glows as it goes in
      const p = e.consumeProgress, q = p * p * (3 - 2 * p);
      const ang = Math.atan2(hy - sy, hx - sx);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(ang);
      ctx.translate(q * e.radius * 0.8, 0);
      ctx.scale(1 + q * 2.6, Math.max(0.15, 1 - q * 0.7));
      ctx.drawImage(sp.c, -d / 2, -d / 2, d, d);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.sin(p * Math.PI) * 0.5;
      const gs = swallowGlow(), gd = e.radius * 2.6;
      ctx.drawImage(gs, -gd, -gd, gd * 2, gd * 2);
      ctx.restore();
    } else if (rot) {
      ctx.translate(sx, sy);
      ctx.rotate(rot);
      ctx.drawImage(sp.c, -d / 2, -d / 2, d, d);
      ctx.rotate(-rot);
      ctx.translate(-sx, -sy);
    } else {
      ctx.drawImage(sp.c, sx - d / 2, sy - d / 2, d, d);
    }
    if (heat > 0.05) {
      // the heated leading edge faces where it is going
      const hs = heatFor(rpx), hd = hs.k * r;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha * heat * 0.9;
      ctx.translate(sx, sy); ctx.rotate(hang);
      ctx.drawImage(hs.c, -hd / 2, -hd / 2, hd, hd);
      ctx.rotate(-hang); ctx.translate(-sx, -sy);
      ctx.globalCompositeOperation = "source-over";
    }

    // v6 big catches: a soft gold halo as you near something's size, steady once it fits
    const tooBig = playerRadius <= e.radius * eatRatio;
    const nearQ = playerRadius / (e.radius * eatRatio);
    if (e.bigFish && !e.consuming && nearQ > BIG_HALO_FROM) {
      const ready = !tooBig;
      const k = ready ? 1 : (nearQ - BIG_HALO_FROM) / (1 - BIG_HALO_FROM);
      const a = (0.14 + 0.22 * k) * spawnAlpha * (0.85 + breath * 0.15);
      const hr = e.radius * (ready ? 1.65 : 1.35 + 0.25 * k);
      const g = ctx.createRadialGradient(sx, sy, e.radius * 0.85, sx, sy, hr);
      g.addColorStop(0, `rgba(${HALO_RGB}, ${a.toFixed(3)})`);
      g.addColorStop(1, `rgba(${HALO_RGB}, 0)`);
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, hr, 0, TAU);
      ctx.fill();
    }

    if (tooBig && !e.consuming) {
      const pulse = 0.26 + Math.sin(time * 0.0016 + e.rotation * 3) * 0.08;
      ctx.globalAlpha = spawnAlpha;
      ctx.beginPath();
      ctx.arc(sx, sy, e.radius + 3 / zoom, 0, TAU);
      ctx.strokeStyle = `rgba(${TOO_BIG_RGB}, ${pulse})`;
      ctx.lineWidth = 1.8 / zoom;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

let swGlow = null;
function swallowGlow() {
  if (swGlow) return swGlow;
  swGlow = document.createElement("canvas");
  swGlow.width = swGlow.height = 64;
  const g = swGlow.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255, 236, 200, 0.9)");
  gr.addColorStop(0.35, "rgba(255, 190, 140, 0.35)");
  gr.addColorStop(1, "rgba(255, 170, 120, 0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return swGlow;
}

const PU_STYLE = {
  magnet: { rgb: "255, 209, 102", glyph: "M" },
  slow: { rgb: "127, 219, 255", glyph: "S" },
  double: { rgb: "255, 122, 217", glyph: "x2" }
};

function drawPowerupPickup(ctx, e, sx, sy, time, zoom) {
  const st = PU_STYLE[e.powerup] || PU_STYLE.magnet;
  const spawnAlpha = e._spawnAlpha ?? 1;
  let alpha = spawnAlpha;
  // Gently fade during the last 4 seconds (no blinking)
  if (!e.consuming && e.life < 240) alpha *= 0.25 + 0.75 * (e.life / 240);
  let r = e.radius;
  if (e.consuming) {
    alpha *= 1 - e.consumeProgress;
    r *= 1 + e.consumeProgress * 1.5;
  }
  const pulse = 1 + Math.sin(time * 0.006) * 0.12;

  ctx.save();
  ctx.globalAlpha = alpha;
  const glowR = r * 2.6 * pulse;
  const g = ctx.createRadialGradient(sx, sy, r * 0.3, sx, sy, glowR);
  g.addColorStop(0, `rgba(${st.rgb}, 0.55)`);
  g.addColorStop(1, `rgba(${st.rgb}, 0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(sx, sy, glowR, 0, TAU);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, TAU);
  ctx.fillStyle = "rgba(10, 12, 30, 0.85)";
  ctx.fill();
  ctx.lineWidth = Math.max(1.5 / zoom, r * 0.16);
  ctx.strokeStyle = `rgba(${st.rgb}, 0.95)`;
  ctx.stroke();

  // Rotating orbit dashes
  ctx.setLineDash([r * 0.5, r * 0.4]);
  ctx.lineDashOffset = -time * 0.02 * r * 0.1;
  ctx.beginPath();
  ctx.arc(sx, sy, r * 1.45 * pulse, 0, TAU);
  ctx.lineWidth = Math.max(1 / zoom, r * 0.08);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = `rgba(${st.rgb}, 1)`;
  ctx.font = `700 ${Math.round(r * (st.glyph.length > 1 ? 0.9 : 1.15))}px 'Outfit', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(st.glyph, sx, sy + r * 0.05);
  ctx.restore();
}

/** v4: the black hole is painted by art.js (disk, photon ring, lensed arc). */
export function drawBlackHole(ctx, x, y, radius, time, velocity, fx = {}) {
  // v7 hole skins: a gentle colour filter over the painted disk
  if (fx.filter) { ctx.save(); ctx.filter = fx.filter; drawBlackHoleArt(ctx, x, y, radius, time, fx); ctx.restore(); return; }
  drawBlackHoleArt(ctx, x, y, radius, time, fx);
}

// ─── PARTICLES ───
// v4: soft glowing streaks (additive), length follows velocity. Reduce Motion
// draws short soft dots instead.
export function drawParticles(ctx, particles, w, h, camX, camY, opts = {}) {
  const trail = opts.reduceMotion ? 0.6 : (getArtQuality() === "high" ? 6 : 3);
  const glow = getArtQuality() === "high" && !opts.reduceMotion;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (const p of particles) {
    const sx = p.x - camX + w / 2;
    const sy = p.y - camY + h / 2;
    if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;
    const life = 1 - p.age / p.maxAge;
    const ex = sx - p.vx * trail - 0.01, ey = sy - p.vy * trail;
    // v8.1: a gently curved streak (it bends like it's spiralling in), with a soft glow pass on High
    const cx = (sx + ex) / 2 - p.vy * trail * 0.35, cy = (sy + ey) / 2 + p.vx * trail * 0.35;
    const lw = Math.max(0.5, p.size * (0.4 + life * 0.8));
    ctx.strokeStyle = p.color;
    if (glow) {
      ctx.globalAlpha = life * p.alpha * 0.22;
      ctx.lineWidth = lw * 3.2;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cx, cy, ex, ey); ctx.stroke();
    }
    ctx.globalAlpha = life * p.alpha * 0.9;
    ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cx, cy, ex, ey); ctx.stroke();
  }
  ctx.restore();
}

// ─── CONSUME RIPPLE ───

export function drawRipples(ctx, ripples, w, h, camX, camY, zoom = 1) {
  for (const r of ripples) {
    const sx = r.x - camX + w / 2;
    const sy = r.y - camY + h / 2;
    const progress = r.age / r.maxAge;
    const radius = r.startRadius + progress * r.expandTo;
    const alpha = (1 - progress) * 0.3;

    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, TAU);
    ctx.strokeStyle = r.color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = (1.5 / zoom) * (1 - progress);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ─── MINIMAP ───

/**
 * v5 local radar: centred on you, shows what's around (about 2.6 view-widths),
 * a faint frame for what's on screen, and a fading trail of where you've been.
 * overlay(ctx, originX, originY, scale) draws landmarks in world coordinates.
 */
const TRAIL_STYLES = new Map();
function trailStyle(a) {
  const k = a.toFixed(3);
  let v = TRAIL_STYLES.get(k);
  if (!v) TRAIL_STYLES.set(k, v = `rgba(150, 155, 255, ${k})`);
  return v;
}
export function drawMinimap(ctx, w, h, playerX, playerY, entities, range, playerRadius = 0, eatRatio = 0.88, overlay = null, extra = {}) {
  const mapSize = 96;
  const r = mapSize / 2;
  const cx = w - r - 16;
  const cy = h - r - 16;
  const scale = r / range;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fillStyle = "rgba(4, 6, 16, 0.7)";
  ctx.fill();
  ctx.strokeStyle = "rgba(110, 114, 255, 0.16)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.clip();

  // Soft range rings
  ctx.strokeStyle = "rgba(110, 114, 255, 0.07)";
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.33, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.66, 0, TAU); ctx.stroke();

  // What's on screen
  if (extra.viewW) {
    const vw = extra.viewW * scale, vh = extra.viewH * scale;
    ctx.strokeStyle = "rgba(200, 205, 255, 0.10)";
    ctx.strokeRect(cx - vw / 2, cy - vh / 2, vw, vh);
  }

  const ox = cx - playerX * scale, oy = cy - playerY * scale;
  if (overlay) overlay(ctx, ox, oy, scale, { cx, cy, r });

  // Trail of where you've been (oldest faintest)
  const trail = extra.trail;
  if (trail && trail.length > 1) {
    ctx.lineWidth = 1.2;
    ctx.lineCap = "round";
    for (let i = 1; i < trail.length; i++) {
      const a = i / trail.length;
      ctx.strokeStyle = trailStyle(a * 0.4);
      ctx.beginPath();
      ctx.moveTo(ox + trail[i - 1].x * scale, oy + trail[i - 1].y * scale);
      ctx.lineTo(ox + trail[i].x * scale, oy + trail[i].y * scale);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(ox + trail[trail.length - 1].x * scale, oy + trail[trail.length - 1].y * scale);
    ctx.lineTo(cx, cy);
    ctx.stroke();
  }

  for (const e of entities) {
    const ex = ox + e.x * scale;
    const ey = oy + e.y * scale;
    if ((ex - cx) * (ex - cx) + (ey - cy) * (ey - cy) > r * r) continue;
    if (e.powerup) {
      ctx.fillStyle = e.color;
      ctx.fillRect(ex - 1.5, ey - 1.5, 3, 3);
    } else if (playerRadius <= e.radius * eatRatio) {
      ctx.fillStyle = TOO_BIG_DOT;
      const s2 = Math.min(4, 1.5 + e.radius * scale);
      ctx.fillRect(ex - s2 / 2, ey - s2 / 2, s2, s2);
    } else {
      ctx.fillStyle = e._mc || e.color + "88";
      ctx.fillRect(ex - 0.5, ey - 0.5, 1.5, 1.5);
    }
  }

  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, TAU);
  ctx.fillStyle = "#8a8dff";
  ctx.fill();
  ctx.restore();
}

// ─── EDGE INDICATORS ───
// Arrows at screen edges pointing toward off-screen objects
// Uses math instead of save/translate/rotate/restore

// Screen-space. Shows the nearest few off-screen edible objects, plus power-ups.
// Nearest 6 kept by insertion into fixed slots (no per-frame arrays or sort).
// Ties keep first-seen order, same as the old stable sort.
const EDGE_N = 6, edgeE = new Array(EDGE_N), edgeD = new Float64Array(EDGE_N), edgeSX = new Float64Array(EDGE_N), edgeSY = new Float64Array(EDGE_N);
export function drawEdgeIndicators(ctx, entities, w, h, camX, camY, playerRadius, zoom = 1, eatRatio = 0.88) {
  const margin = 20;
  let n = 0;
  for (const e of entities) {
    if (e.consuming) continue;
    const sx = (e.x - camX) * zoom + w / 2;
    const sy = (e.y - camY) * zoom + h / 2;
    if (sx > -10 && sx < w + 10 && sy > -10 && sy < h + 10) continue;
    if (!e.powerup && playerRadius <= e.radius * eatRatio) continue;
    const d = e.powerup ? -1 : hypot(sx - w / 2, sy - h / 2);
    if (n === EDGE_N && d >= edgeD[EDGE_N - 1]) continue;
    let j = n < EDGE_N ? n++ : EDGE_N - 1;
    while (j > 0 && edgeD[j - 1] > d) { edgeE[j] = edgeE[j - 1]; edgeD[j] = edgeD[j - 1]; edgeSX[j] = edgeSX[j - 1]; edgeSY[j] = edgeSY[j - 1]; j--; }
    edgeE[j] = e; edgeD[j] = d; edgeSX[j] = sx; edgeSY[j] = sy;
  }

  for (let i = 0; i < n; i++) {
    const e = edgeE[i], sx = edgeSX[i], sy = edgeSY[i];
    edgeE[i] = null;
    const arrowSize = e.powerup ? 8 : 5;
    const angle = Math.atan2(sy - h / 2, sx - w / 2);
    const edgeX = w / 2 + Math.cos(angle) * (w / 2 - margin);
    const edgeY = h / 2 + Math.sin(angle) * (h / 2 - margin);
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(edgeX + cosA * arrowSize, edgeY + sinA * arrowSize);
    ctx.lineTo(edgeX - cosA * arrowSize - sinA * arrowSize * 0.6, edgeY - sinA * arrowSize + cosA * arrowSize * 0.6);
    ctx.lineTo(edgeX - cosA * arrowSize + sinA * arrowSize * 0.6, edgeY - sinA * arrowSize - cosA * arrowSize * 0.6);
    ctx.closePath();
    ctx.fillStyle = e.powerup ? e.color : e._ec || e.color + "55";
    ctx.fill();
  }
}

// ─── CURSOR ───

export function drawCursor(ctx, mouseX, mouseY, w, h) {
  if (mouseX < 0 || mouseX > w || mouseY < 0 || mouseY > h) return;

  const size = 10;
  ctx.strokeStyle = "rgba(200, 210, 255, 0.3)";
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(mouseX - size, mouseY);
  ctx.lineTo(mouseX + size, mouseY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(mouseX, mouseY - size);
  ctx.lineTo(mouseX, mouseY + size);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(mouseX, mouseY, 2, 0, TAU);
  ctx.fillStyle = "rgba(200, 210, 255, 0.4)";
  ctx.fill();
}
