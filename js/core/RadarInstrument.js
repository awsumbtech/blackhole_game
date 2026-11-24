// The round radar. A painted bezel, then whatever the world wants to lay
// inside the glass (current wisps, landmark pips), then entity pips and the
// player. Clipping keeps marks inside the dial. Nothing here is a rect,
// a ring stroke, or a tinted dot.

import { Theme } from "./Theme.js";

export class RadarInstrument {
  static TAU = Math.PI * 2;
  /**
   * Screen space. `overlay(ctx, ox, oy, scale, rim)` draws world marks in
   * map pixels. The rim disc is the glass, not a stroke.
   */
  static draw(ctx, w, h, playerX, playerY, entities, range, playerRadius, eatRatio, overlay) {
    const map = 92;
    const r = map / 2;
    const cx = w - r - 14;
    const cy = h - r - 20;
    const glass = r * 0.84;
    const scale = glass / (range > 1 ? range : 1);
    const cat = Theme.radar;
    const bezel = this._role(cat, "bezel");
    ctx.save();
    if (bezel) {
      ctx.globalAlpha = 0.96;
      cat.blit(ctx, bezel, cx, cy, map, map);
    }
    ctx.beginPath();
    ctx.arc(cx, cy, glass, 0, this.TAU);
    ctx.clip();

    const ox = cx - playerX * scale;
    const oy = cy - playerY * scale;
    if (overlay) overlay(ctx, ox, oy, scale, { cx, cy, r: glass });

    const reach = glass * glass;
    for (const e of entities) {
      const ex = ox + e.x * scale;
      const ey = oy + e.y * scale;
      const dx = ex - cx, dy = ey - cy;
      if (dx * dx + dy * dy > reach) continue;
      const tooBig = !e.powerup && playerRadius <= e.radius * eatRatio;
      const spr = this._role(cat, tooBig ? "pip-big" : "pip-edible");
      if (!spr) continue;
      const s = tooBig ? 7 : 5;
      ctx.globalAlpha = tooBig ? 0.9 : 0.8;
      cat.blit(ctx, spr, ex, ey, s, s);
    }

    const player = this._role(cat, "player");
    if (player) {
      ctx.globalAlpha = 1;
      cat.blit(ctx, player, cx, cy, 11, 11);
    }
    ctx.restore();
  }

  /** A soft current ribbon along a polyline, in the caller's pixel space. */
  static ribbon(ctx, pts, ox, oy, k, rim, alpha) {
    const spr = this._role(Theme.radar, "ribbon");
    if (!spr || !pts || pts.length < 2 || !(k > 0)) return;
    const drawW = 28;
    const drawH = drawW * (spr.h / spr.w);
    const lim = rim ? (rim.r + drawW) * (rim.r + drawW) : 0;
    const a = alpha > 0 ? alpha : 0.35;
    for (let s = 0; s < pts.length - 1; s += 2) {
      const ax = pts[s][0], ay = pts[s][1];
      const bx = pts[s + 1][0], by = pts[s + 1][1];
      const x = ox + ax * k;
      const y = oy + ay * k;
      if (rim) {
        const qx = x - rim.cx, qy = y - rim.cy;
        if (qx * qx + qy * qy > lim) continue;
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(by - ay, bx - ax));
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = a;
      Theme.radar.blit(ctx, spr, 0, 0, drawW, drawH);
      ctx.restore();
    }
  }

  /**
   * Role for a landmark kind. Forge, reef, flagship, and meadow each have a
   * painted pip. Every other kind stays on the edible pip. No sprite id is named here.
   */
  static landmarkRole(kind) {
    if (kind === "pulsar") return "landmark-pulsar";
    if (kind === "reef") return "landmark-reef";
    if (kind === "flagship") return "landmark-flagship";
    if (kind === "meadow") return "landmark-meadow";
    return "pip-edible";
  }

  /**
   * One painted landmark pip for a manifest role. The caller sets alpha.
   * A role that has not decoded yet draws nothing.
   */
  static drawLandmarkPip(ctx, x, y, role, size) {
    return this.mark(ctx, x, y, size, role, ctx.globalAlpha);
  }

  /** One painted landmark mark, looked up by role. A missing pip draws nothing. */
  static mark(ctx, x, y, size, role, alpha) {
    const spr = this._role(Theme.radar, role);
    if (!spr || !(size > 0)) return false;
    ctx.globalAlpha = alpha > 0 ? alpha : 0.85;
    Theme.radar.blit(ctx, spr, x, y, size, size);
    return true;
  }

  /** First decoded picture of a role, in index order. */
  static _role(cat, role) {
    const ids = cat.idsByRole(role);
    for (let i = 0; i < ids.length; i++) {
      const spr = cat.sprite(ids[i]);
      if (spr) return spr;
    }
    return null;
  }
}
