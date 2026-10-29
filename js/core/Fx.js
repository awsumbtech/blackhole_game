// ─── Fx ───
// Particles, ripples and floaters. One place to upgrade the bite / catch feel
// without hunting through the main loop. Allocation-light: arrays live on state;
// update() compacts in place (no per-frame splice churn on particles).

const hypot = (x, y) => Math.sqrt(x * x + y * y);

export class Fx {
  constructor(state) { this.state = state; }

  floater(x, y, text, color = "#ffd27a", size = 16) {
    const f = this.state.floaters;
    f.push({ x, y, text, color, size, age: 0, maxAge: 70 });
    if (f.length > 12) f.shift();
  }

  /** Bits swirl around the hole and spiral in (tangential + inward pull). */
  spawnConsume(entity, artQuality) {
    const s = this.state;
    const few = s.settings.reduceMotion || artQuality !== "high";
    const count = Math.floor((6 + Math.min(14, Math.floor(entity.radius * 0.8 / Math.max(1, s.radius * 0.05)))) * (few ? 0.6 : 1));
    const sizeK = Math.max(1, entity.radius * 0.12);
    const ss = s.speedScale;
    const dx = entity.x - s.playerX, dy = entity.y - s.playerY;
    const d = hypot(dx, dy) || 1;
    const tx = -dy / d, ty = dx / d;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.3 + Math.random() * 1.2) * ss;
      const swirl = (0.8 + Math.random() * 1.4) * ss;
      s.particles.push({
        x: entity.x + Math.cos(angle) * entity.radius * 0.5,
        y: entity.y + Math.sin(angle) * entity.radius * 0.5,
        vx: Math.cos(angle) * speed + tx * swirl, vy: Math.sin(angle) * speed + ty * swirl,
        size: (0.8 + Math.random() * 1.8) * sizeK,
        color: entity.color,
        alpha: 0.5 + Math.random() * 0.35,
        age: 0, maxAge: 40 + Math.random() * 25,
        gravity: (0.05 + Math.random() * 0.04) * ss
      });
    }
  }

  spawnRipple(entity) {
    const s = this.state;
    s.ripples.push({
      x: entity.x, y: entity.y,
      startRadius: entity.radius,
      expandTo: 30 / s.zoom + entity.radius * 2,
      color: entity.color, age: 0, maxAge: 25
    });
    if (s.ripples.length > 40) s.ripples.shift();
  }

  update(dt, artQuality) {
    const s = this.state;
    const drag = Math.pow(0.97, dt);
    const ps = s.particles;
    let live = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      const dx = s.playerX - p.x, dy = s.playerY - p.y;
      const dist = hypot(dx, dy);
      if (dist > 5 && p.gravity) {
        p.vx += (dx / dist) * p.gravity * dt;
        p.vy += (dy / dist) * p.gravity * dt;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= drag; p.vy *= drag;
      p.age += dt;
      if (p.age < p.maxAge) ps[live++] = p;
    }
    ps.length = live;
    for (let i = s.ripples.length - 1; i >= 0; i--) {
      s.ripples[i].age += dt;
      if (s.ripples[i].age >= s.ripples[i].maxAge) s.ripples.splice(i, 1);
    }
    for (let i = s.floaters.length - 1; i >= 0; i--) {
      s.floaters[i].age += dt;
      if (s.floaters[i].age >= s.floaters[i].maxAge) s.floaters.splice(i, 1);
    }
    const pCap = artQuality === "high" ? 300 : 160;
    if (s.particles.length > pCap) s.particles.splice(0, s.particles.length - pCap);
  }
}
