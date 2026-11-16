// The art theme. The root is `assets` today. Another folder can replace it
// by setting Theme.root before start. Ships, planets, and moons each have
// an index under that root.

import { BodyCatalog } from "./BodyCatalog.js";
import { ShipCatalog } from "./ShipCatalog.js";

export class Theme {
  static root = "assets";
  static ships = ShipCatalog;
  static planets = new BodyCatalog("planets");
  static moons = new BodyCatalog("moons");
  static ready = false;
  static _loading = null;

  /** Load the indexes. Pictures stay lazy. Safe to call again. */
  static start() {
    if (!this._loading) this._loading = this._load();
    return this._loading;
  }

  static async _load() {
    const root = this.root;
    await Promise.all([
      ShipCatalog.load(root),
      this.planets.load(root),
      this.moons.load(root)
    ]);
    this.ready = ShipCatalog.ready && this.planets.ready && this.moons.ready;
  }
}
