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
