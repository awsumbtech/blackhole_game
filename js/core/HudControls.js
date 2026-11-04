// v9.5.2 Controls bar: one owner for the bottom bar (pause, sound, volume,
// stats, restart) and the calm restart confirm. Sizes live in css/game.css
// :root (--tap, --bar-h, --hud-label); HUD_TAP mirrors --tap for tests.
// game.js passes hooks; this class only touches the bar's DOM.

export const HUD_TAP = 44;   // min touch target, CSS px (WCAG 2.5.5 / Material 48dp-ish)

const PAUSE_SVG = '<svg width="20" height="20" viewBox="0 0 18 18" fill="currentColor"><rect x="4" y="3" width="3" height="12" rx="1"/><rect x="11" y="3" width="3" height="12" rx="1"/></svg>';
const PLAY_SVG = '<svg width="20" height="20" viewBox="0 0 18 18" fill="currentColor"><polygon points="5,3 15,9 5,15"/></svg>';

export class HudControls {
  // hooks: { pause(), restart(), canRestart() -> bool, galaxy() -> n,
  //          toggleAudio() -> on, setVolume(v 0..1), stats(), hold(open), click() }
  constructor($, hooks) {
    this.$ = $;
    this.h = hooks;
    this.confirmEl = $("restart-confirm");
  }

  bind() {
    const { $, h } = this;
    $("btn-pause").addEventListener("click", () => h.pause());
    $("btn-restart").addEventListener("click", () => this.askRestart());
    $("btn-audio").addEventListener("click", () => this.setAudio(h.toggleAudio()));
    $("volume-slider").addEventListener("input", e => h.setVolume(Number(e.target.value) / 100));
    $("btn-stats").addEventListener("click", () => h.stats());
    $("btn-restart-keep").addEventListener("click", () => { h.click(); this.closeConfirm(); });
    $("btn-restart-yes").addEventListener("click", () => { h.click(); this.closeConfirm(); h.restart(); });
    // tap the dim backdrop = keep drifting
    this.confirmEl.addEventListener("click", e => { if (e.target === this.confirmEl) this.closeConfirm(); });
    return this;
  }

  setPaused(p) { this.$("btn-pause").innerHTML = p ? PLAY_SVG : PAUSE_SVG; }
  setAudio(on) { this.$("btn-audio").classList.toggle("audio-off", !on); }
  setVolume(v) { this.$("volume-slider").value = Math.round(v * 100); }

  // Restart never fires on one tap: a quiet card asks first.
  askRestart() {
    if (!this.h.canRestart()) return;
    this.$("restart-sub").textContent = `Galaxy ${this.h.galaxy()} begins again at the size you entered it. Your stars, map and records stay.`;
    this.confirmEl.classList.remove("hidden");
    this.h.hold(true);
    this.$("btn-restart-keep").focus({ preventScroll: true });
  }
  isConfirmOpen() { return !this.confirmEl.classList.contains("hidden"); }
  closeConfirm() {
    if (!this.isConfirmOpen()) return;
    this.confirmEl.classList.add("hidden");
    this.h.hold(false);
  }
}
