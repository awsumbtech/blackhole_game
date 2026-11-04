// ─── PerfMonitor ───
// Work time per frame (not the vsync interval). At 120Hz the budget is 8.3ms;
// on Auto, if the average stays above ~6.5ms for 2s we drop to Lite.
// Also watches the real frame interval against the display's own vsync (the
// fastest interval seen lately) to catch GPU-bound slowdowns JS timing misses.

import { getArtQuality, artStats } from "../art.js";

export class PerfMonitor {
  constructor(game) {
    this.game = game;
    this.state = game.state;
    this.p = { ema: 0, ring: new Float32Array(240), n: 0, over: 0, drops: 0, vsync: 0, iEma: 0, slow: 0, grace: 0 };
  }

  // v9: a new galaxy paints its sprites in the first few seconds; don't judge the device on that warm-up
  grace() { const p = this.p; p.grace = 300; p.slow = 0; p.over = 0; p.iEma = 0; }

  track(ms, dt, interval) {
    const state = this.state, p = this.p;
    p.ring[p.n++ % p.ring.length] = ms;
    p.ema = p.ema ? p.ema * 0.95 + ms * 0.05 : ms;
    if (interval > 2 && interval < 100) {
      p.vsync = p.vsync ? Math.min(p.vsync * 1.0015, interval) : interval;
      p.iEma = p.iEma ? p.iEma * 0.95 + interval * 0.05 : interval;
    }
    if (state.settings.quality !== "auto" || getArtQuality() !== "high" || state.screen !== "play" || state.drift) return;
    if (p.grace > 0) { p.grace -= dt; return; }
    p.over = p.ema > 6.5 ? p.over + dt : 0;
    p.slow = p.iEma > p.vsync * 1.45 ? p.slow + dt : 0;
    if (p.over > 120 || p.slow > 240) {
      p.slow = 0;
      p.drops++;
      this.game.settings.applyQuality("balanced");
    }
  }

  report() {
    const state = this.state, p = this.p;
    const n = Math.min(p.n, p.ring.length);
    const a = Array.from(p.ring.slice(0, n)).sort((x, y) => x - y);
    const q = f => a.length ? +a[Math.min(a.length - 1, Math.floor(a.length * f))].toFixed(2) : 0;
    return { avg: +(a.reduce((s, v) => s + v, 0) / (a.length || 1)).toFixed(2), p50: q(0.5), p95: q(0.95), max: q(0.999),
      quality: getArtQuality(), autoDrops: p.drops, vsyncMs: +p.vsync.toFixed(2), frameMs: +p.iEma.toFixed(2), entities: state.entities.length, ...artStats() };
  }

  reset() { this.p.n = 0; this.p.ring.fill(0); }
}
