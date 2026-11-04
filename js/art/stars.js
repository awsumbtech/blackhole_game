// Stars, star systems and neutron stars.

import { TAU, light, rgba, css, mx3, K0, K1, pick, shade, sphereClip, softBlob, speck } from "./kit.js";
import { quality } from "./quality.js";

// Spectral types: core, limb, corona colours; glow = corona strength; spots
const SPECTRA = {
  M: { core: [255, 150, 100], limb: [190, 60, 40], co: [255, 110, 80], glow: 0.8, spots: 4 },
  K: { core: [255, 196, 130], limb: [220, 110, 50], co: [255, 160, 90], glow: 0.9, spots: 2 },
  G: { core: [255, 230, 160], limb: [240, 150, 60], co: [255, 210, 120], glow: 1, spots: 1 },
  F: { core: [255, 246, 220], limb: [240, 200, 140], co: [255, 240, 200], glow: 1, spots: 0 },
  A: { core: [236, 242, 255], limb: [170, 190, 240], co: [200, 220, 255], glow: 1.1, spots: 0 },
  B: { core: [210, 226, 255], limb: [120, 150, 240], co: [160, 190, 255], glow: 1.25, spots: 0 }
};
const SPEC_OF = ["G", "K", "G", "M", "K", "F", "G", "A", "K", "B", "M", "G"];

