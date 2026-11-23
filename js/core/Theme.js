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
  static TIMEOUT_MS = 6000;
  static RETRY_MS = 2000;
  static _loading = null;
  static _retry = 0;

  /**
   * Load the indexes. Pictures stay lazy. Safe to call again.
   * Never rejects: a missing or hanging index is retried, and boot can
   * continue to the title or play screen.
   */
  static start() {
    if (this.ready) return Promise.resolve();
    if (this._loading) return this._loading;
    const attempt = this._loadSafe();
    this._loading = attempt;
    return attempt;
  }

  static async _loadSafe() {
    try {
      await this._load();
    } catch {
      this.ready = false;
    }
    // Clear the in-flight handle, including a rejected attempt, so the
    // next start() or the scheduled retry actually fetches again.
    this._loading = null;
    if (!this.ready) this._scheduleRetry();
  }

  static _scheduleRetry() {
    if (this._retry) return;
    this._retry = setTimeout(() => {
      this._retry = 0;
      this.start();
    }, this.RETRY_MS);
  }

  static async _load() {
    const root = this.root;
    const ms = this.TIMEOUT_MS;
    await Promise.race([
      Promise.all([
        ShipCatalog.load(root, ms),
        this.planets.load(root, ms),
        this.moons.load(root, ms)
      ]),
      new Promise((_, reject) => setTimeout(() => reject(new Error("theme timeout")), ms))
    ]);
    this.ready = ShipCatalog.ready && this.planets.ready && this.moons.ready;
  }
}
