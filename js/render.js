// ─── RENDER ENGINE ───
// All canvas drawing. Starfield, nebula, entities, black hole, effects, boundary.

const TAU = Math.PI * 2;

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
  const bx2 = Math.floor((slowCamX - w / 2 + offX) / 200) - 1;
  const by2 = Math.floor((slowCamY - h / 2 + offY) / 200) - 1;

  for (let gx = 0; gx < Math.ceil(bw / 200) + 3; gx++) {
    for (let gy = 0; gy < Math.ceil(bh / 200) + 3; gy++) {
      const wx = bx2 + gx;
      const wy = by2 + gy;
      const hash = Math.abs((wx * 48611) ^ (wy * 96769)) % 1000;

      if (hash < 30) {
        const px = (wx * 200 - slowCamX) + w / 2 - offX + (hash % 13) * 8;
        const py = (wy * 200 - slowCamY) + h / 2 - offY + (hash % 9) * 10;

        const ng = nebulaCtx.createRadialGradient(px, py, 0, px, py, 30 + hash % 40);
        const alpha = 0.015 + (hash % 20) * 0.001;
        if (hash % 3 === 0) {
          ng.addColorStop(0, `rgba(100, 120, 255, ${alpha})`);
        } else if (hash % 3 === 1) {
          ng.addColorStop(0, `rgba(255, 140, 200, ${alpha})`);
        } else {
          ng.addColorStop(0, `rgba(140, 255, 200, ${alpha})`);
        }
        ng.addColorStop(1, "transparent");
        nebulaCtx.fillStyle = ng;
        nebulaCtx.fillRect(px - 60, py - 60, 120, 120);
      }
    }
  }

  nebulaCachedCamX = camX;
  nebulaCachedCamY = camY;
}

export function invalidateStarfield() {
  starCachedCamX = null;
  nebulaCachedCamX = null;
}

export function drawStarfield(ctx, w, h, camX, camY, tint) {
  // Dark background
  ctx.fillStyle = "#04060c";
  ctx.fillRect(0, 0, w, h);

  // Biome tint glow in center (cheap — one gradient, drawn every frame)
  const grad = ctx.createRadialGradient(w / 2, h / 2, 60, w / 2, h / 2, w * 0.6);
  grad.addColorStop(0, tint + "55");
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

export function drawBoundary(ctx, w, h, camX, camY, bounds, borderColor, time) {
  const cx = w / 2 - camX;
  const cy = h / 2 - camY;

  // Soft glow ring
  const pulse = 1 + Math.sin(time * 0.001) * 0.08;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, bounds * pulse, 0, TAU);
  ctx.strokeStyle = borderColor + "18";
  ctx.lineWidth = 40;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, bounds, 0, TAU);
  ctx.strokeStyle = borderColor + "40";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Dashed inner warning ring
  ctx.setLineDash([8, 16]);
  ctx.beginPath();
  ctx.arc(cx, cy, bounds - 30, 0, TAU);
  ctx.strokeStyle = borderColor + "20";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// ─── ENTITY GLOW CACHE ───

let glowCanvas = null;
let glowCtx = null;
const GLOW_SIZE = 64;

function ensureGlowCanvas() {
  if (glowCanvas) return;
  glowCanvas = document.createElement("canvas");
  glowCanvas.width = GLOW_SIZE;
  glowCanvas.height = GLOW_SIZE;
  glowCtx = glowCanvas.getContext("2d");

  const half = GLOW_SIZE / 2;
  const gg = glowCtx.createRadialGradient(half, half, half * 0.25, half, half, half);
  gg.addColorStop(0, "rgba(255, 255, 255, 0.19)");
  gg.addColorStop(1, "transparent");
  glowCtx.fillStyle = gg;
  glowCtx.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
}

// ─── BLACK HOLE GRADIENT CACHE ───

let bhCachedRadius = -1;
let bhOuterGlow = null;
let bhEdgeGrad = null;
let bhInnerGrad = null;

// ─── ENTITIES ───

