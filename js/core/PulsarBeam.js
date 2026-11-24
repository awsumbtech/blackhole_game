// The Neutron Forge jets. Two opposing paintings per pulsar, rotated about
// the sprite pivot so the painted head stays on the star and the beam runs
// along +x. The manifest's visibleEndX and hitProfile are the footprint, so
// the picture and the +50% bonus use one shape. Flare scales that width.
// Nothing here builds a cone, a gradient, or a tint. A missing picture is skipped.

import { Theme } from "./Theme.js";

export class PulsarBeam {
  /** Rest half-angle. The painted width is 1 at this value. */
  static REST = 0.075;
  static ROLE = "beam";
  /** Ease time, in the world's frame step (1 frame ≈ 1/60 s). */
  static EASE = 14.4;
  /** Inner dead zone as a fraction of the outer reach (0.03 / 1.5). */
  static INNER = 0.02;
  static _shown = -1;

  /**
   * Variant ids in manifest order. A new row in the pulsar index, or a new
   * sprite with this role, is picked up with no change here.
   */
  static ids() {
    const cat = Theme.pulsar;
    const roleIds = cat.idsByRole(this.ROLE);
    const listed = cat.variants();
    const out = [];
    for (let i = 0; i < listed.length; i++) {
      const row = listed[i];
      const id = row && row.id;
      if (!id) continue;
      const role = row.role || this.ROLE;
      const allowed = cat.idsByRole(role);
      if (allowed.indexOf(id) >= 0 && out.indexOf(id) < 0) out.push(id);
    }
    for (let i = 0; i < roleIds.length; i++) {
      if (out.indexOf(roleIds[i]) < 0) out.push(roleIds[i]);
    }
    return out.length ? out : roleIds;
  }

  /** Named beam id, otherwise the pulsar's variant index. */
  static indexFor(p, fallback) {
    const ids = this.ids();
    if (p && p.beam && ids.indexOf(p.beam) >= 0) return ids.indexOf(p.beam);
    if (p && (p.variant === 0 || p.variant > 0)) return p.variant;
    return fallback || 0;
  }

  /**
   * Cross-width relative to the rest beam. `dt` is the world frame step.
   * Omit it (or pass 0) to read the current scale without moving it, so a
   * paused or slow-mo clock does not advance the flare on its own.
   */
  static widthScale(halfWidth, dt) {
    const rest = this.REST;
    const target = halfWidth > 0 ? halfWidth : rest;
    if (!(this._shown > 0)) this._shown = target;
    if (dt > 0) {
      const k = 1 - Math.exp(-dt / this.EASE);
      this._shown += (target - this._shown) * k;
    }
    return this._shown / rest;
  }

  /** Destination size. The visible tip, not the canvas edge, lands at `length`. */
  static layout(spr, length, scale) {
    const pivotX = spr.pivot && spr.pivot[0] > 0 ? spr.pivot[0] : 0;
    const end = spr.visibleEndX > pivotX ? spr.visibleEndX : (spr.w > 0 ? spr.w : pivotX + 1);
    const reach = (end - pivotX) / (spr.w > 0 ? spr.w : 1);
    const drawW = length / Math.max(0.05, reach);
    const aspect = spr.h > 0 && spr.w > 0 ? spr.h / spr.w : 0.25;
    const drawH = drawW * aspect * (scale > 0 ? scale : 1);
    return { drawW, drawH };
  }

  /** Visible half-height, as a fraction of the sprite height, at station u. */
  static profileHalf(spr, u) {
    const prof = spr && spr.hitProfile;
    if (!prof || !prof.length) return 0;
    const x = u < 0 ? 0 : (u > 1 ? 1 : u);
    if (x <= prof[0][0]) return prof[0][1];
    const last = prof[prof.length - 1];
    if (x >= last[0]) return last[1];
    for (let i = 1; i < prof.length; i++) {
      const b = prof[i];
      const a = prof[i - 1];
      if (x <= b[0]) {
        const span = b[0] - a[0];
        const t = span > 0 ? (x - a[0]) / span : 0;
        return a[1] + (b[1] - a[1]) * t;
      }
    }
    return last[1];
  }

