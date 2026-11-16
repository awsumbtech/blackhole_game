// The ship classes named by the theme's ship manifest. Order, extent, and
// look count come from that file and each class's sheet JSON. A class marked
// test is drawn when asked for, and is not part of the random ladder.

export class ShipCatalog {
  static order = [];
  static byName = new Map();
  static ready = false;

  static async load(root) {
    const res = await fetch(`${root}/ships/manifest.json`);
    if (!res.ok) throw new Error(String(res.status));
    const meta = await res.json();
    const rows = Array.isArray(meta.classes) ? meta.classes : [];
    const order = [];
    const byName = new Map();
    await Promise.all(rows.map(async row => {
      const name = row.class;
      if (!name) return;
      let looks = 8;
      try {
        const spec = await fetch(`${root}/ships/${name}.json`);
        if (spec.ok) {
          const json = await spec.json();
          if (json.rows > 0) looks = json.rows | 0;
        }
      } catch { /* the sheet loader retries the picture; the look count can wait */ }
      byName.set(name, { name, extent: row.extent > 0 ? row.extent : 1.45, test: !!row.test, looks });
      order.push(name);
    }));
    // Preserve the manifest's order (Promise.all does not).
    this.order = rows.map(row => row.class).filter(name => byName.has(name));
    this.byName = byName;
    this.ready = this.order.length > 0;
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
   * Class for a tier. The bands are the same shape as before: early tiers
   * pick among the first classes, and the open end of the ladder is whatever
   * class the manifest lists last. Adding a class extends that end.
   */
  static classFor(tier, big = false, roll = Math.random()) {
    const names = this.playable();
    const n = names.length;
    if (!n) return "";
    const last = n - 1;
    const t = tier | 0;
    let i = t <= 2 ? (roll < 0.6 ? 0 : 1) : t === 3 ? (roll < 0.55 ? 1 : 2) : t <= 5 ? (roll < 0.6 ? 2 : 3) : t <= 7 ? 3 : last;
    i = Math.max(0, Math.min(last, i));
    if (big) i = Math.min(last, i + 1);
    return names[i];
  }

  static adopt(e, tier, wreck, big = false, roll = Math.random()) {
    e.ship = this.classFor(tier, big, roll);
    const n = this.looks(e.ship);
    e.look = (Math.random() * n) | 0;
    this.setWreck(e, wreck);
  }

  static setWreck(e, wreck) {
    e.wreck = !!wreck;
    e.steer = !wreck;
    e.rotSpeed = wreck ? (Math.random() - 0.5) * 0.0024 : 0;
    if (!wreck) e.rotation = Math.atan2(e.vy, e.vx);
    e._artBase = null; e._sp = null;
  }

  static upgrade(e) {
    const names = this.playable();
    const i = names.indexOf(e.ship);
    if (i >= 0 && i < names.length - 1) {
      e.ship = names[i + 1];
      e._artBase = null; e._sp = null;
    }
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
   * a real class. Otherwise the seed picks a class. The plate is the index.
   */
  static scrapFrom(parent, index) {
    const names = this.order.length ? this.order : [];
    const cls = names.includes(parent.ship)
      ? parent.ship
      : names[((parent.seed | 0) >>> 0) % Math.max(1, names.length)] || "";
    const n = this.looks(cls);
    const lookSrc = parent.look >= 0 ? parent.look : ((parent.seed | 0) >>> 3);
    const look = ((lookSrc % n) + n) % n;
    const plate = ((index % 4) + 4) % 4;
    return { cls, look, plate };
  }
}
