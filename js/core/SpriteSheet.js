// One painted sheet: a picture plus the JSON that names its frames.
// The load starts when a galaxy that uses the sheet starts, and a frame
// draws nothing until the picture has decoded. A failed load forgets that
// it started, then tries again a few seconds later. Nothing here is generated.

export class SpriteSheet {
  static sheets = new Map();
  static RETRY_MS = 3000;
  static TIMEOUT_MS = 15000;

  /** The one sheet for this class name. */
  static for(name) {
    let s = SpriteSheet.sheets.get(name);
    if (!s) { s = new SpriteSheet(name); SpriteSheet.sheets.set(name, s); }
    return s;
  }

  constructor(name) {
    this.name = name;
    this.frame = 0;
    this.cols = [];
    this.rows = 0;
    this.image = new Image();
    this.ready = false;
    this.started = false;
    this.failedAt = 0;
    this._gen = 0;
    this._timer = 0;
  }

  /** Begin the fetch. Returns immediately. A recent failure waits out the backoff. */
  start() {
    if (this.ready || this.started) return;
    const now = performance.now();
    if (this.failedAt && now - this.failedAt < SpriteSheet.RETRY_MS) return;
    this.started = true;
    const gen = ++this._gen;
    const fail = () => {
      if (gen !== this._gen || this.ready) return;
      this.ready = false;
      this.started = false;
      this.failedAt = performance.now();
      if (this._timer) { clearTimeout(this._timer); this._timer = 0; }
      this._gen++;
    };
    this._timer = setTimeout(fail, SpriteSheet.TIMEOUT_MS);
    const name = this.name;
    fetch(`assets/ships/${name}.json`)
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(meta => {
        if (gen !== this._gen) return;
        this.frame = meta.frame | 0;
        this.cols = Array.isArray(meta.cols) ? meta.cols : [];
        this.rows = meta.rows | 0;
        const img = new Image();
        this.image = img;
        img.onload = () => {
          if (gen !== this._gen) return;
          if (this._timer) { clearTimeout(this._timer); this._timer = 0; }
          this.ready = this.frame > 0 && this.cols.length > 0;
          if (!this.ready) fail();
        };
        img.onerror = () => fail();
        img.src = `assets/ships/${name}.webp`;
      })
      .catch(() => fail());
  }

  /** Source rect of one frame, or null when the picture is not ready. */
  frameRect(colName, row) {
    if (!this.ready) return null;
    const col = this.cols.indexOf(colName);
    const r = row | 0;
    if (col < 0 || r < 0 || r >= this.rows || !(this.frame > 0)) return null;
    const f = this.frame;
    return { image: this.image, sx: col * f, sy: r * f, sw: f, sh: f };
  }

  /**
   * Draw one frame centred on the current origin, at `size` world units.
   * `colName` is a column in the sheet JSON. Returns false when the picture
   * is not ready, so the caller leaves the craft undrawn.
   */
  draw(ctx, colName, row, size) {
    if (!(size > 0)) return false;
    const rect = this.frameRect(colName, row);
    if (!rect) return false;
    ctx.drawImage(rect.image, rect.sx, rect.sy, rect.sw, rect.sh, -size / 2, -size / 2, size, size);
    return true;
  }
}
