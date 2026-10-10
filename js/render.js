// ─── RENDER ENGINE ───
// All canvas drawing. Starfield, nebula, entities, black hole, effects, boundary.

import { spriteFor, tailFor, drawBlackHoleArt, getArtQuality } from "./art.js";

const TAU = Math.PI * 2;

// "Too big to eat" ring colour: soft rose by default, warm amber in the soft palette
let TOO_BIG_RGB = "240, 130, 140";
export function setSoftPalette(on) {
  TOO_BIG_RGB = on ? "235, 185, 110" : "240, 130, 140";
}

// ─── STARFIELD OFFSCREEN CACHE ───

let starCanvas = null;
let starCtx = null;
let nebulaCanvas = null;
let nebulaCtx = null;
let starCachedCamX = null;
let starCachedCamY = null;
let starCachedW = 0;
let starCachedH = 0;
const STAR_BUFFER = 200; // px buffer around viewport
const STAR_REDRAW_THRESHOLD = 150; // redraw when camera drifts this far

let nebulaCachedCamX = null;
let nebulaCachedCamY = null;

function ensureStarCanvases(w, h) {
  const bw = w + STAR_BUFFER * 2;
  const bh = h + STAR_BUFFER * 2;
  if (starCanvas && starCachedW === w && starCachedH === h) return;

  starCanvas = document.createElement("canvas");
  starCanvas.width = bw;
  starCanvas.height = bh;
  starCtx = starCanvas.getContext("2d");

  nebulaCanvas = document.createElement("canvas");
  nebulaCanvas.width = bw;
  nebulaCanvas.height = bh;
  nebulaCtx = nebulaCanvas.getContext("2d");

  starCachedW = w;
  starCachedH = h;
  // Force redraw
  starCachedCamX = null;
  nebulaCachedCamX = null;
}

function renderStarsToCache(w, h, camX, camY) {
  const bw = w + STAR_BUFFER * 2;
  const bh = h + STAR_BUFFER * 2;
  const offX = -STAR_BUFFER;
  const offY = -STAR_BUFFER;

  starCtx.clearRect(0, 0, bw, bh);

  const cell = 80;
  const baseX = Math.floor((camX - w / 2 + offX) / cell) - 1;
  const baseY = Math.floor((camY - h / 2 + offY) / cell) - 1;
  const cols = Math.ceil(bw / cell) + 3;
  const rows = Math.ceil(bh / cell) + 3;

  for (let gx = 0; gx < cols; gx++) {
    for (let gy = 0; gy < rows; gy++) {
      const wx = baseX + gx;
      const wy = baseY + gy;
      const hash = Math.abs((wx * 73856093) ^ (wy * 19349663)) % 1000;

      if (hash < 180) {
        const px = (wx * cell - camX) + w / 2 - offX + (hash % 11) * 5;
        const py = (wy * cell - camY) + h / 2 - offY + (hash % 7) * 6;
        const brightness = 0.15 + (hash % 50) / 100;
        const size = hash % 17 === 0 ? 2 : 1;

        if (hash % 23 === 0) {
          starCtx.fillStyle = `rgba(140, 200, 255, ${brightness})`;
        } else if (hash % 31 === 0) {
          starCtx.fillStyle = `rgba(255, 220, 140, ${brightness * 0.8})`;
        } else {
          starCtx.fillStyle = `rgba(200, 210, 240, ${brightness * 0.6})`;
        }
        starCtx.fillRect(px, py, size, size);
      }
    }
  }

  starCachedCamX = camX;
  starCachedCamY = camY;
}