export function drawEntities(ctx, entities, w, h, camX, camY, playerRadius, time) {
  const margin = 40;
  ensureGlowCanvas();

  for (const e of entities) {
    const sx = e.x - camX + w / 2;
    const sy = e.y - camY + h / 2;

    // Culling
    if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin) continue;

    // Spawn fade-in alpha
    const spawnAlpha = e._spawnAlpha ?? 1;
    if (spawnAlpha < 1) {
      ctx.globalAlpha = spawnAlpha;
    }

    // Size comparison to player
    const tooSmall = e.radius > playerRadius * 1.2;

    // Only save/restore when consuming (the only case that modifies transform)
    if (e.consuming) {
      ctx.save();
      const p = e.consumeProgress;
      const scale = 1 - p;
      ctx.globalAlpha = 1 - p * p;
      ctx.translate(sx, sy);
      ctx.scale(scale, scale);
      ctx.rotate(p * Math.PI * 2);
      ctx.translate(-sx, -sy);
    }

    // Glow for glowing objects — use cached glow canvas
    if (e.glow > 0) {
      const glowSize = e.radius * (2 + e.glow);
      const diameter = glowSize * 2;
      ctx.globalAlpha = e.consuming ? ctx.globalAlpha : spawnAlpha;
      ctx.drawImage(glowCanvas, sx - glowSize, sy - glowSize, diameter, diameter);
      ctx.globalAlpha = e.consuming ? (1 - e.consumeProgress * e.consumeProgress) : spawnAlpha;
    }

    // Comet tail — simple alpha-faded strokes instead of gradient
    if (e.hasTail) {
      const speed = Math.hypot(e.vx, e.vy);
      const tailLen = Math.max(15, speed * 50);
      const angle = Math.atan2(-e.vy, -e.vx);
      const segments = 4;

      ctx.lineCap = "round";
      for (let i = 0; i < segments; i++) {
        const t0 = i / segments;
        const t1 = (i + 1) / segments;
        const x0 = sx + Math.cos(angle) * tailLen * t0;
        const y0 = sy + Math.sin(angle) * tailLen * t0;
        const x1 = sx + Math.cos(angle) * tailLen * t1;
        const y1 = sy + Math.sin(angle) * tailLen * t1;
        ctx.globalAlpha = (1 - t0) * 0.35 * spawnAlpha;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = e.radius * 1.2 * (1 - t0 * 0.5);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.globalAlpha = e.consuming ? (1 - e.consumeProgress * e.consumeProgress) : spawnAlpha;
    }

    // Main body — use pre-rendered sprite if available
    if (e._sprite) {
      const d = e._sprite.width;
      ctx.drawImage(e._sprite, sx - d / 2, sy - d / 2);
    } else if (e.shape === "polygon") {
      drawPolygon(ctx, sx, sy, e.radius, 6, e.rotation, e.color);
    } else if (e.bands) {
      drawBandedCircle(ctx, sx, sy, e.radius, e.bands, e.rotation);
    } else {
      // Simple circle
      ctx.beginPath();
      ctx.arc(sx, sy, e.radius, 0, TAU);
      ctx.fillStyle = e.color;
      ctx.fill();
    }

    // "Too big to eat" indicator
    if (tooSmall && !e.consuming) {
      ctx.beginPath();
      ctx.arc(sx, sy, e.radius + 3, 0, TAU);
      ctx.strokeStyle = "rgba(255, 80, 80, 0.15)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Blinking light for craft
    if (e.type === "craft" && Math.sin(time * 0.003 + e.rotation * 10) > 0.85) {
      ctx.beginPath();
      ctx.arc(sx + e.radius * 0.3, sy - e.radius * 0.3, 1.5, 0, TAU);
      ctx.fillStyle = "#fff";
      ctx.fill();
    }

    if (e.consuming) {
      ctx.restore();
    }

    // Restore alpha after spawn fade-in
    if (spawnAlpha < 1) {
      ctx.globalAlpha = 1;
    }
  }
}

function drawPolygon(ctx, x, y, r, sides, rotation, color) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = rotation + (i / sides) * TAU;
    const wobble = 0.85 + Math.sin(i * 2.7) * 0.15;
    const px = x + Math.cos(angle) * r * wobble;
    const py = y + Math.sin(angle) * r * wobble;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawBandedCircle(ctx, x, y, r, bands, rotation) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = bands[0];
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.clip();

  const bandH = (r * 2) / bands.length;
  for (let i = 0; i < bands.length; i++) {
    ctx.fillStyle = bands[i];
    const by = y - r + i * bandH + Math.sin(rotation + i) * 2;
    ctx.fillRect(x - r, by, r * 2, bandH);
  }
  ctx.restore();
}

// ─── ENTITY SPRITE PRE-RENDERING ───

