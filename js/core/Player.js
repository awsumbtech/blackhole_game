// ─── Player ───
// The hole's body: size from mass, steering, drift and the radar trail.

const hypot = (x, y) => Math.sqrt(x * x + y * y);   // 2-arg Math.hypot without the varargs cost

export class Player {
  constructor(game) {
    this.game = game;
    this.state = game.state;
  }

  updateRadius() {
    const state = this.state;
    state.radius = Math.max(6, 4 + Math.sqrt(state.mass) * 0.9);
    // v5: no edge. Space goes on; things spawn and recycle around you.
    state.bounds = Infinity;
  }

  update(dt) {
    const state = this.state, d = this.game.display;
    const { mx, my, magnitude } = this.game.input.getMovement(d.w, d.h);
    const ss = state.speedScale;
    const thrust = state.mods.thrust;

    const maxSpeed = 3.6 * thrust * ss;
    const accel = 0.18 * thrust * ss * dt;
    if (magnitude > 0.01) {
      state.playerVX += mx * accel;
      state.playerVY += my * accel;
    }

    // Frame-rate independent friction (same feel at 60Hz and 120Hz)
    const friction = Math.pow(0.92, dt);
    state.playerVX *= friction;
    state.playerVY *= friction;

    const speed = hypot(state.playerVX, state.playerVY);
    if (speed > maxSpeed && state.invuln < 40) {
      state.playerVX = (state.playerVX / speed) * maxSpeed;
      state.playerVY = (state.playerVY / speed) * maxSpeed;
    }

    state.playerX += state.playerVX * dt;
    state.playerY += state.playerVY * dt;

    const distFromCenter = hypot(state.playerX, state.playerY);
    if (distFromCenter + state.radius > state.bounds) {
      const nx = state.playerX / distFromCenter;
      const ny = state.playerY / distFromCenter;
      const dot = state.playerVX * nx + state.playerVY * ny;
      if (dot > 0) {
        state.playerVX -= 2 * dot * nx * 0.6;
        state.playerVY -= 2 * dot * ny * 0.6;
        if (dot > 0.8 * ss) this.game.audio.playBounce();
      }
      const pushDist = state.bounds - state.radius - 2;
      state.playerX = nx * pushDist;
      state.playerY = ny * pushDist;
    }

    const camSmooth = 1 - Math.pow(1 - 0.08, dt);
    state.camX += (state.playerX - state.camX) * camSmooth;
    state.camY += (state.playerY - state.camY) * camSmooth;
  }

  /** v5 radar trail: a point every ~1/3s when you've moved. */
  updateTrail(dt) {
    const state = this.state;
    state.trailT += dt;
    if (state.trailT < 20) return;
    state.trailT = 0;
    const t = state.trail;
    const last = t[t.length - 1];
    const step = hypot(state.viewW, state.viewH) * 0.02;
    if (!last || hypot(last.x - state.playerX, last.y - state.playerY) > step) {
      t.push({ x: state.playerX, y: state.playerY });
      if (t.length > 90) t.shift();
    }
  }
}