function renderNebulaToCache(w, h, camX, camY) {
  const bw = w + STAR_BUFFER * 2;
  const bh = h + STAR_BUFFER * 2;
  const offX = -STAR_BUFFER;
  const offY = -STAR_BUFFER;

  nebulaCtx.clearRect(0, 0, bw, bh);
  const slowCamX = camX * 0.3;
  const slowCamY = camY * 0.3;

  // v4: two soft layers, big slow clouds and smaller wisps, in biome colours
  const layers = [
    { cell: 340, chance: 330, rMin: 170, rMax: 420, aMin: 0.03, aMax: 0.06, salt: 48611 },
    { cell: 200, chance: 60, rMin: 40, rMax: 110, aMin: 0.025, aMax: 0.05, salt: 7919 }
  ];
  for (const L of layers) {
    const bx = Math.floor((slowCamX - w / 2 + offX) / L.cell) - 2;
    const by = Math.floor((slowCamY - h / 2 + offY) / L.cell) - 2;
    const cols = Math.ceil(bw / L.cell) + 5;
    const rows = Math.ceil(bh / L.cell) + 5;
    for (let gx = 0; gx < cols; gx++) {
      for (let gy = 0; gy < rows; gy++) {
        const wx = bx + gx, wy = by + gy;
        const hash = Math.abs((wx * L.salt) ^ (wy * 96769)) % 1000;
        if (hash >= L.chance) continue;
        const px = (wx * L.cell - slowCamX) + w / 2 - offX + (hash % 13) * 9;
        const py = (wy * L.cell - slowCamY) + h / 2 - offY + (hash % 9) * 11;
        const rad = L.rMin + ((hash * 7) % 100) / 100 * (L.rMax - L.rMin);
        const a = L.aMin + ((hash * 13) % 100) / 100 * (L.aMax - L.aMin);
        const c = NEBULA[hash % 3];
        const ng = nebulaCtx.createRadialGradient(px, py, 0, px, py, rad);
        ng.addColorStop(0, `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`);
        ng.addColorStop(0.5, `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a * 0.45})`);
        ng.addColorStop(1, `rgba(${c[0]}, ${c[1]}, ${c[2]}, 0)`);
        nebulaCtx.fillStyle = ng;
        nebulaCtx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
      }
    }
  }

  nebulaCachedCamX = camX;
  nebulaCachedCamY = camY;
}

// ─── GRAVITATIONAL LENSING ───
// Cheap approximation: stars just around the hole are re-drawn from the star
// cache, magnified more the closer they are (three rings), and blended in
// with a soft mask. One small offscreen canvas, a few drawImage calls.
let lensCanvas = null, lensCtx = null;
let lastStarDX = 0, lastStarDY = 0;

export function drawLens(ctx, cx, cy, rScreen) {
  if (!starCanvas || rScreen < 4) return;
  const ext = 3.2;
  const L = Math.ceil(rScreen * ext * 2);
  if (L > 900) return;
  if (!lensCanvas || lensCanvas.width < L) {
    lensCanvas = document.createElement("canvas");
    lensCanvas.width = lensCanvas.height = Math.max(L, 64);
    lensCtx = lensCanvas.getContext("2d");
  }
  const g = lensCtx;
  const half = L / 2;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "source-over";
  g.clearRect(0, 0, L, L);
  g.fillStyle = "#04060c";
  g.fillRect(0, 0, L, L);
  // Star cache pixel that sits under the hole centre
  const srcX = cx - lastStarDX + STAR_BUFFER;
  const srcY = cy - lastStarDY + STAR_BUFFER;
  const rings = [[1.0, 1.55, 2.1], [1.55, 2.25, 1.5], [2.25, ext, 1.18]];
  for (const [r0, r1, mag] of rings) {
    g.save();
    g.beginPath();
    g.arc(half, half, rScreen * r1, 0, TAU);
    g.arc(half, half, rScreen * r0, TAU, 0, true);
    g.clip();
    g.translate(half, half);
    g.scale(mag, mag);
    g.drawImage(starCanvas, -srcX, -srcY);
    g.restore();
  }
  g.globalCompositeOperation = "destination-in";
  const m = g.createRadialGradient(half, half, rScreen * 0.95, half, half, rScreen * ext);
  m.addColorStop(0, "rgba(0, 0, 0, 0)");
  m.addColorStop(0.08, "rgba(0, 0, 0, 0.85)");
  m.addColorStop(0.45, "rgba(0, 0, 0, 0.4)");
  m.addColorStop(1, "rgba(0, 0, 0, 0)");
  g.fillStyle = m;
  g.fillRect(0, 0, L, L);
  g.globalCompositeOperation = "source-over";
  ctx.drawImage(lensCanvas, 0, 0, L, L, cx - half, cy - half, L, L);
}

