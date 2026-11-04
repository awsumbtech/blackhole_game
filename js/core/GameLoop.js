// ─── GameLoop ───
// One requestAnimationFrame loop: frame timing, then every system's update in a
// fixed order, then the Scene draws. Times are in 60Hz frames (dt 1 = 16.67ms).

import { updateEntities } from "../entities.js";
import { updateWorlds } from "../worlds.js";
import { updateWisp, wisp } from "../wisp.js";
import { updateDiscoveries } from "../discoveries.js";
import { updateLivingWorld } from "../living-world.js";
import { updatePowerups, slowFactor } from "../powerups.js";
import { getArtQuality } from "../art.js";
import * as audio from "../audio.js";
import * as ui from "../ui.js";

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

export class GameLoop {
  constructor(game) {
    this.game = game;
    this.state = game.state;
    this.lastTime = performance.now();
    this.frame = this.frame.bind(this);
  }

  /** After a pause, menu, hidden tab or screen swap: don't count the gap as play time. */
  resync() { this.lastTime = performance.now(); }

  start() { requestAnimationFrame(this.frame); }

  frame(now) {
    const state = this.state, game = this.game;
    requestAnimationFrame(this.frame);
    const t0 = performance.now();

    // rAF timestamps can be slightly earlier than a performance.now() taken in an
    // event handler (resume/continue), so clamp at 0 to avoid negative steps.
    const rawDt = (now - this.lastTime) / 16.67;
    const dt = game.dev && game.dev.frozen ? 0 : clamp(rawDt, 0, 3);   // v9.3: dev "freeze time"
    this.lastTime = now;

    if (state.paused || state.menuOpen) return;

    const inPlay = state.screen === "play";
    if (inPlay) state.stats.timePlayed += dt / 60;

    if (state.transitioning && inPlay) game.galaxyFlow.update(dt);
    if (!inPlay) game.screens.updateBackdrop(dt);
    if (state.drift) game.screens.updateDrift(dt);
    if (state.birth > 0) game.screens.updateBirth(dt);

    const playing = inPlay;   // v9: the galaxy flow happens in play
    const worldDt = dt * slowFactor(state);

    if (playing) {
      state.run.time += dt / 60;
      const prevCamX = state.camX, prevCamY = state.camY;
      game.player.update(dt);
      game.camera.updateAnchor(dt);
      game.updateCameraScale();
      state.bgX += (state.camX - prevCamX) * state.zoom;
      state.bgY += (state.camY - prevCamY) * state.zoom;
      updateLivingWorld(state, dt, worldDt);
      updateWorlds(state, dt, worldDt);
      updateEntities(state.entities, state.bounds, worldDt);
      updateWisp(state, dt, state.settings.reduceMotion);
      if ((state.tier || 0) === 0 && state.run.time > 8.5 && !state.seenHints.newborn && !state.tierBanner) {
        game.hud.hint("newborn", "You've just been born. Drift and gather the dust.", 5200);
      }
      if (wisp.isActive() && !state.seenHints.wisp_witness && state.run.time > 4 && !state.tierBanner) {
        game.hud.hint("wisp_witness", `A little light has found you. ${state.settings.wispName || "Wisp"} will glow with you each time you grow into a new scale${state.mode === "zen" ? ", and breathe beside you here" : ""}.`, 6500);
      }
      if (updatePowerups(state, dt)) {
        audio.playPowerupSpawn();
        game.hud.hint("pu_first", "A power-up appeared! Grab the glowing orb", 2600);
      }
      game.feeding.update(dt);
      updateDiscoveries(state, dt, game.run.onDiscovery);
      game.run.update(dt);
      if (state.mode === "zen") game.zen.update(dt, now);
      if (state.discoveryNear && state.discoveryNear.q > 0.3) game.hud.hint("discovery_near", "Something rare is shimmering nearby. Follow the soft glow.", 4200);
      state.galaxyProgress = game.galaxy.progress();
      if (!state.transitioning) { game.growth.check(); game.galaxyFlow.checkNudge(); }
      game.player.updateTrail(dt);
      ui.updatePowerupBar(state);
      game.hud.sync();
    }
    if (state.tierBanner) game.overlay.tick(dt);
    game.growth.update(dt);
    game.fx.update(dt, getArtQuality());
    game.inflow.configure(getArtQuality() === "high", !!state.settings.reduceMotion);
    game.inflow.update(state.paused ? 0 : dt);
    state.gulp *= Math.pow(0.9, dt);

    game.scene.draw(now, dt, inPlay);

    game.perf.track(performance.now() - t0, dt, rawDt * 16.67);

    if (inPlay && state.comboCount >= 3 && !state.transitioning) game.overlay.drawCombo(game.display.w, game.display.h, state.zoom);
  }
}
