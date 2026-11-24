// One folder of named paintings. The manifest lists files, sizes and pivots.
// Pictures are blitted with drawImage. Nothing here is drawn, tinted or recoloured.
// A failed load leaves the catalog unready so Theme can retry. A later success
// replaces the index. A failed retry keeps the previous good index.

export class PictureCatalog {
  constructor(folder) {
    this.folder = folder;
    this.byId = new Map();
    this.order = [];
    this.ready = false;
  }

  async load(root, timeoutMs = 6000) {
    const url = `${root}/${this.folder}/manifest.json`;
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
      const pending = [];
      for (const row of rows) {
        if (!row || !row.id || !row.file) continue;
        const image = new Image();
        image.decoding = "async";
        const spr = {
          id: row.id,
          file: row.file,
          w: row.w > 0 ? row.w : 0,
          h: row.h > 0 ? row.h : 0,
          pivot: Array.isArray(row.pivot) && row.pivot.length >= 2 ? row.pivot : [0, 0],
          image,
          ok: false
        };
        byId.set(row.id, spr);
        order.push(row.id);
        pending.push(new Promise((resolve, reject) => {
          let settled = false;
          const ok = () => {
            if (settled) return;
            settled = true;
            if (!image.naturalWidth) { reject(new Error(row.file)); return; }
            spr.ok = true;
            if (!(spr.w > 0)) spr.w = image.naturalWidth;
            if (!(spr.h > 0)) spr.h = image.naturalHeight;
            resolve();
          };
          const bad = () => {
            if (settled) return;
            settled = true;
            reject(new Error(row.file));
          };
          image.onload = ok;
          image.onerror = bad;
          image.src = `${root}/${this.folder}/${row.file}`;
          if (image.complete) {
            if (image.naturalWidth) ok();
            else bad();
          }
        }));
      }
      if (!order.length) throw new Error("empty");
      let timer = 0;
      await Promise.race([
        Promise.all(pending),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("images")), timeoutMs); })
      ]).finally(() => { if (timer) clearTimeout(timer); });
      this.byId = byId;
      this.order = order;
      this.ready = true;
    } catch {
      if (!this.ready) {
        this.byId = new Map();
        this.order = [];
      }
    }
  }

  names() { return this.order.slice(); }

  sprite(id) {
    if (!this.ready) return null;
    const spr = this.byId.get(id);
    return spr && spr.ok ? spr : null;
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
}
