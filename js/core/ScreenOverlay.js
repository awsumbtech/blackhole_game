// ─── ScreenOverlay ───
// Screen-space canvas layer over the world in play: tier banner, thumbstick,
// floating texts, combo counter and the mouse cursor.

import { drawCursor } from "../render.js";

const hypot = (x, y) => Math.sqrt(x * x + y * y);   // 2-arg Math.hypot without the varargs cost
export const TIER_BANNER_FRAMES = 330;

export class ScreenOverlay {
  constructor(game) {
    this.state = game.state;
    this.ctx = game.display.ctx;
    this.mouseX = -100;
    this.mouseY = -100;
    const canvas = game.display.canvas;
    canvas.addEventListener("mousemove", e => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
    });
    canvas.addEventListener("mouseleave", () => {
      this.mouseX = -100;
      this.mouseY = -100;
    });
  }

  /** Age the tier banner; it goes away after TIER_BANNER_FRAMES. */
  tick(dt) {
    const state = this.state;
    state.tierBanner.age += dt;
    if (state.tierBanner.age > TIER_BANNER_FRAMES) state.tierBanner = null;
  }

  drawTierBanner(w, h) {
    const state = this.state, ctx = this.ctx;
    const b = state.tierBanner;
    if (!b) return;
    const t = b.age / TIER_BANNER_FRAMES;
    const a = Math.min(1, b.age / 50) * Math.min(1, (TIER_BANNER_FRAMES - b.age) / 70);
    if (a <= 0) return;
    const y = h * 0.24 - (state.settings.reduceMotion ? 0 : t * 8);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 8;
    ctx.font = "500 11px system-ui, sans-serif";
    ctx.fillStyle = `rgba(190, 196, 255, ${0.55 * a})`;
    ctx.fillText(b.head || "A WIDER VIEW", w / 2, y - 24);
    ctx.font = "300 26px system-ui, sans-serif";
    ctx.fillStyle = `rgba(236, 238, 255, ${0.9 * a})`;
    ctx.fillText(b.name, w / 2, y);
    ctx.font = "italic 300 14px system-ui, sans-serif";
    ctx.fillStyle = `rgba(210, 214, 240, ${0.7 * a})`;
    ctx.fillText(b.line, w / 2, y + 26);
    if (b.sub) {
      ctx.font = "500 12px system-ui, sans-serif";
      ctx.fillStyle = `rgba(200, 210, 255, ${0.55 * a})`;
      ctx.fillText(b.sub, w / 2, y + 48);
    }
    ctx.restore();
  }

  drawCursor(w, h) { drawCursor(this.ctx, this.mouseX, this.mouseY, w, h); }

  // Floating thumbstick: faint base ring + knob, drawn in screen space
  drawThumbstick(st) {
    const ctx = this.ctx;
    if (!st) return;
    const dx = st.kx - st.bx;
    const dy = st.ky - st.by;
    const d = hypot(dx, dy);
    const kx = d > st.maxR ? st.bx + (dx / d) * st.maxR : st.kx;
    const ky = d > st.maxR ? st.by + (dy / d) * st.maxR : st.ky;
    ctx.save();
    ctx.beginPath();
    ctx.arc(st.bx, st.by, st.maxR, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(138, 141, 255, 0.07)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(170, 175, 255, 0.28)";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(st.bx, st.by, 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(200, 205, 255, 0.25)";
    ctx.fill();
    const g = ctx.createRadialGradient(kx, ky, 2, kx, ky, 24);
    g.addColorStop(0, "rgba(220, 224, 255, 0.45)");
    g.addColorStop(1, "rgba(138, 141, 255, 0.18)");
    ctx.beginPath();
    ctx.arc(kx, ky, 22, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "rgba(220, 224, 255, 0.5)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  drawFloaters(w, h, z) {
    const state = this.state, ctx = this.ctx;
    for (const f of state.floaters) {
      const t = f.age / f.maxAge;
      const sx = (f.x - state.camX) * z + w / 2;
      const sy = (f.y - state.camY) * z + h / 2 - t * 40;
      const pop = t < 0.15 ? 0.6 + (t / 0.15) * 0.5 : 1.1 - Math.min(0.1, (t - 0.15));
      ctx.save();
      ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      ctx.font = `800 ${Math.round(f.size * pop)}px 'Outfit', sans-serif`;
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(4, 6, 16, 0.7)";
      ctx.strokeText(f.text, sx, sy);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, sx, sy);
      ctx.restore();
    }
  }

  // Combo counter + bonus
  drawCombo(w, h, z) {
    const state = this.state, ctx = this.ctx;
    const hx = (state.playerX - state.camX) * z + w / 2;
    const hy = (state.playerY - state.camY) * z + h / 2;
    const size = 14 + Math.min(state.comboCount, 25) * 0.5;
    ctx.save();
    ctx.font = `700 ${size}px 'Outfit', sans-serif`;
    ctx.textAlign = "center";
    const a = Math.min(0.9, 0.3 + state.comboTimer / state.mods.comboWindow);
    ctx.fillStyle = `rgba(255, 210, 100, ${a})`;
    ctx.fillText(`×${state.comboCount}`, hx, hy - state.radius * z * 1.25 - 14);
    if (state.comboCount >= 5) {
      ctx.font = "600 10px 'Space Mono', monospace";
      ctx.fillStyle = `rgba(255, 210, 100, ${a * 0.7})`;
      ctx.fillText(`+${Math.min(state.comboCount, 25)}% mass`, hx, hy - state.radius * z * 1.25 - 14 + 13);
    }
    ctx.restore();
  }
}