export function prerenderEntitySprite(e) {
  if (e.bands) {
    const padding = 2;
    const size = Math.ceil(e.radius * 2) + padding * 2;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const sCtx = c.getContext("2d");
    const cx = size / 2;
    const cy = size / 2;

    // Base circle
    sCtx.beginPath();
    sCtx.arc(cx, cy, e.radius, 0, TAU);
    sCtx.fillStyle = e.bands[0];
    sCtx.fill();

    // Bands
    sCtx.save();
    sCtx.beginPath();
    sCtx.arc(cx, cy, e.radius, 0, TAU);
    sCtx.clip();

    const bandH = (e.radius * 2) / e.bands.length;
    for (let i = 0; i < e.bands.length; i++) {
      sCtx.fillStyle = e.bands[i];
      const by = cy - e.radius + i * bandH + Math.sin(e.rotation + i) * 2;
      sCtx.fillRect(cx - e.radius, by, e.radius * 2, bandH);
    }
    sCtx.restore();

    e._sprite = c;
  } else if (e.shape === "polygon") {
    const padding = 4;
    const size = Math.ceil(e.radius * 2) + padding * 2;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const sCtx = c.getContext("2d");
    const cx = size / 2;
    const cy = size / 2;

    sCtx.beginPath();
    const sides = 6;
    for (let i = 0; i < sides; i++) {
      const angle = e.rotation + (i / sides) * TAU;
      const wobble = 0.85 + Math.sin(i * 2.7) * 0.15;
      const px = cx + Math.cos(angle) * e.radius * wobble;
      const py = cy + Math.sin(angle) * e.radius * wobble;
      if (i === 0) sCtx.moveTo(px, py);
      else sCtx.lineTo(px, py);
    }
    sCtx.closePath();
    sCtx.fillStyle = e.color;
    sCtx.fill();

    e._sprite = c;
  }
}

// ─── BLACK HOLE (PLAYER) ───