  /**
   * World point against one pulsar. `length` is the outer reach (the visible
   * tip). `inner` defaults to 0.03 of the old 1.5-b0 bonus. The painted
   * profile is used once that sprite has decoded; otherwise a plain angular
   * wedge of `halfWidth` covers the same reach.
   */
  static containsPoint(p, x, y, halfWidth, length, ox, oy, f, inner) {
    if (!p || !(length > 0)) return false;
    const px = ox + p.x * f;
    const py = oy + p.y * f;
    const dx = x - px;
    const dy = y - py;
    const dist = Math.hypot(dx, dy);
    const innerR = inner > 0 ? inner : length * this.INNER;
    if (dist < innerR || dist > length) return false;
    const ids = this.ids();
    const index = this.indexFor(p, 0);
    const id = ids.length ? ids[((index % ids.length) + ids.length) % ids.length] : "";
    const spr = id ? Theme.pulsar.sprite(id) : null;
    if (!spr || !spr.hitProfile) return this._wedge(dx, dy, p.ang || 0, halfWidth);
    const scale = this.widthScale(halfWidth);
    const lay = this.layout(spr, length, scale);
    const ang = p.ang || 0;
    return this._inJet(dx, dy, ang, spr, lay, length) || this._inJet(dx, dy, ang + Math.PI, spr, lay, length);
  }

  /**
   * World space, inside the camera transform. `length` is the reach from the
   * pivot to the visible tip. `ox, oy, f` place set-local points.
   */
  static draw(ctx, pulsars, cover, halfWidth, length, ox, oy, f, camX, camY, vw, vh) {
    if (!pulsars || !pulsars.length || !(cover > 0.02) || !(length > 0)) return false;
    const ids = this.ids();
    if (!ids.length) return false;
    const scale = this.widthScale(halfWidth);
    const marginX = (vw || 0) * 0.5 + length;
    const marginY = (vh || 0) * 0.5 + length;
    let any = false;
    for (let i = 0; i < pulsars.length; i++) {
      const p = pulsars[i];
      const x = ox + p.x * f;
      const y = oy + p.y * f;
      if (Math.abs(x - camX) > marginX || Math.abs(y - camY) > marginY) continue;
      if (this.jet(ctx, x, y, p.ang || 0, this.indexFor(p, i), length, scale, cover)) any = true;
    }
    return any;
  }

  /** One pulsar: the painting, then the same painting opposite. */
  static jet(ctx, x, y, ang, index, length, scale, alpha) {
    const ids = this.ids();
    if (!ids.length || !(alpha > 0) || !(length > 0)) return false;
    const n = ids.length;
    const id = ids[((index % n) + n) % n];
    const spr = Theme.pulsar.sprite(id);
    if (!spr) return false;
    const lay = this.layout(spr, length, scale);
    const cat = Theme.pulsar;
    const blit = (a) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.globalAlpha = alpha;
      cat.blit(ctx, spr, 0, 0, lay.drawW, lay.drawH);
      ctx.restore();
    };
    blit(ang);
    blit(ang + Math.PI);
    return true;
  }

  static _wedge(dx, dy, ang, halfWidth) {
    let diff = Math.atan2(dy, dx) - ang;
    diff = ((diff % Math.PI) + Math.PI * 1.5) % Math.PI - Math.PI / 2;
    const hw = halfWidth > 0 ? halfWidth : this.REST;
    return Math.abs(diff) < hw;
  }

  static _inJet(dx, dy, ang, spr, lay, length) {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const lx = dx * c + dy * s;
    const ly = -dx * s + dy * c;
    if (!(lx >= 0) || lx > length) return false;
    const half = this.profileHalf(spr, lx / length) * lay.drawH;
    return Math.abs(ly) <= half;
  }
}
