// ─── Settings ───
// Player settings applied to the page, audio and art: touch mode, Soft palette,
// Reduce Motion, mix, quality (art + canvas sharpness) and the hole's skin.

import * as audio from "../audio.js";
import { save } from "../save.js";
import { setSoftPalette, invalidateStarfield } from "../render.js";
import { setArtQuality } from "../art.js";
import { SKINS, hasMilestone } from "../ascension.js";

export class Settings {
  constructor(game) {
    this.game = game;
    this.state = game.state;
    const state = this.state;
    state.setSetting = (key, val) => {
      state.settings[key] = val;
      if (key === "quality") {
        game.perf.p.over = 0;
        this.applyQuality(val === "balanced" ? "balanced" : "high");
      }
      this.apply();
      game.hud.sync(true);
      save(state);
    };
    state.setTouchMode = mode => state.setSetting("touchMode", mode);
  }

  apply() {
    const st = this.state.settings;
    this.game.input.setTouchMode(st.touchMode);
    document.body.classList.toggle("soft-palette", !!st.softPalette);
    setSoftPalette(!!st.softPalette);
    document.body.classList.toggle("reduce-motion", !!st.reduceMotion);
    audio.setMix({ music: st.musicVol ?? 0.6, sfx: st.sfxVol ?? 0.6, musicOn: st.musicOn !== false, sfxOn: st.sfxOn !== false });
  }

  applyQuality(q) {
    setArtQuality(q);
    if (this.game.display.setCap(q === "high" ? 2 : 1.5)) invalidateStarfield();
  }

  /** CSS filter for the hole's skin ("" for classic or a locked skin). */
  skinFilter() {
    const state = this.state;
    const sk = SKINS.find(s => s.id === state.settings.skin);
    if (!sk || sk.id === "classic") return "";
    if (sk.unlock && !hasMilestone(state.asc, sk.unlock)) return "";
    return `hue-rotate(${sk.hue || 0}deg) saturate(${sk.sat ?? 1}) brightness(${sk.bright ?? 1})`;
  }
}
