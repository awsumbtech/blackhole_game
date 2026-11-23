// The ship classes named by the theme's ship manifest. Order, extent, and
// look count come from that file and each class's sheet JSON. A class marked
// test is drawn when asked for, and is not part of the random ladder.
// Tier bands come from the same index (the `tiers` list).

export class ShipCatalog {
  static order = [];
  static byName = new Map();
  static tiers = [];
  static ready = false;

  static async load(root, timeoutMs = 6000) {
    try {
      const opts = typeof AbortSignal !== "undefined" && AbortSignal.timeout
        ? { signal: AbortSignal.timeout(timeoutMs) }
        : undefined;
      const res = await fetch(`${root}/ships/manifest.json`, opts);
      if (!res.ok) throw new Error(String(res.status));
      const meta = await res.json();
      const rows = Array.isArray(meta.classes) ? meta.classes : [];
      const byName = new Map();
      await Promise.all(rows.map(async row => {
        const name = row.class;
        if (!name) return;
        let looks = 8;
        try {
          const spec = await fetch(`${root}/ships/${name}.json`, opts);
          if (spec.ok) {
            const json = await spec.json();
            if (json.rows > 0) looks = json.rows | 0;
          }
        } catch { /* the sheet loader retries the picture; the look count can wait */ }
        byName.set(name, { name, extent: row.extent > 0 ? row.extent : 1.45, test: !!row.test, looks });
      }));
      // Preserve the manifest's order (Promise.all does not).
      this.order = rows.map(row => row.class).filter(name => byName.has(name));
      this.byName = byName;
      this.tiers = Array.isArray(meta.tiers) ? meta.tiers.slice() : [];
      this.ready = this.order.length > 0;
    } catch {
      this.order = [];
      this.byName = new Map();
      this.tiers = [];
      this.ready = false;
    }
  }

  static names() { return this.order.slice(); }

  /** Classes the random ladder uses. Test entries stay out of it. */
  static playable() {
    return this.order.filter(name => !this.byName.get(name).test);
  }

  static has(name) { return this.byName.has(name); }

  static extent(name) {
    const row = this.byName.get(name);
    if (row) return row.extent;
    // A crumb is not a class. 1.2 is the old scrap size, smaller than a hull.
    return name === "scrap" ? 1.2 : 1.45;
  }

  static looks(name) {
    const row = this.byName.get(name);
    return row && row.looks > 0 ? row.looks : 8;
  }

  /**
   * Class for a tier. Bands come from the ship index (`tiers`). A named
   * `class` in a band stays that class even when a new entry is added.
   * Without bands, later tiers use the last playable class.
   */
  static classFor(tier, big = false, roll = Math.random()) {
    const names = this.playable();
    const n = names.length;
    if (!n) return "";
    const last = n - 1;
    const t = tier | 0;
    let i = this._bandIndex(t, roll, names);
    i = Math.max(0, Math.min(last, i));
    if (big) i = Math.min(last, i + 1);
    return names[i];
  }

  static _bandIndex(t, roll, names) {
    const bands = this.tiers;
    if (bands && bands.length) {
      let band = null;
      for (const row of bands) {
        if (row.max == null || t <= (row.max | 0)) { band = row; break; }
      }
      if (!band) band = bands[bands.length - 1];
      if (band.class && names.includes(band.class)) return names.indexOf(band.class);
      const base = Number.isInteger(band.i) ? band.i : 0;
      const p = band.p;
      if (p > 0 && roll >= p) return base + 1;
      return base;
    }
    // Derive if the index has no bands: early tiers walk the first classes,
    // and the open end is the last playable class.
    const last = names.length - 1;
    if (t <= 2) return roll < 0.6 ? 0 : Math.min(1, last);
    if (t === 3) return roll < 0.55 ? Math.min(1, last) : Math.min(2, last);
    if (t <= 5) return roll < 0.6 ? Math.min(2, last) : Math.min(3, last);
    if (t <= 7) return Math.min(3, last);
    return last;
  }

  static adopt(e, tier, wreck, big = false, roll = Math.random()) {
    e._shipTier = tier | 0;
    e._shipBig = !!big;
    e._shipRoll = roll;
    const name = this.classFor(tier, big, roll);
    e.ship = name || "";
    if (e.ship && !(e.look >= 0)) e.look = (Math.random() * this.looks(e.ship)) | 0;
    this.setWreck(e, wreck);
  }

  /**
   * If this craft was spawned before the ship index loaded (`e.ship` empty),
   * pick its class once the catalog is ready, the same way Body.art() picks
   * a type. Already-named crafts, including scraps, are left alone.
   */
  static ensure(e, state) {
    if (e.ship) return e.ship;
    if (!this.ready) return "";
    const tier = e._shipTier != null ? e._shipTier : ((state && state.tier) | 0);
    const big = !!e._shipBig;
    const roll = e._shipRoll != null ? e._shipRoll : (((e.seed | 0) >>> 0) / 4294967296);
    const wreck = !!e.wreck;
    this.adopt(e, tier, wreck, big, roll);
    if (e._shipUpgrade) this.upgrade(e);
    return e.ship || "";
  }

  static setWreck(e, wreck) {
    e.wreck = !!wreck;
    e.steer = !wreck;
    e.rotSpeed = wreck ? (Math.random() - 0.5) * 0.0024 : 0;
    if (!wreck) e.rotation = Math.atan2(e.vy, e.vx);
    e._artBase = null; e._sp = null;
  }

  static upgrade(e) {
    if (!e.ship) { e._shipUpgrade = true; return; }
    const names = this.playable();
    const i = names.indexOf(e.ship);
    if (i >= 0 && i < names.length - 1) {
      e.ship = names[i + 1];
      e._artBase = null; e._sp = null;
    }
    e._shipUpgrade = false;
  }

  /** The class before this one in the manifest. The first class stays put. */
  static below(name) {
    const names = this.order;
    const i = names.indexOf(name);
    if (i <= 0) return names[0] || "";
    return names[i - 1];
  }

  /**
   * A crumb torn off `parent`. Class and look come from that hull when it is
   * a real class. Otherwise the seed picks a playable class (never a test
   * entry such as the courier). The plate is the index.
   */
  static scrapFrom(parent, index) {
    const known = this.names();
    const playable = this.playable();
    const cls = known.includes(parent.ship)
      ? parent.ship
      : playable[((parent.seed | 0) >>> 0) % Math.max(1, playable.length)] || "";
    const n = this.looks(cls);
    const lookSrc = parent.look >= 0 ? parent.look : ((parent.seed | 0) >>> 3);
    const look = ((lookSrc % n) + n) % n;
    const plate = ((index % 4) + 4) % 4;
    return { cls, look, plate };
  }
}
