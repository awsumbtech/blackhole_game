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
    this.debris = [];
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

  /** file name -> relative painted size, from the folder's PROVENANCE.json. */
  setPieceSizes(byFile) { this._pieceSizes = byFile || null; }

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
        const listed = Array.isArray(meta.layers) ? meta.layers.slice() : [];
        const debrisSpecs = [];
        const drawSpecs = [];
        for (const layer of listed) {
          if (/^debris\d+$/.test(layer.role || "")) debrisSpecs.push(layer);
          else drawSpecs.push(layer);
        }
        if (Array.isArray(meta.debris)) {
          meta.debris.forEach((item, i) => {
            const file = typeof item === "string" ? item : item && item.file;
            if (file) debrisSpecs.push({ role: "debris" + i, file, z: 0, scale: 1 });
          });
        }
        drawSpecs.sort((a, b) => (a.z | 0) - (b.z | 0));
        const pictures = specs => specs.map(spec => {
          const rel = this._pieceSizes && this._pieceSizes.get(spec.file);
          return { spec, image: new Image(), ok: false, relSize: rel > 0 ? rel : 1 };
        });
        this.layers = pictures(drawSpecs);
        this.debris = pictures(debrisSpecs);
        const all = this.layers.concat(this.debris);
        if (!this.layers.length) { fail(); return; }
        let left = all.length;
        for (const layer of all) {
          const img = layer.image;
          img.onload = () => {
            if (gen !== this._gen) return;
            layer.ok = true;
            if (--left === 0) {
              if (this._timer) { clearTimeout(this._timer); this._timer = 0; }
              this.ready = all.every(l => l.ok);
              if (!this.ready) fail();
            }
          };
          img.onerror = () => fail();
          img.src = this.base + layer.spec.file;
        }
      })
      .catch(() => fail());
  }

  /** Draw body and ring layers only. Debris roles are bite pieces, not the body. */
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

  /** Painted bite pieces, when the manifest lists them. Otherwise null. */
  debrisFrames() {
    if (!this.ready || !this.debris.length) return null;
    if (!this.debris.every(d => d.ok)) return null;
    return this.debris.map(d => ({
      image: d.image,
      sx: 0,
      sy: 0,
      sw: d.image.naturalWidth,
      sh: d.image.naturalHeight,
      relSize: d.relSize > 0 ? d.relSize : 1
    }));
  }
}
