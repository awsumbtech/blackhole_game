// Debris Reef beds. One instance per reef entry. It blits a painted bed
// from assets/reef and nothing else: no glow canvas, no tint, no fallback
// disc. The bed fades with the reef's haze and merge, and breathes with
// the galaxy. A missing picture draws nothing.

import { MERGE_FRAMES } from "../depth.js";
import { Theme } from "./Theme.js";

export class ReefBed {
  static MERGE = MERGE_FRAMES;

  constructor(reef) { this.reef = reef; }

  /** One bed for this reef entry. A second attach returns the same bed. */
  static attach(reef) {
    if (!reef) return null;
    if (!reef.bed) reef.bed = new ReefBed(reef);
    return reef.bed;
  }

  /** The bed leaves with the reef. The entry itself is what the world drops. */
  static release(reef) {
    if (reef) reef.bed = null;
  }

  static releaseList(list) {
    if (!list) return;
    for (let i = 0; i < list.length; i++) this.release(list[i]);
  }

  /** Drop every bed this world still holds, including sets that have receded. */
  static releaseWorld(world) {
    if (!world) return;
    this.releaseList(world.reefs);
    const old = world.old;
    if (old) {
      for (let i = 0; i < old.length; i++) this.releaseList(old[i] && old[i].reefs);
    }
    const same = world.same;
    if (same) {
      for (let i = 0; i < same.length; i++) this.releaseList(same[i] && same[i].reefs);
    }
  }

  /**
   * Bed ids in manifest order. A variants row with a bed id is included
   * when it is not already a role "bed" sprite, so a third bed is data.
   */
  static bedIds() {
    const cat = Theme.reef;
    const ids = cat.idsByRole("bed").slice();
    const rows = cat.variants();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const id = row && (row.bed || row.id);
      if (id && ids.indexOf(id) < 0) ids.push(id);
    }
    const meta = cat.meta();
    const extra = meta && Array.isArray(meta.variants) ? meta.variants : [];
    for (let i = 0; i < extra.length; i++) {
      const row = extra[i];
      const id = row && (row.bed || row.id);
      if (id && ids.indexOf(id) < 0) ids.push(id);
    }
    return ids;
  }

  static bedId(index) {
    const ids = this.bedIds();
    if (!ids.length) return "";
    return ids[(index >>> 0) % ids.length];
  }

  static _smooth(t) {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  }

  static _onScreen(state, x, y, r, vw, vh) {
    return Math.abs(x - state.camX) < vw / 2 + r && Math.abs(y - state.camY) < vh / 2 + r;
  }

  /**
   * Draw every bed in this set. `cover` is the receding-set fade (1 live).
   * World positions stay in the caller's base-unit frame (`world.ox/f`).
   */
  static drawSet(ctx, reefs, world, state, fx, vw, vh, cover) {
    if (!reefs || !world || !state || !(cover > 0)) return false;
    const ids = this.bedIds();
    if (!ids.length) return false;
    let any = false;
    for (let i = 0; i < reefs.length; i++) {
      const bed = this.attach(reefs[i]);
      if (bed && bed.draw(ctx, i, ids, world, state, fx, vw, vh, cover)) any = true;
    }
    return any;
  }

  /**
   * Soft screen blend of one painted bed. Haze stays dim. A reef that just
   * merged fades up over MERGE_FRAMES. Breath only changes opacity.
   */
  draw(ctx, index, ids, world, state, fx, vw, vh, cover) {
    const rf = this.reef;
    if (!rf) return false;
    const f = world.f || 1;
    const x = world.ox + rf.x * f;
    const y = world.oy + rf.y * f;
    const r = rf.r * f;
    if (!ReefBed._onScreen(state, x, y, r * 1.4, vw, vh)) return false;
    const list = ids && ids.length ? ids : ReefBed.bedIds();
    if (!list.length) return false;
    const id = list[(index >>> 0) % list.length];
    const spr = Theme.reef.sprite(id);
    if (!spr) return false;
    const breath = fx && fx.breath > 0 ? fx.breath : 0;
    const q = rf.haze ? 0.3 : ReefBed._smooth(((world.timer || 0) - (rf.born || 0)) / ReefBed.MERGE);
    const a = cover * (0.75 + breath * 0.15) * q;
    if (!(a > 0.005) || !(r > 0)) return false;
    const d = r * 2.8;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = a;
    Theme.reef.blit(ctx, spr, x, y, d, d);
    ctx.restore();
    return true;
  }
}
