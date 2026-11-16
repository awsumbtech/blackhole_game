// One painted body: a manifest plus the layer pictures it names.
// Layers draw in ascending z, each scaled from the body size, centred on the
// anchor. A failed load forgets that it started and tries again after a few
// seconds. Nothing here is generated, tinted, or recoloured.

export class ArtManifest {
  static RETRY_MS = 3000;
  static TIMEOUT_MS = 15000;

  constructor(url) {
    this.url = url;
    this.base = url.replace(/[^/]+$/, "");
    this.raw = null;
    this.layers = [];
    this.ready = false;
    this.started = false;
    this.failedAt = 0;
    this._gen = 0;
    this._timer = 0;
  }

  get type() { return this.raw && this.raw.type; }
  get test() { return !!(this.raw && this.raw.test); }
  get ringed() { return !!(this.raw && this.raw.ringed); }
  get size() { return (this.raw && this.raw.size) || 512; }
  get radiusPx() { return (this.raw && this.raw.radiusPx) || this.size / 2; }
  get anchor() { return (this.raw && this.raw.anchor) || [this.size / 2, this.size / 2]; }

  /** Body world-width whose painted limb sits on `radius`. */
  bodyWidth(radius) {
    return radius * this.size / this.radiusPx;
  }

  start() {
    if (this.ready || this.started) return;
    const now = performance.now();
    if (this.failedAt && now - this.failedAt < ArtManifest.RETRY_MS) return;
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
    this._timer = setTimeout(fail, ArtManifest.TIMEOUT_MS);
    fetch(this.url)
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(meta => {
        if (gen !== this._gen) return;
        this.raw = meta;
        const layers = Array.isArray(meta.layers) ? meta.layers.slice() : [];
        layers.sort((a, b) => (a.z | 0) - (b.z | 0));
        this.layers = layers.map(layer => ({ spec: layer, image: new Image(), ok: false }));
        if (!this.layers.length) { fail(); return; }
        let left = this.layers.length;
        for (const layer of this.layers) {
          const img = layer.image;
          img.onload = () => {
            if (gen !== this._gen) return;
            layer.ok = true;
            if (--left === 0) {
              if (this._timer) { clearTimeout(this._timer); this._timer = 0; }
              this.ready = this.layers.every(l => l.ok);
              if (!this.ready) fail();
            }
          };
          img.onerror = () => fail();
          img.src = this.base + layer.spec.file;
        }
      })
      .catch(() => fail());
  }

  /** Draw every layer centred on the current origin. `body` is the body world width. */
  draw(ctx, body) {
    if (!this.ready || !(body > 0)) return false;
    const size = this.size;
    const ax = (this.anchor[0] / size - 0.5);
    const ay = (this.anchor[1] / size - 0.5);
    for (const layer of this.layers) {
      const scale = layer.spec.scale > 0 ? layer.spec.scale : 1;
      const w = body * scale;
      ctx.drawImage(layer.image, -w / 2 - ax * w, -w / 2 - ay * w, w, w);
    }
    return true;
  }
}
