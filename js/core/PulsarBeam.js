// The Neutron Forge jets. Two opposing paintings per pulsar, rotated about
// the sprite pivot so the painted head stays on the star and the beam runs
// along +x. Flare scales the cross-width. The picture already fans, so this
// class does not build a cone, a gradient, or a tint. A missing picture is
// skipped.

import { Theme } from "./Theme.js";

export class PulsarBeam {
  /** Rest half-angle of worlds.js beamHalfWidth. The painted width is 1 here. */
  static REST = 0.075;
  static ROLE = "beam";
  static _shown = -1;
  static _seen = -1;

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

  /** Cross-width relative to the rest beam. Eases when flare opens or closes. */
  static widthScale(halfWidth) {
    const rest = this.REST;
    const target = halfWidth > 0 ? halfWidth : rest;
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    if (this._shown < 0) this._shown = target;
    if (now !== this._seen) {
      const prev = this._seen;
      this._seen = now;
      if (prev >= 0) {
        const dt = Math.min(50, Math.max(0, now - prev));
        const k = 1 - Math.exp(-dt / 240);
        this._shown += (target - this._shown) * k;
      }
    }
    return this._shown / rest;
  }

  /**
   * World space, inside the camera transform. `length` is the reach from the
   * pivot to the far end of the painting. `ox, oy, f` place set-local points.
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
      const index = (p.variant === 0 || p.variant > 0) ? p.variant : i;
      if (this.jet(ctx, x, y, p.ang || 0, index, length, scale, cover)) any = true;
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
    const ax = spr.w > 0 ? spr.pivot[0] / spr.w : 0;
    const reach = Math.max(0.05, 1 - ax);
    const drawW = length / reach;
    const drawH = drawW * (spr.h > 0 && spr.w > 0 ? spr.h / spr.w : 0.25) * (scale > 0 ? scale : 1);
    const cat = Theme.pulsar;
    const blit = (a) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.globalAlpha = alpha;
      cat.blit(ctx, spr, 0, 0, drawW, drawH);
      ctx.restore();
    };
    blit(ang);
    blit(ang + Math.PI);
    return true;
  }
}
