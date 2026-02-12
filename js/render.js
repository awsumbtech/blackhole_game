// ─── RENDER ENGINE ───
// All canvas drawing. Starfield, nebula, entities, black hole, effects, boundary.

const TAU = Math.PI * 2;

// ─── STARFIELD ───
// Procedural infinite starfield via spatial hashing

export function drawStarfield(ctx, w, h, camX, camY, tint) {
  // Dark background
  ctx.fillStyle = "#04060c";
  ctx.fillRect(0, 0, w, h);

  // Biome tint glow in center
  const grad = ctx.createRadialGradient(w / 2, h / 2, 60, w / 2, h / 2, w * 0.6);
  grad.addColorStop(0, tint + "55");
  grad.addColorStop(1, "#00000000");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Stars via hash grid
  const cell = 80;
  const baseX = Math.floor((camX - w / 2) / cell) - 1;
  const baseY = Math.floor((camY - h / 2) / cell) - 1;
  const cols = Math.ceil(w / cell) + 3;
  const rows = Math.ceil(h / cell) + 3;

  for (let gx = 0; gx < cols; gx++) {
    for (let gy = 0; gy < rows; gy++) {
      const wx = baseX + gx;
      const wy = baseY + gy;
      const hash = Math.abs((wx * 73856093) ^ (wy * 19349663)) % 1000;

      if (hash < 180) {
        const px = (wx * cell - camX) + w / 2 + (hash % 11) * 5;
        const py = (wy * cell - camY) + h / 2 + (hash % 7) * 6;
        const brightness = 0.15 + (hash % 50) / 100;
        const size = hash % 17 === 0 ? 2 : 1;

        if (hash % 23 === 0) {
          ctx.fillStyle = `rgba(140, 200, 255, ${brightness})`;
        } else if (hash % 31 === 0) {
          ctx.fillStyle = `rgba(255, 220, 140, ${brightness * 0.8})`;
        } else {
          ctx.fillStyle = `rgba(200, 210, 240, ${brightness * 0.6})`;
        }
        ctx.fillRect(px, py, size, size);
      }
    }
  }

  // Subtle parallax nebula — second star layer at 0.3x speed
  const slowCamX = camX * 0.3;
  const slowCamY = camY * 0.3;
  const bx2 = Math.floor((slowCamX - w / 2) / 200) - 1;
  const by2 = Math.floor((slowCamY - h / 2) / 200) - 1;

  for (let gx = 0; gx < Math.ceil(w / 200) + 3; gx++) {
    for (let gy = 0; gy < Math.ceil(h / 200) + 3; gy++) {
      const wx = bx2 + gx;
      const wy = by2 + gy;
      const hash = Math.abs((wx * 48611) ^ (wy * 96769)) % 1000;

      if (hash < 30) {
        const px = (wx * 200 - slowCamX) + w / 2 + (hash % 13) * 8;
        const py = (wy * 200 - slowCamY) + h / 2 + (hash % 9) * 10;

        // Faint nebula blobs
        const ng = ctx.createRadialGradient(px, py, 0, px, py, 30 + hash % 40);
        const alpha = 0.015 + (hash % 20) * 0.001;
        if (hash % 3 === 0) {
          ng.addColorStop(0, `rgba(100, 120, 255, ${alpha})`);
        } else if (hash % 3 === 1) {
          ng.addColorStop(0, `rgba(255, 140, 200, ${alpha})`);
        } else {
          ng.addColorStop(0, `rgba(140, 255, 200, ${alpha})`);
        }
        ng.addColorStop(1, "transparent");
        ctx.fillStyle = ng;
        ctx.fillRect(px - 60, py - 60, 120, 120);
      }
    }
  }
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

// ─── ENTITIES ───

export function drawEntities(ctx, entities, w, h, camX, camY, playerRadius, time) {
  const margin = 40;

  for (const e of entities) {
    const sx = e.x - camX + w / 2;
    const sy = e.y - camY + h / 2;

    // Culling
    if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin) continue;

    // Size comparison to player — can we eat this?
    const canEat = playerRadius > e.radius * 0.88;
    const tooSmall = e.radius > playerRadius * 1.2;

    ctx.save();

    // Consuming animation — shrink + spiral toward player
    if (e.consuming) {
      const p = e.consumeProgress;
      const scale = 1 - p;
      ctx.globalAlpha = 1 - p * p;
      ctx.translate(sx, sy);
      ctx.scale(scale, scale);
      ctx.rotate(p * Math.PI * 2);
      ctx.translate(-sx, -sy);
    }

    // Glow for glowing objects
    if (e.glow > 0) {
      const glowSize = e.radius * (2 + e.glow);
      const gg = ctx.createRadialGradient(sx, sy, e.radius * 0.5, sx, sy, glowSize);
      gg.addColorStop(0, e.color + "30");
      gg.addColorStop(1, "transparent");
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(sx, sy, glowSize, 0, TAU);
      ctx.fill();
    }

    // Comet tail
    if (e.hasTail) {
      const speed = Math.hypot(e.vx, e.vy);
      const tailLen = Math.max(15, speed * 50);
      const angle = Math.atan2(-e.vy, -e.vx);

      const tg = ctx.createLinearGradient(
        sx, sy,
        sx + Math.cos(angle) * tailLen,
        sy + Math.sin(angle) * tailLen
      );
      tg.addColorStop(0, e.color + "60");
      tg.addColorStop(1, "transparent");

      ctx.strokeStyle = tg;
      ctx.lineWidth = e.radius * 1.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(angle) * tailLen, sy + Math.sin(angle) * tailLen);
      ctx.stroke();
    }

    // Main body
    if (e.shape === "polygon") {
      // Irregular polygon for craft/derelicts
      drawPolygon(ctx, sx, sy, e.radius, 6, e.rotation, e.color);
    } else if (e.bands) {
      // Banded planet
      drawBandedCircle(ctx, sx, sy, e.radius, e.bands, e.rotation);
    } else {
      // Simple circle
      ctx.beginPath();
      ctx.arc(sx, sy, e.radius, 0, TAU);
      ctx.fillStyle = e.color;
      ctx.fill();
    }

    // "Too big to eat" indicator — subtle red tint ring
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

    ctx.restore();
  }
}

