// Deep-sky objects: nebulae, clusters and galaxies.

import { TAU, rgb, css, mx3, K1, softBlob, glint, tiltOf } from "./kit.js";
import { quality } from "./quality.js";

export const DEEPSKY_PAINTERS = {

  // Nebulae: emission clouds, blue reflection, planetary rings, dark pillars, supernova filaments
  nebula(g, R, e, r, v, look) {
    const kind = look % 5, hi = quality === "high", base = rgb(e.color);
    const second = [[255, 120, 150], [120, 210, 255], [120, 230, 200], [255, 170, 110], [190, 140, 255]][look % 5];
    const blurOn = "filter" in g && R > 8;
    if (kind === 2) {
      // planetary nebula: a glowing shell around a white dwarf
      g.save(); g.rotate(r() * TAU); g.scale(1, 0.7 + r() * 0.25);
      if (blurOn) g.filter = "blur(" + (R * 0.05).toFixed(1) + "px)";
      const sh = g.createRadialGradient(0, 0, R * 0.3, 0, 0, R * 1.2);
      sh.addColorStop(0, css(second, 0.15)); sh.addColorStop(0.45, css(second, 0.35)); sh.addColorStop(0.7, css(base, 0.5)); sh.addColorStop(0.85, css(base, 0.15)); sh.addColorStop(1, css(base, 0));
      g.fillStyle = sh; g.beginPath(); g.arc(0, 0, R * 1.2, 0, TAU); g.fill();
      g.filter = "none";
      g.restore();
      softBlob(g, 0, 0, R * 0.25, [240, 250, 255], 0.5);
      g.fillStyle = "rgba(255, 255, 255, 0.95)"; g.beginPath(); g.arc(0, 0, Math.max(0.7, R * 0.04), 0, TAU); g.fill();
      return;
    }
    if (kind === 4) {
      // supernova remnant: lacy filaments around an empty heart
      const sh = g.createRadialGradient(0, 0, R * 0.5, 0, 0, R * 1.2);
      sh.addColorStop(0, css(second, 0)); sh.addColorStop(0.7, css(second, 0.12)); sh.addColorStop(1, css(second, 0));
      g.fillStyle = sh; g.beginPath(); g.arc(0, 0, R * 1.2, 0, TAU); g.fill();
      g.save(); g.globalCompositeOperation = "lighter"; g.lineCap = "round";
      if (blurOn) g.filter = "blur(" + (R * 0.012).toFixed(1) + "px)";
      for (let i = 0; i < (hi ? 26 : 12); i++) {
        const a0 = r() * TAU, len = 0.5 + r() * 1.2, rr = R * (0.75 + r() * 0.4);
        g.strokeStyle = css(i % 3 ? base : second, 0.18 + r() * 0.22); g.lineWidth = Math.max(0.6, R * (0.015 + r() * 0.04));
        g.beginPath();
        const f = 2 + r() * 3, ph = r() * TAU;
        for (let k = 0; k <= 24; k++) { const a = a0 + len * k / 24, d = rr * (1 + Math.sin(a * f + ph) * 0.05); k ? g.lineTo(Math.cos(a) * d, Math.sin(a) * d) : g.moveTo(Math.cos(a) * d, Math.sin(a) * d); }
        g.stroke();
      }
      g.filter = "none"; g.restore();
      return;
    }
    const col = kind === 1 ? [130, 170, 255] : base;
    if (blurOn) g.filter = "blur(" + (R * 0.08).toFixed(1) + "px)";
    for (let i = 0; i < (hi ? 16 : 8); i++) {
      const a = r() * TAU, d = r() * R * 0.62, cr = R * (0.3 + r() * 0.5);
      softBlob(g, Math.cos(a) * d, Math.sin(a) * d * 0.8, cr, i % 3 === 1 ? second : col, (kind === 1 ? 0.22 : 0.3) * (0.6 + r() * 0.5));
    }
    if (kind === 0) softBlob(g, (r() - 0.5) * R * 0.3, (r() - 0.5) * R * 0.3, R * 0.45, mx3(second, K1, 0.3), 0.35);   // a hot ionised core
    g.filter = "none";
    if (kind === 3 && R > 6) {
      // dark pillars of dust with bright rims, rising from below
      for (let i = 0; i < 3; i++) {
        const x = (r() - 0.5) * R * 1.0, w = R * (0.14 + r() * 0.12), top = -R * (0.1 + r() * 0.5);
        g.beginPath(); g.moveTo(x - w * 1.6, R * 1.1); g.quadraticCurveTo(x - w, top + R * 0.3, x - w * 0.4, top); g.quadraticCurveTo(x, top - w, x + w * 0.5, top + w * 0.2);
        g.quadraticCurveTo(x + w, top + R * 0.4, x + w * 1.5, R * 1.1); g.closePath();
        g.save(); g.globalCompositeOperation = "source-atop";   // only where the glow is
        if (blurOn) g.filter = "blur(" + (R * 0.03).toFixed(1) + "px)";
        const pg = g.createLinearGradient(0, top, 0, R);
        pg.addColorStop(0, "rgba(14, 10, 22, 0.85)"); pg.addColorStop(1, "rgba(14, 10, 22, 0.5)");
        g.fillStyle = pg; g.fill();
        g.strokeStyle = css(mx3(col, K1, 0.6), 0.5); g.lineWidth = Math.max(0.5, R * 0.025);
        g.beginPath(); g.moveTo(x - w, top + R * 0.3); g.quadraticCurveTo(x - w * 0.9, top + R * 0.05, x - w * 0.4, top); g.quadraticCurveTo(x, top - w, x + w * 0.5, top + w * 0.2); g.stroke();
        g.filter = "none"; g.restore();
      }
    } else if (R > 6) {
      g.save(); g.globalCompositeOperation = "destination-out"; g.rotate(r() * TAU); g.scale(1, 0.15);
      const dl = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.1);
      dl.addColorStop(0, "rgba(0,0,0,0.55)"); dl.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = dl; g.fillRect(-R * 1.2, -R * 1.2, R * 2.4, R * 2.4); g.restore();
    }
    if (kind === 1) { softBlob(g, 0, 0, R * 0.3, [220, 235, 255], 0.5); glint(g, 0, 0, R * 0.35, [235, 245, 255], 0.8); }
    g.fillStyle = "rgba(255, 250, 240, 0.85)";
    for (let i = 0; i < 9; i++) { g.beginPath(); g.arc((r() - 0.5) * R * 1.3, (r() - 0.5) * R, Math.max(0.5, R * (0.012 + r() * 0.02)), 0, TAU); g.fill(); }
  },

  // Star clusters: dense round globulars or loose blue open clusters with nebulosity
  cluster(g, R, e, r, v, look) {
    const glob = look % 2 === 0, hi = quality === "high";
    if (glob) {
      const halo = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.5);
      halo.addColorStop(0, "rgba(255, 236, 196, 0.6)"); halo.addColorStop(0.25, "rgba(255, 226, 180, 0.2)"); halo.addColorStop(1, "rgba(255, 220, 170, 0)");
      g.fillStyle = halo; g.beginPath(); g.arc(0, 0, R * 1.5, 0, TAU); g.fill();
      const n = R > 10 ? (hi ? 320 : 140) : 60;
      for (let i = 0; i < n; i++) {
        const d = Math.pow(r(), 2.2) * R * 1.35, a = r() * TAU, s = Math.max(0.5, R * (0.012 + r() * 0.022));
        g.fillStyle = r() < 0.75 ? "rgba(255, 240, 210, 0.85)" : r() < 0.5 ? "rgba(255, 190, 140, 0.9)" : "rgba(200, 215, 255, 0.85)";
        g.fillRect(Math.cos(a) * d - s / 2, Math.sin(a) * d - s / 2, s, s);
      }
      softBlob(g, 0, 0, R * 0.32, [255, 248, 230], 0.6);
    } else {
      const neb = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.6);
      neb.addColorStop(0, "rgba(130, 170, 255, 0.18)"); neb.addColorStop(1, "rgba(130, 170, 255, 0)");
      g.fillStyle = neb; g.beginPath(); g.arc(0, 0, R * 1.6, 0, TAU); g.fill();
      const n = 14 + Math.floor(r() * 10);
      for (let i = 0; i < n; i++) {
        const d = Math.pow(r(), 0.9) * R * 1.3, a = r() * TAU, s = R * (0.03 + r() * r() * 0.07);
        const c = r() < 0.8 ? [190, 215, 255] : [255, 196, 140];
        softBlob(g, Math.cos(a) * d, Math.sin(a) * d, s * 3, c, 0.35);
        g.fillStyle = css(mx3(c, K1, 0.6)); g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, Math.max(0.6, s), 0, TAU); g.fill();
        if (s > R * 0.06 && hi) glint(g, Math.cos(a) * d, Math.sin(a) * d, s * 4, c, 0.4);
      }
    }
  },

  // Galaxies: grand spirals, barred spirals, smooth ellipticals, clumpy irregulars, edge-on disks
  galaxy(g, R, e, r, v, look) {
    const kind = look % 5, hi = quality === "high", tint = rgb(e.color);
    g.save();
    g.rotate(r() * TAU);
    if (kind === 2) {
      g.scale(1, 0.55 + r() * 0.35);
      const el = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.5);
      el.addColorStop(0, "rgba(255, 244, 220, 0.95)"); el.addColorStop(0.12, "rgba(255, 220, 170, 0.6)");
      el.addColorStop(0.45, "rgba(230, 180, 140, 0.18)"); el.addColorStop(1, "rgba(210, 160, 130, 0)");
      g.fillStyle = el; g.beginPath(); g.arc(0, 0, R * 1.5, 0, TAU); g.fill();
      g.restore();
      return;
    }
    if (kind === 4) {
      // edge-on: a thin bright disk with a dark dust lane through it
      g.restore(); g.save(); g.rotate(tiltOf(look));
      g.scale(1, 0.18);
      const d = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.5);
      d.addColorStop(0, "rgba(255, 240, 210, 0.9)"); d.addColorStop(0.3, css(mx3(tint, K1, 0.3), 0.45)); d.addColorStop(1, css(tint, 0));
      g.fillStyle = d; g.beginPath(); g.arc(0, 0, R * 1.5, 0, TAU); g.fill();
      g.restore();
      softBlob(g, 0, 0, R * 0.32, [255, 236, 200], 0.55);
      g.save(); g.rotate(tiltOf(look)); g.fillStyle = "rgba(12, 8, 18, 0.5)"; g.fillRect(-R * 1.2, -Math.max(0.5, R * 0.025), R * 2.4, Math.max(1, R * 0.05)); g.restore();
      return;
    }
    g.scale(1, 0.5 + r() * 0.4);
    const halo = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.6);
    halo.addColorStop(0, css(tint, 0.28)); halo.addColorStop(1, css(tint, 0));
    g.fillStyle = halo; g.beginPath(); g.arc(0, 0, R * 1.6, 0, TAU); g.fill();
    const n = R > 10 ? (hi ? 520 : 220) : 80;
    if (kind === 3) {
      // irregular: clumps of young blue stars and pink star-forming knots
      const cl = [];
      for (let i = 0; i < 6; i++) { const x = (r() - 0.5) * R * 1.5, y = (r() - 0.5) * R * 1.1; cl.push([x, y]); softBlob(g, x, y, R * (0.22 + r() * 0.3), r() < 0.5 ? [160, 190, 255] : tint, 0.26); }
      for (let i = 0; i < n * 0.5; i++) {
        const c = cl[i % cl.length], a = r() * TAU, d = Math.pow(r(), 1.6) * R * 0.4, s = Math.max(0.5, R * 0.025);
        g.fillStyle = r() < 0.12 ? "rgba(255, 150, 200, 0.75)" : "rgba(200, 220, 255, 0.6)";
        g.beginPath(); g.arc(c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d, s, 0, TAU); g.fill();
      }
      g.restore();
      return;
    }
    const bar = kind === 1, arms = 2, wind = 3.2 + r() * 1.4, d0 = bar ? 0.3 : 0.12;
    if (bar) { g.save(); g.scale(1, 0.28); softBlob(g, 0, 0, R * 0.55, [255, 230, 190], 0.6); g.restore(); }
    // the arms' diffuse glow first, then their stars
    for (let i = 0; i < 28; i++) {
      const arm = i % arms, t = (i >> 1) / 14;
      const ang = arm * Math.PI + t * wind, d = R * (d0 + t * 1.15);
      softBlob(g, Math.cos(ang) * d, Math.sin(ang) * d, R * (0.16 + t * 0.12), mx3(tint, [170, 200, 255], 0.4), 0.16 * (1 - t * 0.5));
    }
    for (let i = 0; i < n; i++) {
      const arm = i % arms, t = r();
      const ang = arm * Math.PI + t * wind + (r() - 0.5) * 0.5;
      const d = R * (d0 + t * 1.15) * (1 + (r() - 0.5) * 0.28);
      const s = Math.max(0.5, R * 0.03 * (1 - t * 0.5));
      g.fillStyle = t < 0.25 ? "rgba(255, 232, 196, 0.5)" : r() < 0.35 ? "rgba(170, 200, 255, 0.6)" : r() < 0.08 ? "rgba(255, 150, 200, 0.7)" : css(mx3(tint, [190, 210, 255], 0.3), 0.45);
      g.beginPath(); g.arc(Math.cos(ang) * d, Math.sin(ang) * d, s, 0, TAU); g.fill();
    }
    if (R > 10) {
      // dust lanes along the inner edges of the arms
      g.strokeStyle = "rgba(10, 6, 16, 0.32)"; g.lineWidth = Math.max(0.6, R * 0.035);
      for (let arm = 0; arm < arms; arm++) {
        g.beginPath();
        for (let k = 0; k <= 20; k++) { const t = 0.08 + k / 20 * 0.7, ang = arm * Math.PI + t * wind - 0.25, d = R * ((bar ? 0.3 : 0.12) + t * 1.2); k ? g.lineTo(Math.cos(ang) * d, Math.sin(ang) * d) : g.moveTo(Math.cos(ang) * d, Math.sin(ang) * d); }
        g.stroke();
      }
    }
    const core = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.42);
    core.addColorStop(0, "rgba(255, 250, 235, 0.95)"); core.addColorStop(1, "rgba(255, 230, 190, 0)");
    g.fillStyle = core; g.beginPath(); g.arc(0, 0, R * 0.42, 0, TAU); g.fill();
    g.restore();
  },
};