export function drawBlackHole(ctx, w, h, radius, time, velocity) {
  const x = w / 2;
  const y = h / 2;
  const speed = Math.hypot(velocity.vx, velocity.vy);

  // Accretion disk — rotating particles
  const rotAngle = time * 0.0008;
  const particleCount = Math.floor(12 + radius * 0.5);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotAngle);

  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * TAU;
    const dist = radius * 1.1 + Math.sin(angle * 3 + time * 0.002) * radius * 0.3;
    const px = Math.cos(angle) * dist;
    const py = Math.sin(angle) * dist * 0.45;
    const size = 1 + Math.sin(angle * 2 + time * 0.003) * 0.8;
    const alpha = 0.15 + Math.sin(angle + time * 0.002) * 0.1;

    ctx.beginPath();
    ctx.arc(px, py, Math.max(0.5, size), 0, TAU);
    ctx.fillStyle = `rgba(130, 140, 255, ${alpha})`;
    ctx.fill();
  }

  // Second disk layer
  ctx.rotate(rotAngle * -1.7);
  for (let i = 0; i < Math.floor(particleCount * 0.6); i++) {
    const angle = (i / (particleCount * 0.6)) * TAU;
    const dist = radius * 1.3 + Math.sin(angle * 2 + time * 0.003) * radius * 0.2;
    const px = Math.cos(angle) * dist;
    const py = Math.sin(angle) * dist * 0.35;
    const alpha = 0.08 + Math.sin(angle * 3 + time * 0.004) * 0.05;

    ctx.beginPath();
    ctx.arc(px, py, 0.8, 0, TAU);
    ctx.fillStyle = `rgba(200, 160, 255, ${alpha})`;
    ctx.fill();
  }

  ctx.restore();

  // Rebuild cached gradients only when radius changes significantly
  if (Math.abs(radius - bhCachedRadius) > 1) {
    const pulse = 1 + Math.sin(time * 0.002) * 0.04;
    const glowR = (radius + 20) * pulse;

    bhOuterGlow = ctx.createRadialGradient(x, y, radius * 0.8, x, y, glowR);
    bhOuterGlow.addColorStop(0, "rgba(90, 100, 220, 0.08)");
    bhOuterGlow.addColorStop(0.5, "rgba(70, 80, 200, 0.04)");
    bhOuterGlow.addColorStop(1, "transparent");
    bhOuterGlow._glowR = glowR;

    bhEdgeGrad = ctx.createRadialGradient(x, y, radius * 0.85, x, y, radius * 1.05);
    bhEdgeGrad.addColorStop(0, "transparent");
    bhEdgeGrad.addColorStop(0.7, "rgba(110, 120, 255, 0.25)");
    bhEdgeGrad.addColorStop(1, "transparent");

    bhInnerGrad = ctx.createRadialGradient(x - radius * 0.2, y - radius * 0.2, 0, x, y, radius * 0.7);
    bhInnerGrad.addColorStop(0, "rgba(60, 70, 140, 0.06)");
    bhInnerGrad.addColorStop(1, "transparent");

    bhCachedRadius = radius;
  }

  // Outer glow
  const glowR = bhOuterGlow._glowR;
  ctx.fillStyle = bhOuterGlow;
  ctx.beginPath();
  ctx.arc(x, y, glowR, 0, TAU);
  ctx.fill();

  // Event horizon (main black circle)
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fillStyle = "#020308";
  ctx.fill();

  // Edge ring
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fillStyle = bhEdgeGrad;
  ctx.fill();

  // Inner subtle highlight
  ctx.fillStyle = bhInnerGrad;
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.7, 0, TAU);
  ctx.fill();

  // Speed trail — simple alpha strokes instead of gradient
  if (speed > 0.5) {
    const trailAngle = Math.atan2(-velocity.vy, -velocity.vx);
    const trailLen = Math.min(40, speed * 8);

    ctx.lineCap = "round";
    ctx.lineWidth = radius * 1.5;
    const segments = 3;
    for (let i = 0; i < segments; i++) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      ctx.globalAlpha = (1 - t0) * 0.12;
      ctx.strokeStyle = "rgba(90, 100, 220, 1)";
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(trailAngle) * trailLen * t0, y + Math.sin(trailAngle) * trailLen * t0);
      ctx.lineTo(x + Math.cos(trailAngle) * trailLen * t1, y + Math.sin(trailAngle) * trailLen * t1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

// ─── PARTICLES ───

export function drawParticles(ctx, particles, w, h, camX, camY) {
  for (const p of particles) {
    const sx = p.x - camX + w / 2;
    const sy = p.y - camY + h / 2;
    if (sx < -10 || sx > w + 10 || sy < -10 || sy > h + 10) continue;

    const lifeRatio = 1 - p.age / p.maxAge;
    ctx.globalAlpha = lifeRatio * p.alpha;
    ctx.beginPath();
    ctx.arc(sx, sy, p.size * lifeRatio, 0, TAU);
    ctx.fillStyle = p.color;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ─── CONSUME RIPPLE ───

export function drawRipples(ctx, ripples, w, h, camX, camY) {
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
    ctx.lineWidth = 1.5 * (1 - progress);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ─── MINIMAP ───

export function drawMinimap(ctx, w, h, playerX, playerY, entities, bounds) {
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

  // Entities as dots
  for (const e of entities) {
    const ex = mapX + mapSize / 2 + e.x * scale;
    const ey = mapY + mapSize / 2 + e.y * scale;
    ctx.fillStyle = e.color + "88";
    ctx.fillRect(ex - 0.5, ey - 0.5, 1.5, 1.5);
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

export function drawEdgeIndicators(ctx, entities, w, h, camX, camY, playerRadius) {
  const margin = 20;
  const arrowSize = 5;

  for (const e of entities) {
    const sx = e.x - camX + w / 2;
    const sy = e.y - camY + h / 2;

    // Only for off-screen entities
    if (sx > -10 && sx < w + 10 && sy > -10 && sy < h + 10) continue;

    // Only show for eatable objects
    if (e.radius > playerRadius * 1.2) continue;

    // Clamp to screen edge
    const angle = Math.atan2(sy - h / 2, sx - w / 2);
    const edgeX = w / 2 + Math.cos(angle) * (w / 2 - margin);
    const edgeY = h / 2 + Math.sin(angle) * (h / 2 - margin);

    // Compute arrow vertices mathematically (no translate/rotate)
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    const tipX = edgeX + cosA * arrowSize;
    const tipY = edgeY + sinA * arrowSize;
    const leftX = edgeX - cosA * arrowSize - sinA * arrowSize * 0.6;
    const leftY = edgeY - sinA * arrowSize + cosA * arrowSize * 0.6;
    const rightX = edgeX - cosA * arrowSize + sinA * arrowSize * 0.6;
    const rightY = edgeY - sinA * arrowSize - cosA * arrowSize * 0.6;

    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fillStyle = e.color + "40";
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