// Biome nebula palette (three RGB triples)
let NEBULA = [[100, 120, 255], [255, 140, 200], [140, 255, 200]];
export function setNebulaPalette(p) {
  if (p && p.length >= 3) NEBULA = p;
  nebulaCachedCamX = null;
}

export function invalidateStarfield() {
  starCachedCamX = null;
  nebulaCachedCamX = null;
}

export function drawStarfield(ctx, w, h, camX, camY, tint, breath = 0.5) {
  // Dark background
  ctx.fillStyle = "#04060c";
  ctx.fillRect(0, 0, w, h);

  // Biome tint glow in center (cheap — one gradient, drawn every frame)
  // Breathing: the biome glow swells and settles on a slow 10s cycle
  const grad = ctx.createRadialGradient(w / 2, h / 2, 60, w / 2, h / 2, Math.max(w, h) * (0.55 + breath * 0.08));
  const a = Math.round(0x70 + breath * 0x30).toString(16).padStart(2, "0");
  grad.addColorStop(0, tint + a);
  grad.addColorStop(1, "#00000000");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Ensure offscreen canvases
  ensureStarCanvases(w, h);

  // Stars: redraw to cache if camera drifted too far
  if (
    starCachedCamX === null ||
    Math.abs(camX - starCachedCamX) > STAR_REDRAW_THRESHOLD ||
    Math.abs(camY - starCachedCamY) > STAR_REDRAW_THRESHOLD
  ) {
    renderStarsToCache(w, h, camX, camY);
  }

  // Blit stars with offset
  const sdx = (starCachedCamX - camX);
  const sdy = (starCachedCamY - camY);
  lastStarDX = sdx;
  lastStarDY = sdy;
  ctx.drawImage(starCanvas, sdx - STAR_BUFFER, sdy - STAR_BUFFER);

  // Nebula: parallax moves slower, so threshold can be higher
  const nebulaThreshold = STAR_REDRAW_THRESHOLD / 0.3; // ~500px world movement
  if (
    nebulaCachedCamX === null ||
    Math.abs(camX - nebulaCachedCamX) > nebulaThreshold ||
    Math.abs(camY - nebulaCachedCamY) > nebulaThreshold
  ) {
    renderNebulaToCache(w, h, camX, camY);
  }

  // Nebula cache was rendered relative to nebulaCachedCamX at 0.3x parallax
  const nebShiftX = -(camX - nebulaCachedCamX) * 0.3;
  const nebShiftY = -(camY - nebulaCachedCamY) * 0.3;
  ctx.drawImage(nebulaCanvas, nebShiftX - STAR_BUFFER, nebShiftY - STAR_BUFFER);
}

// ─── GALAXY BOUNDARY ───

export function drawBoundary(ctx, w, h, camX, camY, bounds, borderColor, time, zoom = 1) {
  const cx = w / 2 - camX;
  const cy = h / 2 - camY;

  // Soft glow ring
  const pulse = 1 + Math.sin(time * 0.001) * 0.08;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, bounds * pulse, 0, TAU);
  ctx.strokeStyle = borderColor + "18";
  ctx.lineWidth = 40 / zoom;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, bounds, 0, TAU);
  ctx.strokeStyle = borderColor + "60";
  ctx.lineWidth = 2 / zoom;
  ctx.stroke();

  // Dashed inner warning ring
  ctx.setLineDash([8 / zoom, 16 / zoom]);
  ctx.beginPath();
  ctx.arc(cx, cy, bounds - 30 / zoom, 0, TAU);
  ctx.strokeStyle = borderColor + "30";
  ctx.lineWidth = 1 / zoom;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// ─── ENTITIES ───