function drawPolygon(ctx, x, y, r, sides, rotation, color) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = rotation + (i / sides) * TAU;
    const wobble = 0.85 + Math.sin(i * 2.7) * 0.15; // Irregular shape
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
  // Base circle
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = bands[0];
  ctx.fill();

  // Bands as clipped horizontal stripes
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

// ─── BLACK HOLE (PLAYER) ───

export function drawBlackHole(ctx, w, h, radius, time, velocity) {
  const x = w / 2;
  const y = h / 2;
  const speed = Math.hypot(velocity.vx, velocity.vy);

  // Accretion disk — rotating particles
  const diskRadius = radius * 2.5;
  const rotAngle = time * 0.0008;
  const particleCount = Math.floor(12 + radius * 0.5);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotAngle);

  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * TAU;
    const dist = radius * 1.1 + Math.sin(angle * 3 + time * 0.002) * radius * 0.3;
    const px = Math.cos(angle) * dist;
    const py = Math.sin(angle) * dist * 0.45; // Elliptical
    const size = 1 + Math.sin(angle * 2 + time * 0.003) * 0.8;
    const alpha = 0.15 + Math.sin(angle + time * 0.002) * 0.1;

    ctx.beginPath();
    ctx.arc(px, py, Math.max(0.5, size), 0, TAU);
    ctx.fillStyle = `rgba(130, 140, 255, ${alpha})`;
    ctx.fill();
  }

  // Second disk layer — warmer, faster
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

  // Outer glow
  const pulse = 1 + Math.sin(time * 0.002) * 0.04;
  const glowR = (radius + 20) * pulse;
  const outerGlow = ctx.createRadialGradient(x, y, radius * 0.8, x, y, glowR);
  outerGlow.addColorStop(0, "rgba(90, 100, 220, 0.08)");
  outerGlow.addColorStop(0.5, "rgba(70, 80, 200, 0.04)");
  outerGlow.addColorStop(1, "transparent");
  ctx.fillStyle = outerGlow;
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
  const edgeGrad = ctx.createRadialGradient(x, y, radius * 0.85, x, y, radius * 1.05);
  edgeGrad.addColorStop(0, "transparent");
  edgeGrad.addColorStop(0.7, "rgba(110, 120, 255, 0.25)");
  edgeGrad.addColorStop(1, "transparent");
  ctx.fillStyle = edgeGrad;
  ctx.fill();

  // Inner subtle highlight — gives depth
  const innerGrad = ctx.createRadialGradient(x - radius * 0.2, y - radius * 0.2, 0, x, y, radius * 0.7);
  innerGrad.addColorStop(0, "rgba(60, 70, 140, 0.06)");
  innerGrad.addColorStop(1, "transparent");
  ctx.fillStyle = innerGrad;
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.7, 0, TAU);
  ctx.fill();

  // Speed trail behind the black hole
  if (speed > 0.5) {
    const trailAngle = Math.atan2(-velocity.vy, -velocity.vx);
    const trailLen = Math.min(40, speed * 8);
    const tg = ctx.createLinearGradient(
      x, y,
      x + Math.cos(trailAngle) * trailLen,
      y + Math.sin(trailAngle) * trailLen
    );
    tg.addColorStop(0, "rgba(90, 100, 220, 0.12)");
    tg.addColorStop(1, "transparent");
    ctx.strokeStyle = tg;
    ctx.lineWidth = radius * 1.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(trailAngle) * trailLen, y + Math.sin(trailAngle) * trailLen);
    ctx.stroke();
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

export function drawEdgeIndicators(ctx, entities, w, h, camX, camY, playerRadius) {
  const margin = 20;
  const arrowSize = 5;

  // Group nearby off-screen entities into clusters
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

    ctx.save();
    ctx.translate(edgeX, edgeY);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(arrowSize, 0);
    ctx.lineTo(-arrowSize, -arrowSize * 0.6);
    ctx.lineTo(-arrowSize, arrowSize * 0.6);
    ctx.closePath();
    ctx.fillStyle = e.color + "40";
    ctx.fill();

    ctx.restore();
  }
}

// ─── CURSOR ───
// Custom crosshair cursor drawn on canvas

export function drawCursor(ctx, mouseX, mouseY, w, h) {
  if (mouseX < 0 || mouseX > w || mouseY < 0 || mouseY > h) return;

  const size = 10;
  ctx.strokeStyle = "rgba(200, 210, 255, 0.3)";
  ctx.lineWidth = 1;

  // Cross
  ctx.beginPath();
  ctx.moveTo(mouseX - size, mouseY);
  ctx.lineTo(mouseX + size, mouseY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(mouseX, mouseY - size);
  ctx.lineTo(mouseX, mouseY + size);
  ctx.stroke();

  // Center dot
  ctx.beginPath();
  ctx.arc(mouseX, mouseY, 2, 0, TAU);
  ctx.fillStyle = "rgba(200, 210, 255, 0.4)";
  ctx.fill();
}
