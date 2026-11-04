// Planets and moons: archetypes, palettes and rings.

import { TAU, rng, css, mx3, jit, K0, K1, pick, shade, atmoHalo, atmoLimb, sphereClip, blob, softBlob, crater, speck, ringPass, band } from "./kit.js";
import { quality } from "./quality.js";

const ARCH = 10;                                          // planet archetypes (look % ARCH)
export const ringedPlanet = (look, v) => { const a = look % ARCH; return a === 7 || (v === 0 && (a === 5 || a === 6 || a === 9)); };

function planetPalette(a, r) {
  const j = c => jit(c, r, 0.16);
  switch (a) {
    case 0: return { base: j([176, 96, 62]), bands: [j([120, 62, 44]), j([206, 140, 96]), j([150, 80, 56])], atmo: [255, 190, 160], atmoK: 0.35 };
    case 1: return { base: j([28, 70, 146]), bands: [j([66, 118, 58]), j([96, 136, 66]), j([84, 112, 54])], storm: [168, 146, 98], atmo: [130, 190, 255], atmoK: 1 };
    case 2: return { base: j([214, 172, 112]), bands: [j([180, 130, 80]), j([236, 200, 140]), j([150, 104, 70])], atmo: [255, 220, 170], atmoK: 0.45 };
    case 3: return { base: j([214, 232, 244]), bands: [j([170, 206, 236]), j([240, 248, 255]), j([150, 190, 226])], atmo: [190, 230, 255], atmoK: 0.5 };
    case 4: return { base: j([46, 34, 34]), bands: [j([70, 50, 46]), j([30, 24, 28])], atmo: null };
    case 5: return { base: j([222, 196, 160]), bands: [j([200, 150, 110]), j([238, 224, 200]), j([170, 120, 90]), j([226, 186, 140])], storm: j([200, 100, 70]), ring: [210, 190, 160], atmo: [255, 230, 200], atmoK: 0.55 };
    case 6: return { base: j([60, 110, 210]), bands: [j([90, 150, 230]), j([40, 80, 180]), j([120, 180, 240])], ring: [170, 190, 220], atmo: [140, 200, 255], atmoK: 0.9 };
    case 7: return { base: j([226, 204, 150]), bands: [j([240, 222, 176]), j([206, 176, 120]), j([230, 214, 170])], ring: j([226, 210, 170]), atmo: [255, 236, 190], atmoK: 0.5 };
    case 8: return { base: j([232, 210, 150]), bands: [j([244, 228, 180]), j([214, 186, 120]), j([250, 238, 200])], atmo: [255, 236, 190], atmoK: 1 };
    default: {
      const purple = r() < 0.5;
      return purple
        ? { base: j([150, 90, 170]), bands: [j([180, 120, 200]), j([110, 60, 140]), j([210, 160, 220])], ring: [200, 170, 220], atmo: [220, 170, 255], atmoK: 0.7 }
        : { base: j([90, 170, 150]), bands: [j([120, 200, 170]), j([60, 130, 120]), j([170, 230, 200])], ring: [170, 220, 200], atmo: [160, 255, 220], atmoK: 0.7 };
    }
  }
}