export const STAR_PAINTERS = {
  neutron(g, R, e) {
    const gl = g.createRadialGradient(0, 0, 0, 0, 0, R * 3.1);
    gl.addColorStop(0, "rgba(255, 255, 255, 1)");
    gl.addColorStop(0.18, light(e.color, 0.4, 0.8));
    gl.addColorStop(0.45, rgba(e.color, 0.22));
    gl.addColorStop(1, rgba(e.color, 0));
    g.fillStyle = gl;
    g.beginPath(); g.arc(0, 0, R * 3.1, 0, TAU); g.fill();
    g.beginPath();
    g.ellipse(0, 0, R * 1.9, R * 0.55, -0.4, 0, TAU);
    g.strokeStyle = light(e.color, 0.3, 0.28);
    g.lineWidth = Math.max(0.6, R * 0.12);
    g.stroke();
  },

  // Stars by spectral type: red dwarfs with spots to blue-white giants
  star(g, R, e, r, v, look) {
    const S = SPECTRA[SPEC_OF[look % SPEC_OF.length]], hi = quality === "high";
    const co = g.createRadialGradient(0, 0, R * 0.8, 0, 0, R * 2.7);
    co.addColorStop(0, css(S.co, 0.5 * S.glow));
    co.addColorStop(0.28, css(S.co, 0.17 * S.glow));
    co.addColorStop(1, css(S.co, 0));
    g.fillStyle = co;
    g.beginPath(); g.arc(0, 0, R * 2.7, 0, TAU); g.fill();
    if (hi) {
      g.save(); g.globalCompositeOperation = "lighter";
      for (let i = 0; i < 9; i++) {
        const a = r() * TAU, l = R * (1.5 + r() * 1.1 * S.glow);
        g.save(); g.rotate(a);
        const sg = g.createLinearGradient(R * 0.8, 0, l, 0);
        sg.addColorStop(0, css(mx3(S.co, K1, 0.4), 0.09)); sg.addColorStop(1, css(S.co, 0));
        g.fillStyle = sg;
        const bend = (r() - 0.5) * R * 0.5;
        g.beginPath(); g.moveTo(R * 0.8, -R * 0.3); g.quadraticCurveTo(l * 0.7, bend - R * 0.1, l, bend); g.quadraticCurveTo(l * 0.7, bend + R * 0.1, R * 0.8, R * 0.3); g.fill();
        g.restore();
      }
      g.restore();
    }
    const cg = g.createRadialGradient(-R * 0.12, -R * 0.12, 0, 0, 0, R);
    cg.addColorStop(0, css(mx3(S.core, K1, 0.75)));
    cg.addColorStop(0.5, css(mx3(S.core, K1, 0.3)));
    cg.addColorStop(0.88, css(S.core));
    cg.addColorStop(1, css(S.limb));
    g.fillStyle = cg;
    g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
    if (R > 5) {
      sphereClip(g, R);
      const cells = hi ? Math.min(260, Math.round(R * 8)) : Math.min(60, Math.round(R * 2));
      for (let i = 0; i < cells; i++) {
        const a = r() * TAU, d = Math.sqrt(r()) * R;
        g.fillStyle = r() < 0.6 ? css(K1, 0.07) : css(S.limb, 0.08);
        g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, R * (0.025 + r() * 0.04), 0, TAU); g.fill();
      }
      for (let i = 0; i < S.spots; i++) {
        const a = r() * TAU, d = r() * R * 0.6, s = R * (0.06 + r() * 0.07);
        softBlob(g, Math.cos(a) * d, Math.sin(a) * d, s * 1.8, S.limb, 0.45);
        g.fillStyle = css(mx3(S.limb, K0, 0.5), 0.6); g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, s * 0.6, 0, TAU); g.fill();
      }
      const ld = g.createRadialGradient(0, 0, R * 0.5, 0, 0, R);
      ld.addColorStop(0, "rgba(0,0,0,0)"); ld.addColorStop(1, css(S.limb, 0.55));
      g.fillStyle = ld; g.fillRect(-R, -R, R * 2, R * 2);
      g.restore();
    }
  },

  // Star systems: a sun (by spectral type), tilted orbits, little lit worlds,
  // sometimes a companion star or an asteroid belt
  system(g, R, e, r, v, look) {
    const S = SPECTRA[SPEC_OF[(look * 5) % SPEC_OF.length]], hi = quality === "high";
    const halo = g.createRadialGradient(0, 0, 0, 0, 0, R * 2.5);
    halo.addColorStop(0, css(S.co, 0.24)); halo.addColorStop(0.4, css(S.co, 0.07)); halo.addColorStop(1, css(S.co, 0));
    g.fillStyle = halo; g.beginPath(); g.arc(0, 0, R * 2.5, 0, TAU); g.fill();
    const tilt = r() * TAU, flat = 0.35 + r() * 0.3, no = 2 + (look % 3);
    g.save(); g.rotate(tilt); g.scale(1, flat);
    g.lineWidth = Math.max(0.5, R * 0.025);
    for (let i = 0; i < no; i++) { g.strokeStyle = css(S.co, 0.2 - i * 0.03); g.beginPath(); g.arc(0, 0, R * (0.75 + i * 0.5), 0, TAU); g.stroke(); }
    if (look % 4 === 1) speck(g, R * (1.2 + 0.25), hi ? 120 : 50, [[200, 190, 170], [150, 150, 160]], r, 0.3, 0.7, 0.015, 0.03, 1);
    g.restore();
    const WORLDS = [[110, 170, 230], [216, 168, 120], [150, 210, 160], [200, 176, 240], [230, 210, 160], [170, 110, 90]];
    for (let i = 0; i < no; i++) {
      const rr = R * (0.75 + i * 0.5), a = r() * TAU, pr = R * (0.08 + r() * 0.09);
      const x0 = Math.cos(a) * rr, y0 = Math.sin(a) * rr * flat;
      const px = x0 * Math.cos(tilt) - y0 * Math.sin(tilt), py = x0 * Math.sin(tilt) + y0 * Math.cos(tilt);
      g.save(); g.translate(px, py);
      sphereClip(g, pr); g.fillStyle = css(pick(r, WORLDS)); g.fillRect(-pr, -pr, pr * 2, pr * 2); shade(g, pr, 0.95, false); g.restore();
      g.restore();
    }
    const sun = (x, y, s, C) => {
      const cg = g.createRadialGradient(x, y, 0, x, y, s);
      cg.addColorStop(0, css(K1)); cg.addColorStop(0.35, css(mx3(C.core, K1, 0.4), 0.95)); cg.addColorStop(0.6, css(C.co, 0.35)); cg.addColorStop(1, css(C.co, 0));
      g.fillStyle = cg; g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill();
    };
    sun(0, 0, R * 0.6, S);
    if (look % 3 === 0) { const a = r() * TAU; sun(Math.cos(a) * R * 0.32, Math.sin(a) * R * 0.32, R * 0.36, SPECTRA[look % 2 ? "M" : "B"]); }
  },
};
