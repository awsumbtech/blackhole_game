// The art theme. The root is `assets` today. Another folder can replace it
// by setting Theme.root before start. Ships, planets, moons, comets, rocks,
// dust, the current, and the radar each have an index under that root.

import { BodyCatalog } from "./BodyCatalog.js";
import { PictureCatalog } from "./PictureCatalog.js";
import { ShipCatalog } from "./ShipCatalog.js";

export class Theme {
  static root = "assets";
  static ships = ShipCatalog;
  static planets = new BodyCatalog("planets");
  static moons = new BodyCatalog("moons");
  static comets = new PictureCatalog("comets");
  static rocks = new PictureCatalog("rocks");
  static dust = new PictureCatalog("dust");
  static current = new PictureCatalog("current");
  static radar = new PictureCatalog("hud/radar");
  static ready = false;
  static TIMEOUT_MS = 6000;
  static RETRY_MS = 2000;
  static RETRY_MAX_MS = 30000;
  static _loading = null;
  static _retry = 0;
  static _retryWait = 2000;
  static _onlineBound = false;
  static _raceTimer = 0;

  /**
   * Load the indexes. Pictures stay lazy. Safe to call again.
   * Never rejects: a missing or hanging index is retried, and boot can
   * continue to the title or play screen.
   */
  static start() {
    this._listenOnline();
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
    if (this.ready) this._retryWait = this.RETRY_MS;
    else this._scheduleRetry();
  }

  static _scheduleRetry() {
    if (this._retry) return;
    const wait = this._retryWait || this.RETRY_MS;
    this._retry = setTimeout(() => {
      this._retry = 0;
      this._retryWait = Math.min((this._retryWait || this.RETRY_MS) * 2, this.RETRY_MAX_MS);
      this.start();
    }, wait);
  }

  /** Retry as soon as the network is back, without waiting out the backoff. */
  static _listenOnline() {
    if (this._onlineBound || typeof window === "undefined" || !window.addEventListener) return;
    this._onlineBound = true;
    window.addEventListener("online", () => {
      if (this.ready) return;
      if (this._retry) { clearTimeout(this._retry); this._retry = 0; }
      this._retryWait = this.RETRY_MS;
      this.start();
    });
  }

  static async _load() {
    const root = this.root;
    const ms = this.TIMEOUT_MS;
    let timer = 0;
    try {
      await Promise.race([
        Promise.all([
          ShipCatalog.load(root, ms),
          this.planets.load(root, ms),
          this.moons.load(root, ms),
          this.comets.load(root, ms),
          this.rocks.load(root, ms),
          this.dust.load(root, ms),
          this.current.load(root, ms),
          this.radar.load(root, ms)
        ]),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("theme timeout")), ms);
          this._raceTimer = timer;
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      if (this._raceTimer === timer) this._raceTimer = 0;
    }
    this.ready = ShipCatalog.ready && this.planets.ready && this.moons.ready
      && this.comets.ready && this.rocks.ready && this.dust.ready
      && this.current.ready && this.radar.ready;
  }
}
