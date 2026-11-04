// Dust and junk: drifting grains and small debris.

import { TAU, LX, LY, css, mx3, jit, K0, K1, pick, chip, polyAt, facets, softBlob, speck, glint } from "./kit.js";
import { quality } from "./quality.js";

export const DUST_PAINTERS = {
  // Space dust: never a round blob. A faint drift of gas carrying grains and
  // glints: silicate grit, ice glints, carbon soot, a pink gas wisp.
  dust(g, R, e, r, v, look) {
    const kind = look % 4, hi = quality === "high";
    const PAL = [
      [[214, 196, 168], [182, 170, 156], [236, 222, 196]],      // silicate grains
      [[214, 238, 255], [180, 214, 255], [246, 252, 255]],      // ice glints
      [[150, 128, 116], [118, 104, 100], [186, 160, 140]],      // carbon soot
      [[236, 176, 214], [196, 168, 240], [255, 214, 236]]       // gas wisp
    ][kind];
    const ang = r() * TAU, curve = (r() - 0.5) * 1.6;
    // the drifting wisp the grains ride in: elongated, off-centre, faint
    g.save();
    g.rotate(ang);
    const wl = R * (1.35 + r() * 0.3), wa = kind === 3 ? 0.36 : kind === 2 ? 0.24 : 0.2;
    for (let i = 0; i < 3; i++) {
      const t = i - 1 + (r() - 0.5) * 0.5;
      const x = t * wl * 0.55, y = Math.sin(t * 1.5) * curve * R * 0.3;
      g.save(); g.translate(x, y); g.scale(1, 0.42 + r() * 0.2);
      softBlob(g, 0, 0, R * (0.45 + r() * 0.35), pick(r, PAL), wa * (0.6 + r() * 0.5));
      g.restore();
    }
    // grains along the filament
    const n = kind === 1 ? 4 + Math.floor(r() * 3) : 6 + Math.floor(r() * (hi ? 6 : 3));
    const big = Math.floor(r() * n);
    for (let i = 0; i < n; i++) {
      const t = (r() * 2 - 1);
      const x = t * wl * 0.62, y = Math.sin(t * 1.5) * curve * R * 0.3 + (r() - 0.5) * R * (kind === 2 ? 1.1 : 0.6);
      const s = Math.max(0.8, R * (i === big ? 0.24 : 0.09 + r() * 0.1));
      const c = pick(r, PAL);
      if (kind === 2) {
        // soot: tiny dark-cored fluff
        const p = chip(s * 0.7, r, 5);
        softBlob(g, x + (r() - 0.5) * s, y + (r() - 0.5) * s, s * (1.2 + r()), c, 0.32);
        polyAt(g, p, x, y, 1); g.fillStyle = css(mx3(c, K0, 0.3), 0.85); g.fill();
      } else if (kind === 1) {
        glint(g, x, y, s * (i === big ? 2.6 : 1.6), c, i === big ? 0.9 : 0.55);
      } else {
        // a little angular grain with a lit corner
        const p = chip(s, r, 4 + Math.floor(r() * 2));
        polyAt(g, p, x, y, 1); g.fillStyle = css(mx3(c, K0, 0.25), 0.95); g.fill();
        g.fillStyle = css(mx3(c, K1, 0.5), 0.9);
        g.fillRect(x + LX * s * 0.4 - s * 0.25, y + LY * s * 0.4 - s * 0.25, s * 0.5, s * 0.5);
      }
    }
    g.restore();
    // one glint so even the smallest speck catches the light
    if (kind !== 1) glint(g, (r() - 0.5) * R * 0.8, (r() - 0.5) * R * 0.8, R * (kind === 3 ? 0.35 : 0.45), PAL[2], kind === 2 ? 0.45 : 0.7);
  },

  // Grit & pebbles: angular chips, gravel, ice flakes, dark basalt and rust
  junk(g, R, e, r, v, look) {
    const kind = look % 5, hi = quality === "high";
    const base = jit([[150, 146, 140], [128, 136, 152], [196, 222, 240], [92, 86, 84], [158, 112, 86]][kind], r, 0.18);
    if (kind === 1) {
      // gravel: a loose handful of chips
      const n = 3 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const a = r() * TAU, d = i ? R * (0.35 + r() * 0.35) : 0, s = R * (i ? 0.28 + r() * 0.2 : 0.5);
        const p = chip(1, r, 5 + Math.floor(r() * 2));
        const t = 0.85 + r() * 0.3;
        facets(g, p, Math.cos(a) * d, Math.sin(a) * d, s, [base[0] * t, base[1] * t, base[2] * t], 1.1);
      }
      return;
    }
    if (kind === 2) {
      // ice flake: a thin translucent plate with a bright edge
      const p = chip(R, r, 6);
      polyAt(g, p, 0, 0, 1);
      const lg = g.createLinearGradient(LX * R, LY * R, -LX * R, -LY * R);
      lg.addColorStop(0, css(mx3(base, K1, 0.6), 0.9)); lg.addColorStop(0.5, css(base, 0.55)); lg.addColorStop(1, css(mx3(base, [40, 80, 140], 0.5), 0.6));
      g.fillStyle = lg; g.fill();
      g.strokeStyle = css(K1, 0.55); g.lineWidth = Math.max(0.6, R * 0.07); g.stroke();
      if (R > 5) {
        g.strokeStyle = css([150, 200, 240], 0.35); g.lineWidth = Math.max(0.5, R * 0.035);
        for (let i = 0; i < 3; i++) { const a = r() * TAU; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * R * 0.7, Math.sin(a) * R * 0.7); g.stroke(); }
      }
      glint(g, p[0][0] * 0.7, p[0][1] * 0.7, R * 0.5, K1, 0.6);
      return;
    }
    const p = chip(R, r, 5 + Math.floor(r() * 3));
    facets(g, p, 0, 0, 1, base, kind === 3 ? 1.3 : 1);
    if (R > 4) {
      g.save(); polyAt(g, p, 0, 0, 1); g.clip();
      speck(g, R, hi ? Math.round(R * 3) : Math.round(R), [mx3(base, K0, 0.5), mx3(base, K1, 0.3)], r, 0.15, 0.35, 0.03, 0.07);
      if (kind === 4) for (let i = 0; i < 3; i++) softBlob(g, (r() - 0.5) * R, (r() - 0.5) * R, R * 0.35, [190, 110, 60], 0.3);
      g.restore();
    }
    g.lineJoin = "round";
    g.strokeStyle = css(mx3(base, K0, 0.5), 0.5); g.lineWidth = Math.max(0.5, R * 0.05);
    polyAt(g, p, 0, 0, 1); g.stroke();
    if (kind === 3 && R > 4) glint(g, LX * R * 0.35, LY * R * 0.35, R * 0.35, [220, 230, 255], 0.5);   // a glassy basalt flash
  },
};
