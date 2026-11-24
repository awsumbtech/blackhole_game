// A painted neutron core. Forge landmarks and type "neutron" food share this.
// The index order is the look: the first variant is the cool lighthouse, the
// next is the ember pulsar, and any later row is used the same way. No gradient,
// no tint, and nothing is drawn until that picture has decoded.

import { Theme } from "./Theme.js";

export class NeutronStar {
  static ROLE = "core";
  /** Drawn diameter, in entity radii. The painting includes its own ring and glow. */
  static SPAN = 5.6;
  static owned = new WeakMap();

  constructor(e) { this.e = e; }

  static for(e) {
    let s = NeutronStar.owned.get(e);
    if (!s) { s = new NeutronStar(e); NeutronStar.owned.set(e, s); }
    return s;
  }

  /**
   * Variant ids in manifest order. A new core in the neutron index is used
   * with no change here.
   */
  static ids() {
    const cat = Theme.neutron;
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

  static idAt(index) {
    const ids = this.ids();
    if (!ids.length) return "";
    const n = ids.length;
    return ids[((index % n) + n) % n];
  }

  /** Landmarks pin `look`. Food uses the seed, so every variant stays reachable. */
  static idFor(e) {
    if (e && e.look >= 0) return this.idAt(e.look);
    return this.idAt(e && e.seed ? (e.seed >>> 0) : 0);
  }

  static indexFor(e) {
    const ids = this.ids();
    if (!ids.length) return 0;
    const id = this.idFor(e);
    const at = ids.indexOf(id);
    return at >= 0 ? at : 0;
  }

  /** Named core id, otherwise the pulsar's variant index. */
  static landmarkIndex(p, fallback) {
    const ids = this.ids();
    if (p && p.core && ids.indexOf(p.core) >= 0) return ids.indexOf(p.core);
    if (p && (p.variant === 0 || p.variant > 0)) return p.variant;
    return fallback || 0;
  }

  /** Bite pieces are the same painting. Missing art leaves no pieces. */
  static debrisFrames(e) {
    const spr = Theme.neutron.sprite(this.idFor(e));
    if (!spr || !spr.image) return null;
    const image = spr.image;
    const frame = (rel) => ({
      image, sx: 0, sy: 0, sw: image.naturalWidth, sh: image.naturalHeight, relSize: rel
    });
    return [frame(0.62), frame(0.42), frame(0.5), frame(0.34)];
  }

  /**
   * Centre the painting on (x, y). `r` is the core radius. `index` picks the
   * variant. `breath` (0..1) is the calm pulse; omit it to hold still.
   * `ang` turns a landmark so its baked polar jets (manifest `axis`) track
   * the sweeping beam. Food omits `ang` and stays as painted.
   */
  static paint(ctx, x, y, r, alpha, index, breath, ang) {
    if (!(alpha > 0) || !(r > 0)) return false;
    const id = this.idAt(index);
    if (!id) return false;
    const spr = Theme.neutron.sprite(id);
    if (!spr) return false;
    let a = alpha;
    let rr = r;
    if (typeof breath === "number") {
      a *= 0.9 + breath * 0.1;
      rr *= 0.98 + breath * 0.04;
    }
    const d = rr * this.SPAN;
    ctx.save();
    ctx.translate(x, y);
    if (typeof ang === "number" && typeof spr.axis === "number") ctx.rotate(ang - spr.axis);
    ctx.globalAlpha = a;
    Theme.neutron.blit(ctx, spr, 0, 0, d, d);
    ctx.restore();
    return true;
  }

  /**
   * Forge landmarks. Each pulsar's `variant` is its row. `ox, oy, f` are the
   * set transform. Off-screen cores are skipped; the jets are not this class.
   */
  static landmarks(ctx, pulsars, cover, breath, ox, oy, f, camX, camY, vw, vh) {
    if (!pulsars || !pulsars.length || !(cover > 0.02)) return false;
    let any = false;
    for (let i = 0; i < pulsars.length; i++) {
      const p = pulsars[i];
      const x = ox + p.x * f;
      const y = oy + p.y * f;
      const r = (p.art && p.art.radius > 0 ? p.art.radius : 0) * f;
      if (!(r > 0)) continue;
      if (Math.abs(x - camX) > vw * 0.5 + r * 6) continue;
      if (Math.abs(y - camY) > vh * 0.5 + r * 6) continue;
      const index = this.landmarkIndex(p, i);
      if (this.paint(ctx, x, y, r, cover, index, breath, p.ang || 0)) any = true;
    }
    return any;
  }

  /** Play-field food. `breath` is optional. */
  draw(ctx, x, y, r, alpha, breath) {
    const index = this.e && this.e.look >= 0 ? this.e.look : ((this.e && this.e.seed) >>> 0);
    return NeutronStar.paint(ctx, x, y, r, alpha, index, breath);
  }
}
