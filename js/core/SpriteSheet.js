// One painted sheet: a picture plus the JSON that names its frames.
// The load starts when a galaxy that uses the sheet starts, and a frame
// draws nothing until the picture has decoded. Nothing here is generated.

const sheets = new Map();

export class SpriteSheet {
  constructor(name) {
    this.name = name;
    this.frame = 0;
    this.cols = [];
    this.rows = 0;
    this.image = new Image();
    this.ready = false;
    this.started = false;
  }

  /** Begin the fetch. Returns immediately. Safe to call again. */
  start() {
    if (this.started) return;
    this.started = true;
    const name = this.name;
    fetch(`assets/ships/${name}.json`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(meta => {
        this.frame = meta.frame | 0;
        this.cols = Array.isArray(meta.cols) ? meta.cols : [];
        this.rows = meta.rows | 0;
        this.image.onload = () => { this.ready = this.frame > 0 && this.cols.length > 0; };
        this.image.onerror = () => { this.ready = false; };
        this.image.src = `assets/ships/${name}.webp`;
      })
      .catch(() => { this.ready = false; });
  }

  /**
   * Draw one frame centred on the current origin, at `size` world units.
   * `colName` is a column in the sheet JSON. Returns false when the picture
   * is not ready, so the caller leaves the craft undrawn.
   */
  /** Source rect of one frame, or null when the picture is not ready. */
  frameRect(colName, row) {
    if (!this.ready) return null;
    const col = this.cols.indexOf(colName);
    const r = row | 0;
    if (col < 0 || r < 0 || r >= this.rows || !(this.frame > 0)) return null;
    const f = this.frame;
    return { image: this.image, sx: col * f, sy: r * f, sw: f, sh: f };
  }

  draw(ctx, colName, row, size) {
    if (!(size > 0)) return false;
    const rect = this.frameRect(colName, row);
    if (!rect) return false;
    ctx.drawImage(rect.image, rect.sx, rect.sy, rect.sw, rect.sh, -size / 2, -size / 2, size, size);
    return true;
  }
}

export function sheetFor(name) {
  let s = sheets.get(name);
  if (!s) { s = new SpriteSheet(name); sheets.set(name, s); }
  return s;
}