export const PLANET_PAINTERS = {

  // Moons: cratered, no air. Grey maria, icy cracked, volcanic, dark dusty, bright icy, rusty.
  moon(g, R, e, r, v, look) {
    const kind = look % 6, hi = quality === "high";
    const base = jit([[176, 174, 170], [226, 216, 196], [222, 196, 104], [112, 98, 84], [222, 234, 242], [160, 124, 104]][kind], r, 0.1);
    sphereClip(g, R);
    const lg = g.createLinearGradient(-R, -R, R, R);
    lg.addColorStop(0, css(mx3(base, K1, 0.12))); lg.addColorStop(1, css(mx3(base, K0, 0.15)));
    g.fillStyle = lg; g.fillRect(-R, -R, R * 2, R * 2);
    const det = R > 5;
    if (kind === 0 && det) {
      for (let i = 0; i < 3 + Math.floor(r() * 3); i++) { blob(g, (r() - 0.5) * R * 1.3, (r() - 0.5) * R * 1.3, R * (0.18 + r() * 0.28), r, 0.5); g.fillStyle = css(mx3(base, K0, 0.42), 0.55); g.fill(); }
    } else if (kind === 1 && det) {
      g.lineCap = "round";
      for (let i = 0; i < (hi ? 14 : 7); i++) {
        const a = r() * TAU, x = (r() - 0.5) * R * 2, y = (r() - 0.5) * R * 2, l = R * (0.6 + r() * 1.2);
        g.strokeStyle = css([150, 84, 60], 0.35 + r() * 0.3); g.lineWidth = Math.max(0.5, R * (0.02 + r() * 0.03));
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
    } else if (kind === 2 && det) {
      for (let i = 0; i < 6; i++) softBlob(g, (r() - 0.5) * R * 1.6, (r() - 0.5) * R * 1.6, R * (0.2 + r() * 0.3), pick(r, [[236, 150, 60], [250, 240, 200], [190, 120, 50]]), 0.5);
      for (let i = 0; i < (hi ? 6 : 4); i++) {
        const x = (r() - 0.5) * R * 1.6, y = (r() - 0.5) * R * 1.6, s = R * (0.02 + r() * 0.04);
        softBlob(g, x, y, s * 4, [190, 80, 40], 0.35);
        blob(g, x, y, s, r, 0.6); g.fillStyle = "rgba(70, 40, 26, 0.75)"; g.fill();
      }
    } else if (kind === 4 && det) {
      g.lineCap = "round";
      for (let i = 0; i < 4; i++) {
        const y = R * (0.35 + i * 0.13), x0 = -R * (0.2 + r() * 0.35), x1 = R * (0.2 + r() * 0.35);
        g.strokeStyle = "rgba(110, 170, 230, 0.4)"; g.lineWidth = Math.max(0.6, R * 0.035);
        g.beginPath(); g.moveTo(x0, y + R * 0.08); g.quadraticCurveTo((x0 + x1) / 2, y - R * 0.1 + r() * R * 0.08, x1, y); g.stroke();
      }
    }
    if (det && kind !== 2) {
      const nc = kind === 3 ? (hi ? 26 : 12) : kind === 4 || kind === 1 ? 3 : (hi ? 11 : 6);
      for (let i = 0; i < nc; i++) {
        const a = r() * TAU, d = Math.sqrt(r()) * R * 0.92, cr = R * (kind === 3 ? 0.03 + r() * 0.06 : 0.05 + r() * r() * 0.2);
        if (kind === 3) { g.fillStyle = css(mx3(base, K1, 0.55), 0.7); g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, cr, 0, TAU); g.fill(); }
        else crater(g, Math.cos(a) * d, Math.sin(a) * d, cr, base, 0.9);
      }
      if (kind === 5) crater(g, R * 0.15, -R * 0.1, R * 0.38, base, 1);
      if (kind === 0 && hi && R > 12) {
        // one young ray crater
        const x = -R * 0.3 + r() * R * 0.4, y = -R * 0.3 + r() * R * 0.4;
        g.strokeStyle = css(K1, 0.12); g.lineWidth = Math.max(0.5, R * 0.025);
        for (let i = 0; i < 9; i++) { const a = r() * TAU, l = R * (0.3 + r() * 0.5); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
        crater(g, x, y, R * 0.07, mx3(base, K1, 0.4), 1);
      }
    }
    if (hi && det) speck(g, R, Math.round(R * 2.5), [mx3(base, K0, 0.4), mx3(base, K1, 0.3)], r, 0.06, 0.18, 0.02, 0.05);
    shade(g, R, 0.94, false);
    g.restore();
  },

  // Planets: ten archetypes, each instance with its own seeded continents,
  // storms, bands and tints. Never two quite alike.
  planet(g, R, e, r, variant, look) {
    const a = look % ARCH, hi = quality === "high", det = R > 6;
    const tilt = -0.42 + r() * 0.84;
    const ringed = ringedPlanet(look, variant);
    const P = planetPalette(a, r);
    if (ringed) ringPass(g, R, tilt * 0.6, P.ring, false, a === 7 ? 1.25 : 0.75, true);
    if (P.atmo) atmoHalo(g, R, P.atmo, P.atmoK);
    sphereClip(g, R);
    g.fillStyle = css(P.base); g.fillRect(-R, -R, R * 2, R * 2);
    if (a === 5 || a === 6 || a === 7 || a === 9 || a === 8) {
      // banded / clouded worlds
      g.save(); g.rotate(tilt * 0.6);
      if (hi && det && "filter" in g) g.filter = "blur(" + Math.max(0.5, R * (a === 8 ? 0.06 : 0.025)).toFixed(1) + "px)";
      const nb = a === 6 ? 5 : a === 8 ? 7 : hi ? 12 : 7;
      let y = -R * 1.05;
      for (let i = 0; i < nb; i++) {
        const h = (R * 2.1 / nb) * (0.55 + r() * 0.9);
        band(g, R, y, y + h, R * (a === 8 ? 0.12 : 0.035) * (0.5 + r()), 3 + r() * 5, r() * TAU);
        g.fillStyle = css(jit(pick(r, P.bands), r, 0.08), a === 6 ? 0.35 : 0.55 + r() * 0.4); g.fill();
        y += h;
      }
      if (a === 8) for (let i = 0; i < 5; i++) { g.save(); g.translate((r() - 0.5) * R, (r() - 0.5) * R * 1.4); g.scale(1.8, 0.5); softBlob(g, 0, 0, R * 0.4, mx3(P.base, K1, 0.3), 0.35); g.restore(); }
      g.filter = "none";
      if (det && a === 5) {
        // a great storm
        const sx = (r() - 0.3) * R * 0.8, sy = R * (0.15 + r() * 0.25), sr = R * (0.13 + r() * 0.08);
        g.save(); g.translate(sx, sy); g.scale(1.7, 1);
        softBlob(g, 0, 0, sr * 1.4, [250, 230, 210], 0.35);
        g.fillStyle = css(P.storm, 0.85); g.beginPath(); g.arc(0, 0, sr, 0, TAU); g.fill();
        g.strokeStyle = css(mx3(P.storm, K1, 0.4), 0.5); g.lineWidth = Math.max(0.5, sr * 0.2); g.stroke();
        g.restore();
      }
      if (det && a === 6) {
        const sx = (r() - 0.5) * R * 0.8, sy = (r() - 0.6) * R * 0.6;
        g.save(); g.translate(sx, sy); g.scale(1.6, 1);
        g.fillStyle = "rgba(20, 40, 110, 0.7)"; g.beginPath(); g.arc(0, 0, R * 0.12, 0, TAU); g.fill(); g.restore();
        for (let i = 0; i < 3; i++) { g.save(); g.translate(sx + R * (0.1 + r() * 0.2), sy + R * (0.12 + r() * 0.1)); g.scale(2.4, 0.4); softBlob(g, 0, 0, R * 0.08, [240, 250, 255], 0.8); g.restore(); }
      }
      if (hi && det && a !== 8) for (let i = 0; i < 5; i++) {
        g.save(); g.translate((r() - 0.5) * R * 1.6, (r() - 0.5) * R * 1.6); g.scale(2.2, 0.55);
        softBlob(g, 0, 0, R * (0.05 + r() * 0.06), mx3(pick(r, P.bands), K1, 0.35), 0.5); g.restore();
      }
      g.restore();
    } else if (a === 4) {
      // lava: dark crust; the glowing cracks are painted after shading
      for (let i = 0; i < 6; i++) { blob(g, (r() - 0.5) * R * 1.6, (r() - 0.5) * R * 1.6, R * (0.2 + r() * 0.3), r, 0.6); g.fillStyle = css(jit(P.bands[i % 2], r, 0.2), 0.7); g.fill(); }
    } else {
      // rocky / ocean / desert / ice surfaces
      if (hi && det && "filter" in g) g.filter = "blur(" + Math.max(0.4, R * 0.012).toFixed(1) + "px)";
      const nl = a === 1 ? 4 + Math.floor(r() * 3) : 6 + Math.floor(r() * 4);
      for (let i = 0; i < nl; i++) {
        const x = (r() - 0.5) * R * 1.7, y = (r() - 0.5) * R * 1.5, s = R * (a === 1 ? 0.22 + r() * 0.3 : 0.12 + r() * 0.3);
        blob(g, x, y, s, r, 0.7);
        g.fillStyle = css(jit(pick(r, P.bands), r, 0.12), a === 1 ? 0.95 : 0.55); g.fill();
        if (a === 1 && det) { blob(g, x + s * 0.2, y + s * 0.1, s * 0.5, r, 0.6); g.fillStyle = css(P.storm, 0.5); g.fill(); }
      }
      if (a === 2 && det) {
        // dune sweeps
        g.strokeStyle = css(mx3(P.base, K0, 0.25), 0.3); g.lineWidth = Math.max(0.5, R * 0.025);
        for (let i = 0; i < 9; i++) { const y = (r() - 0.5) * R * 1.8; g.beginPath(); g.moveTo(-R, y); g.bezierCurveTo(-R * 0.3, y - R * 0.2, R * 0.3, y + R * 0.2, R, y); g.stroke(); }
      }
      if (a === 3 && det) {
        g.strokeStyle = "rgba(90, 150, 210, 0.45)"; g.lineWidth = Math.max(0.5, R * 0.02);
        for (let i = 0; i < 10; i++) { const x = (r() - 0.5) * R * 2, y = (r() - 0.5) * R * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * R, y + (r() - 0.5) * R); g.lineTo(x + (r() - 0.5) * R * 1.4, y + (r() - 0.5) * R * 1.4); g.stroke(); }
      }
      g.filter = "none";
      if (a === 0 || a === 2) for (let i = 0; i < (det ? 5 : 0); i++) crater(g, (r() - 0.5) * R * 1.5, (r() - 0.5) * R * 1.5, R * (0.04 + r() * 0.07), P.base, 0.55);
      if (a !== 2) {
        // polar caps
        g.fillStyle = css([246, 250, 255], a === 3 ? 0.4 : 0.85);
        g.save(); g.rotate(tilt * 0.5); g.beginPath(); g.ellipse(0, -R * 0.98, R * (0.38 + r() * 0.25), R * 0.2, 0, 0, TAU); g.fill();
        if (a === 1) { g.beginPath(); g.ellipse(0, R * 0.98, R * 0.4, R * 0.16, 0, 0, TAU); g.fill(); }
        g.restore();
      }
      if (a === 1 && det) {
        // swirling white clouds
        if (hi && "filter" in g) g.filter = "blur(" + Math.max(0.5, R * 0.03).toFixed(1) + "px)";
        g.strokeStyle = "rgba(255, 255, 255, 0.7)"; g.lineCap = "round";
        for (let i = 0; i < (hi ? 9 : 5); i++) {
          const x = (r() - 0.5) * R * 1.8, y = (r() - 0.5) * R * 1.6, l = R * (0.3 + r() * 0.6);
          g.lineWidth = Math.max(0.6, R * (0.04 + r() * 0.06));
          g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l * 0.5, y - l * 0.25, x + l, y + (r() - 0.5) * l * 0.4); g.stroke();
        }
        g.filter = "none";
      }
    }
    if (hi && det) speck(g, R, Math.round(R * 1.5), [mx3(P.base, K0, 0.4), mx3(P.base, K1, 0.3)], r, 0.04, 0.12, 0.02, 0.05);
    if (P.atmo) atmoLimb(g, R, P.atmo, P.atmoK);
    shade(g, R, a === 4 ? 0.97 : 0.92, false);
    if (a === 4 && R > 3) {
      // glowing lava rivers show on the night side too
      g.globalCompositeOperation = "lighter"; g.lineCap = "round"; g.lineJoin = "round";
      for (let pass = 0; pass < 2; pass++) {
        const rr = rng(look * 31 + 7);
        g.strokeStyle = pass ? "rgba(255, 196, 120, 0.7)" : "rgba(255, 90, 40, 0.22)";
        g.lineWidth = Math.max(0.5, R * (pass ? 0.018 : 0.08));
        for (let i = 0; i < 9; i++) {
          let x = (rr() - 0.5) * R * 1.8, y = (rr() - 0.5) * R * 1.8, a = rr() * TAU;
          g.beginPath(); g.moveTo(x, y);
          for (let k = 0; k < 4; k++) {
            a += (rr() - 0.5) * 1.4;
            const l = R * (0.15 + rr() * 0.2), nx = x + Math.cos(a) * l, ny = y + Math.sin(a) * l;
            g.quadraticCurveTo(x + Math.cos(a + 0.5) * l * 0.6, y + Math.sin(a + 0.5) * l * 0.6, nx, ny); x = nx; y = ny;
          }
          g.stroke();
        }
      }
      g.globalCompositeOperation = "source-over";
    }
    g.restore();
    if (a === 4) softBlob(g, 0, 0, R * 1.25, [255, 110, 50], 0.08);
    if (ringed) {
      sphereClip(g, R);
      g.rotate(tilt * 0.6);
      g.strokeStyle = "rgba(4, 5, 14, 0.4)"; g.lineWidth = R * 0.14;
      g.beginPath(); g.ellipse(R * 0.1, R * 0.16, R * 1.5, R * 0.42, 0, 0.05 * Math.PI, 0.95 * Math.PI); g.stroke();
      g.restore();
      ringPass(g, R, tilt * 0.6, P.ring, true, a === 7 ? 1.25 : 0.75, false);
    }
    if (variant === 1) {
      // a small companion moon, lit the same way
      const ma = -0.9 + r() * 0.6, mxp = Math.cos(ma) * R * 1.38, myp = Math.sin(ma) * R * 1.38, mr = R * (0.13 + r() * 0.08);
      g.save(); g.translate(mxp, myp);
      sphereClip(g, mr); g.fillStyle = css(jit([186, 182, 176], r, 0.2)); g.fillRect(-mr, -mr, mr * 2, mr * 2); shade(g, mr, 0.95, false); g.restore();
      g.restore();
    }
  },
};
