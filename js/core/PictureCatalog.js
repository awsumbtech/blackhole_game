// One folder of named paintings. The index lists files, roles, sizes and pivots.
// Each picture loads on its own. A missing sibling does not hide the ones that
// decoded, and a failed picture tries again with backoff. Nothing here is
// drawn, tinted or recoloured.

export class PictureCatalog {
  static NONE = [];
  constructor(folder) {
    this.folder = folder;
    this.byId = new Map();
    this.order = [];
    this._byRole = new Map();
    this.ready = false;
    this._meta = null;
    this._root = "assets";
    this._gen = 0;
  }

  async load(root, timeoutMs = 6000) {
    const url = `${root}/${this.folder}/index.json`;
    try {
      const opts = typeof AbortSignal !== "undefined" && AbortSignal.timeout
        ? { signal: AbortSignal.timeout(timeoutMs) }
        : undefined;
      const res = await fetch(url, opts);
      if (!res.ok) throw new Error(String(res.status));
      const meta = await res.json();
      const rows = Array.isArray(meta.sprites) ? meta.sprites : [];
      const byId = new Map();
      const order = [];
      const byRole = new Map();
      for (const row of rows) {
        if (!row || !row.id || !row.file) continue;
        const image = new Image();
        image.decoding = "async";
        const role = row.role || "";
        const profile = Array.isArray(row.hitProfile)
          ? row.hitProfile.filter(p => p && p.length >= 2).map(p => [p[0], p[1]])
          : null;
        byId.set(row.id, {
          id: row.id,
          role,
          file: row.file,
          w: row.w > 0 ? row.w : 0,
          h: row.h > 0 ? row.h : 0,
          pivot: Array.isArray(row.pivot) && row.pivot.length >= 2 ? row.pivot : [0, 0],
          visibleEndX: row.visibleEndX > 0 ? row.visibleEndX : 0,
          hitProfile: profile && profile.length ? profile : null,
          axis: typeof row.axis === "number" ? row.axis : null,
          ringRadiusPx: row.ringRadiusPx > 0 ? row.ringRadiusPx : 0,
          sizePx: row.sizePx > 0 ? row.sizePx : 0,
          image,
          ok: false,
          failed: false,
          tries: 0,
          retry: 0
        });
        order.push(row.id);
        let list = byRole.get(role);
        if (!list) { list = []; byRole.set(role, list); }
        list.push(row.id);
      }
      if (!order.length) throw new Error("empty");
      this._cancelRetries();
      this._gen++;
      const gen = this._gen;
      this._root = root;
      this._meta = meta;
      this.byId = byId;
      this.order = order;
      this._byRole = byRole;
      await Promise.all(order.map(id => this._attempt(byId.get(id), gen, timeoutMs)));
      this.ready = true;
    } catch {
      if (!this.ready) {
        this._cancelRetries();
        this.byId = new Map();
        this.order = [];
        this._byRole = new Map();
        this._meta = null;
      }
    }
  }

  _cancelRetries() {
    for (const spr of this.byId.values()) {
      if (spr.retry) { clearTimeout(spr.retry); spr.retry = 0; }
    }
  }

  /** One attempt. Always settles. A failure schedules its own retry. */
  _attempt(spr, gen, timeoutMs) {
    return new Promise(resolve => {
      if (gen !== this._gen) { resolve(); return; }
      const image = new Image();
      image.decoding = "async";
      spr.image = image;
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        if (gen !== this._gen) { resolve(); return; }
        spr.ok = !!ok;
        spr.failed = !ok;
        if (ok) {
          if (!(spr.w > 0)) spr.w = image.naturalWidth;
          if (!(spr.h > 0)) spr.h = image.naturalHeight;
          if (spr.retry) { clearTimeout(spr.retry); spr.retry = 0; }
        } else {
          this._scheduleRetry(spr, gen);
        }
        resolve();
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      image.onload = () => { clearTimeout(timer); finish(image.naturalWidth > 0); };
      image.onerror = () => { clearTimeout(timer); finish(false); };
      image.src = `${this._root}/${this.folder}/${spr.file}`;
      if (image.complete) {
        clearTimeout(timer);
        finish(image.naturalWidth > 0);
      }
    });
  }

  _scheduleRetry(spr, gen) {
    if (gen !== this._gen) return;
    if (spr.retry) clearTimeout(spr.retry);
    spr.tries++;
    const wait = Math.min(30000, 2000 * Math.pow(2, spr.tries - 1));
    spr.retry = setTimeout(() => {
      spr.retry = 0;
      if (gen !== this._gen || spr.ok) return;
      this._attempt(spr, gen, 6000);
    }, wait);
  }

  names() { return this.order.slice(); }

  meta() { return this._meta; }

  variants() {
    const rows = this._meta && Array.isArray(this._meta.variants) ? this._meta.variants : [];
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || typeof row !== "object") continue;
      // Comet rows name a coma, a nucleus, and a tail. Any other catalog
      // lists a variant by id, so a new row is visible with no code change.
      if (row.coma || row.nucleus || row.tail) {
        if (row.coma && row.nucleus && row.tail) out.push(row);
        continue;
      }
      if (row.id) out.push(row);
    }
    return out;
  }

  /** Manifest order. Includes a picture that has not decoded yet. */
  idsByRole(role) {
    return this._byRole.get(role) || PictureCatalog.NONE;
  }

  has(id) {
    const spr = this.byId.get(id);
    return !!(spr && spr.ok && spr.image && spr.image.naturalWidth);
  }

  sprite(id) {
    return this.has(id) ? this.byId.get(id) : null;
  }

  /**
   * Blit so the pivot sits on (x, y). w and h are the destination size.
   * The caller sets alpha and rotation. This only calls drawImage.
   */
  blit(ctx, spr, x, y, w, h) {
    if (!spr || !spr.ok || !(w > 0) || !(h > 0)) return false;
    const ax = spr.w > 0 ? spr.pivot[0] / spr.w : 0.5;
    const ay = spr.h > 0 ? spr.pivot[1] / spr.h : 0.5;
    ctx.drawImage(spr.image, x - ax * w, y - ay * h, w, h);
    return true;
  }

  /**
   * One source rectangle of a painting. The caller sets alpha and rotation.
   * This only calls drawImage. No tint and no second canvas.
   */
  blitSlice(ctx, spr, sx, sy, sw, sh, x, y, w, h) {
    if (!spr || !spr.ok || !(sw > 0) || !(sh > 0) || !(w > 0) || !(h > 0)) return false;
    ctx.drawImage(spr.image, sx, sy, sw, sh, x, y, w, h);
    return true;
  }
}