// w/h are the zoomed (world-unit) viewport; the caller applies ctx.scale(zoom).
// v4: painted sprites from art.js (cached by type/variant/size), soft tails.
const ROTATES = { junk: true, meteor: true, craft: true };

export function drawEntities(ctx, entities, w, h, camX, camY, playerRadius, time, eatRatio = 0.88, zoom = 1, dpr = 1, breath = 0.5) {
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
    let rot = ROTATES[e.type] ? e.rotation : 0;
    if (e.consuming) {
      // Spiral down into the hole
      const p = e.consumeProgress;
      alpha *= 1 - p * p;
      r *= 1 - p;
      rot += p * Math.PI * 2;
    }
    if (alpha <= 0.01 || r <= 0.05) continue;

    const rpx = e.radius * pxScale;

    // Comet tail: one cached tapered gradient, rotated along the velocity
    if (e.hasTail) {
      const t = tailFor(e.color, rpx);
      const speed = Math.hypot(e.vx, e.vy);
      const ang = Math.atan2(-e.vy, -e.vx);
      const len = r * (5 + Math.min(4, speed * 3));
      const hgt = r * 2.4;
      ctx.globalAlpha = alpha * 0.9;
      ctx.translate(sx, sy);
      ctx.rotate(ang);
      ctx.drawImage(t.c, 0, -hgt / 2, len, hgt);
      ctx.rotate(-ang);
      ctx.translate(-sx, -sy);
    }

    const sp = spriteFor(e, rpx);
    let d = sp.k * r;
    if (e.type === "star" || e.type === "neutron") {
      alpha *= twinkle;
      d *= 0.98 + breath * 0.04;
    }
    ctx.globalAlpha = alpha;
    if (rot) {
      ctx.translate(sx, sy);
      ctx.rotate(rot);
      ctx.drawImage(sp.c, -d / 2, -d / 2, d, d);
      ctx.rotate(-rot);
      ctx.translate(-sx, -sy);
    } else {
      ctx.drawImage(sp.c, sx - d / 2, sy - d / 2, d, d);
    }

    // "Too big to eat" indicator: slow soft ring
    const tooBig = playerRadius <= e.radius * eatRatio;
    if (tooBig && !e.consuming) {
      const pulse = 0.26 + Math.sin(time * 0.0016 + e.rotation * 3) * 0.08;
      ctx.globalAlpha = spawnAlpha;
      ctx.beginPath();
      ctx.arc(sx, sy, e.radius + 3 / zoom, 0, TAU);
      ctx.strokeStyle = `rgba(${TOO_BIG_RGB}, ${pulse})`;
      ctx.lineWidth = 1.8 / zoom;
      ctx.stroke();
    }

    // Slow blinking running light for derelicts
    if (e.type === "craft" && !e.consuming && Math.sin(time * 0.002 + e.rotation * 10) > 0.8) {
      const lx = sx + Math.cos(e.rotation) * e.radius * 0.95;
      const ly = sy + Math.sin(e.rotation) * e.radius * 0.95;
      ctx.globalAlpha = alpha * 0.8;
      ctx.beginPath();
      ctx.arc(lx, ly, Math.max(1, e.radius * 0.08), 0, TAU);
      ctx.fillStyle = "#ffe9c4";
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
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

// ─── ENTITY SPRITE PRE-RENDERING ───

/** Kept for API compatibility: v4 paints sprites lazily in art.js. */
export function prerenderEntitySprite(e) {
  e._artBase = null;
}

/** v4: the black hole is painted by art.js (disk, photon ring, lensed arc). */
export function drawBlackHole(ctx, x, y, radius, time, velocity, fx = {}) {
  drawBlackHoleArt(ctx, x, y, radius, time, fx);
}

// ─── PARTICLES ───
// v4: soft glowing streaks (additive), length follows velocity. Reduce Motion
// draws short soft dots instead.
export function drawParticles(ctx, particles, w, h, camX, camY, opts = {}) {
  const trail = opts.reduceMotion ? 0.6 : (getArtQuality() === "high" ? 5 : 3);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (const p of particles) {
    const sx = p.x - camX + w / 2;
    const sy = p.y - camY + h / 2;
    if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;
    const life = 1 - p.age / p.maxAge;
    ctx.globalAlpha = life * p.alpha * 0.85;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = Math.max(0.5, p.size * (0.4 + life * 0.8));
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - p.vx * trail - 0.01, sy - p.vy * trail);
    ctx.stroke();
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

export function drawMinimap(ctx, w, h, playerX, playerY, entities, bounds, playerRadius = 0, eatRatio = 0.88, overlay = null) {
  const mapSize = 90;
  const mapX = w - mapSize - 16;
  const mapY = h - mapSize - 16;
  const scale = mapSize / (bounds * 2.2);

  // Background
  ctx.save();
  ctx.beginPath();
  ctx.arc(mapX + mapSize / 2, mapY + mapSize / 2, mapSize / 2, 0, TAU);
  ctx.fillStyle = "rgba(4, 6, 16, 0.7)";
  ctx.fill();
  ctx.strokeStyle = "rgba(110, 114, 255, 0.15)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.clip();

  // Boundary ring
  ctx.beginPath();
  ctx.arc(mapX + mapSize / 2, mapY + mapSize / 2, bounds * scale, 0, TAU);
  ctx.strokeStyle = "rgba(110, 114, 255, 0.1)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // v4.1: landmarks, rivers, aurora, pulsar beams
  if (overlay) overlay(ctx, mapX + mapSize / 2, mapY + mapSize / 2, scale);

  // Entities as dots: red = too big, gold = power-up
  for (const e of entities) {
    const ex = mapX + mapSize / 2 + e.x * scale;
    const ey = mapY + mapSize / 2 + e.y * scale;
    if (e.powerup) {
      ctx.fillStyle = e.color;
      ctx.fillRect(ex - 1.5, ey - 1.5, 3, 3);
    } else if (playerRadius <= e.radius * eatRatio) {
      ctx.fillStyle = `rgba(${TOO_BIG_RGB}, 0.8)`;
      const s2 = Math.min(4, 1.5 + e.radius * scale);
      ctx.fillRect(ex - s2 / 2, ey - s2 / 2, s2, s2);
    } else {
      ctx.fillStyle = e.color + "88";
      ctx.fillRect(ex - 0.5, ey - 0.5, 1.5, 1.5);
    }
  }

  // Player
  const px = mapX + mapSize / 2 + playerX * scale;
  const py = mapY + mapSize / 2 + playerY * scale;
  ctx.beginPath();
  ctx.arc(px, py, 3, 0, TAU);
  ctx.fillStyle = "#8a8dff";
  ctx.fill();

  ctx.restore();
}

// ─── EDGE INDICATORS ───
// Arrows at screen edges pointing toward off-screen objects
// Uses math instead of save/translate/rotate/restore

// Screen-space. Shows the nearest few off-screen edible objects, plus power-ups.
export function drawEdgeIndicators(ctx, entities, w, h, camX, camY, playerRadius, zoom = 1, eatRatio = 0.88) {
  const margin = 20;
  const picks = [];
  for (const e of entities) {
    if (e.consuming) continue;
    const sx = (e.x - camX) * zoom + w / 2;
    const sy = (e.y - camY) * zoom + h / 2;
    if (sx > -10 && sx < w + 10 && sy > -10 && sy < h + 10) continue;
    if (!e.powerup && playerRadius <= e.radius * eatRatio) continue;
    const d = Math.hypot(sx - w / 2, sy - h / 2);
    picks.push({ e, sx, sy, d: e.powerup ? -1 : d });
  }
  picks.sort((a, b) => a.d - b.d);

  for (let i = 0; i < picks.length && i < 6; i++) {
    const { e, sx, sy } = picks[i];
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
    ctx.fillStyle = e.powerup ? e.color : e.color + "55";
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
