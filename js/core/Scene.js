// ─── Scene ───
// Draws one frame, back to front: sky and backdrop, depth layers and lens, the
// world (scaled by zoom) with the hole and the wisp last, tints, then the
// screen-space overlays and veils. Reads state only; changes nothing in play.

import * as audio from "../audio.js";
import { drawStarfield, drawEntities, drawBlackHole, drawParticles, drawRipples, drawMinimap, drawEdgeIndicators, drawLens, setStarQuality } from "../render.js";
import { drawWorldsBG, drawWorldsOverlay, drawWorldsMinimap } from "../worlds.js";
import { setGrade } from "../grade.js";
import { drawDepth } from "../depth.js";
import { drawBackdrop } from "../backdrop.js";
import { beginArtFrame, getArtQuality, drawRevealFx } from "../art.js";
import { drawDiscoveries, drawDiscoveryCue } from "../discoveries.js";
import { drawWisp } from "../wisp.js";
import { drawRivals } from "../rivals.js";
import { drawLivingWorldBG, drawLivingWorldFG, drawLivingWorldOverlay, pullRange } from "../living-world.js";
import { powerupFade } from "../powerups.js";
import { breathPhase } from "./breath.js";

const hypot = (x, y) => Math.sqrt(x * x + y * y);   // 2-arg Math.hypot without the varargs cost
// per-frame option bags, reused so drawing doesn't allocate
const SF_OPTS = { noNebula: true }, BD_OPTS = { lite: false, time: 0, reduceMotion: false }, PT_OPTS = { reduceMotion: false };

export class Scene {
  constructor(game) {
    this.game = game;
    this.state = game.state;
    this.ctx = game.display.ctx;
  }

  radarRange() {
    const state = this.state;
    return hypot(state.viewW, state.viewH) / 2 * 2.6;
  }

  draw(now, dt, inPlay) {
    const state = this.state, game = this.game, ctx = this.ctx, dpr = game.display.dpr;
    const w = game.display.w;
    const h = game.display.h;
    const z = state.zoom;
    const vw = state.viewW;
    const vh = state.viewH;

    const breath = breathPhase(now);
    audio.setBreath(breath);
    const hiQ = getArtQuality() === "high";
    setStarQuality(hiQ);
    drawStarfield(ctx, w, h, state.bgX, state.bgY, state.biome ? state.biome.tint : "#0d1633", breath, SF_OPTS);
    BD_OPTS.lite = !hiQ; BD_OPTS.time = now; BD_OPTS.reduceMotion = state.settings.reduceMotion;
    drawBackdrop(ctx, w, h, z, state.bgX, state.bgY, breath, BD_OPTS);
    drawLivingWorldBG(ctx, state, w, h);
    beginArtFrame();
    if (state.screen === "play") drawDepth(ctx, w, h, state, state.anchorSmooth * z, dpr, state.paused ? 0 : dt);
    if (getArtQuality() === "high") {
      drawLens(ctx, (state.playerX - state.camX) * state.zoom + w / 2, (state.playerY - state.camY) * state.zoom + h / 2, state.radius * state.zoom);
    }


    ctx.save();
    ctx.scale(z, z);
    drawWorldsBG(ctx, state, vw, vh, { zoom: z, dpr, time: now, breath, reduceMotion: state.settings.reduceMotion });
    drawEntities(ctx, state.entities, vw, vh, state.camX, state.camY, state.radius, now, state.eatRatio, z, dpr, breath,
      state.playerX - state.camX + vw / 2, state.playerY - state.camY + vh / 2, state.settings.reduceMotion);
    drawRivals(ctx, state, vw, vh, now, state.settings.reduceMotion);
    drawDiscoveries(ctx, state, vw, vh, now, state.settings.reduceMotion);
    PT_OPTS.reduceMotion = state.settings.reduceMotion;
    drawParticles(ctx, state.particles, vw, vh, state.camX, state.camY, PT_OPTS);
    drawRipples(ctx, state.ripples, vw, vh, state.camX, state.camY, z);
    drawLivingWorldFG(ctx, state, vw, vh);
    const holeX = state.playerX - state.camX + vw / 2, holeY = state.playerY - state.camY + vh / 2;
    const holeR = state.birth > 0 ? state.radius * (0.06 + 0.94 * state.birth * state.birth * (3 - 2 * state.birth)) : state.radius;
    game.inflow.drawBack(ctx, holeX, holeY, holeR, z, dpr);
    drawBlackHole(ctx, holeX, holeY, holeR, now,
      { vx: state.playerVX, vy: state.playerVY }, {
        zoom: z,
        dpr,
        dt: state.paused ? 0 : dt,
        reduceMotion: state.settings.reduceMotion,
        speedScale: state.speedScale,
        magnet: state.active.magnet > 0 && state.mode !== "zen",   // v9.5.1: no ring around the hole in Zen
        pullRange: pullRange(state),
        double: state.active.double > 0,
        gulp: state.gulp,
        breath,
        // v7.1: in Zen the wisp is the breath guide. v9.5.1 (Brian): never a ring around the hole in Zen
        breathGuide: state.mode !== "zen" && state.settings.breathGuide,
        filter: game.settings.skinFilter()
      });
    game.inflow.drawFront(ctx, holeX, holeY, holeR, z, dpr);
    if (state.reveal) drawRevealFx(ctx, state.playerX - state.camX + vw / 2, state.playerY - state.camY + vh / 2, state.radius, state.reveal.p, state.settings.reduceMotion);
    // v8: the wisp draws last in the world so nothing ever covers it
    if (state.screen === "play") drawWisp(ctx, state, vw, vh, breath, state.settings.reduceMotion);
    ctx.restore();

    // Slow-Mo tint
    if (state.active.slow > 0) {
      const a = powerupFade(state, "slow") * 0.16;
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, "rgba(80, 180, 255, 0)");
      g.addColorStop(1, `rgba(80, 180, 255, ${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    setGrade(state.biome, hiQ);   // v8: vignette + biome grade (CSS layer under the HUD)
    if (inPlay) {
      drawLivingWorldOverlay(ctx, state, w, h);
      drawWorldsOverlay(ctx, state, w, h, breath);
      drawDiscoveryCue(ctx, state, w, h);
      drawEdgeIndicators(ctx, state.entities, w, h, state.camX, state.camY, state.radius, z, state.eatRatio);
      drawMinimap(ctx, w, h, state.playerX, state.playerY, state.entities, this.radarRange(), state.radius, state.eatRatio,
        (c, mx, my, sc, rim) => drawWorldsMinimap(c, mx, my, sc, now, rim), { trail: state.trail, viewW: vw, viewH: vh });
      game.overlay.drawTierBanner(w, h);
      game.overlay.drawCursor(w, h);
      game.overlay.drawThumbstick(game.input.getStick());
      game.overlay.drawFloaters(w, h, z);
    }

    // Growth pulse (tier merge) then galaxy-flow veil
    game.growth.drawPulse(ctx, w, h);
    game.galaxyFlow.drawVeil(ctx, w, h);

    // Drift-in veil (title -> play)
    if (state.drift && state.drift.veil > 0) {
      ctx.fillStyle = `rgba(2, 3, 8, ${state.drift.veil})`;
      ctx.fillRect(0, 0, w, h);
    }
  }
}
