// Planets or moons named by one index manifest. Each entry points at its
// own manifest. A test entry can be drawn when asked for, and is not picked
// at random.

import { ArtManifest } from "./ArtManifest.js";

export class BodyCatalog {
  constructor(folder) {
    this.folder = folder;
    this.order = [];
    this.byName = new Map();
    this.ready = false;
  }

  async load(root) {
    const res = await fetch(`${root}/${this.folder}/manifest.json`);
    if (!res.ok) throw new Error(String(res.status));
    const meta = await res.json();
    const rows = Array.isArray(meta.types) ? meta.types : [];
    this.order = [];
    this.byName = new Map();
    for (const row of rows) {
      if (!row.type || !row.manifest) continue;
      const art = new ArtManifest(`${root}/${this.folder}/${row.manifest}`);
      if (row.test) art._indexTest = true;
      this.byName.set(row.type, art);
      this.order.push(row.type);
    }
    this.ready = this.order.length > 0;
  }

  names() { return this.order.slice(); }

  playable() {
    return this.order.filter(name => {
      const art = this.byName.get(name);
      return art && !art._indexTest && !(art.raw && art.raw.test);
    });
  }

  has(name) { return this.byName.has(name); }

  get(name) { return this.byName.get(name) || null; }

  /** Stable pick from the playable list. */
  pick(seed) {
    const names = this.playable();
    if (!names.length) return "";
    return names[(seed >>> 0) % names.length];
  }

  warm() {
    for (const name of this.order) this.byName.get(name).start();
  }
}
