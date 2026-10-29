// ─── DevMode (v9.3) ───
// A hidden play-test sandbox. Pick any galaxy, biome, scale, run depth or Zen,
// then poke the game (events, tier-ups, the wisp, perf, freeze, collapse) without
// touching the real save: the save is snapshotted on entry, every write is
// suspended while inside, and exit restores the snapshot and reloads to the title.
//
// Unlock: open the game with ?dev, or tap the version line in Settings 7 times.
// The flag lives in localStorage "bh_dev" (separate from the save); the panel
// has a switch to turn it off again.
//
// Public surface (all the game needs):
//   new DevMode(hooks)        hooks: see constructor
//   DevMode.recover(key)      static, call before load(): undoes a sandbox that never exited
//   dev.tapVersion()          the Settings version line was tapped
//   dev.sandbox               true while inside a sandbox run
//   dev.frozen                true while time is frozen

const FLAG = "bh_dev", SNAP = "bh_dev_snap", ACTIVE = "bh_dev_active";
const TAPS = 7, TAP_WINDOW = 2500;

export class DevMode {
  /**
   * @param {object} h {
   *   saveKey, setSaveSuspended(on), biomes: [name], tiers: [name], events: [{id, name}],
   *   biomeFor(galaxy) -> name, current() -> { galaxy, tier, depth, zen, wisp },
   *   start(cfg), fireEvent(id), tierUp(), setWisp(on), collapse(), perf(), hint(text),
   *   reloadToTitle()
   * }
   */
  constructor(h) {
    this.h = h;
    this.frozen = false;
    this.perfOn = false;
    this.sandbox = false;
    this._taps = 0; this._tapAt = 0; this._perfTimer = 0;
    this.cfg = { galaxy: 2, biome: "", tier: 1, depth: 0, zen: false, wisp: false };
    let url = false;
    try { url = new URLSearchParams(location.search).has("dev"); } catch {}
    if (url) this._setFlag(true);
    this.enabled = this._getFlag();
    this._build();
    this._sync();
  }

  /** If the page reloaded mid-sandbox (crash, update), put the real save back. */
  static recover(saveKey) {
    try {
      if (sessionStorage.getItem(ACTIVE) !== "1") return false;
      const snap = sessionStorage.getItem(SNAP);
      if (snap === null || snap === "__none__") localStorage.removeItem(saveKey);
      else localStorage.setItem(saveKey, snap);
      sessionStorage.removeItem(ACTIVE); sessionStorage.removeItem(SNAP);
      return true;
    } catch { return false; }
  }

  tapVersion() {
    const now = performance.now();
    if (now - this._tapAt > TAP_WINDOW) this._taps = 0;
    this._tapAt = now;
    if (++this._taps < TAPS) return;
    this._taps = 0;
    this._setFlag(true);
    this.enabled = true;
    this._sync();
    this.h.hint?.("Dev mode on. Tap the DEV button to open the play-test panel.");
  }

  // ─── sandbox ───
  enter() {
    const h = this.h;
    if (!this.sandbox) {
      try {
        const snap = localStorage.getItem(h.saveKey);
        sessionStorage.setItem(SNAP, snap === null ? "__none__" : snap);
        sessionStorage.setItem(ACTIVE, "1");
      } catch {}
      h.setSaveSuspended(true);
      this.sandbox = true;
    }
    this.frozen = false;
    h.start({ ...this.cfg });
    this.close();
    this._sync();
  }

  exit() {
    const h = this.h;
    if (!this.sandbox) return;
    try {
      const snap = sessionStorage.getItem(SNAP);
      if (snap === "__none__") localStorage.removeItem(h.saveKey);
      else if (snap !== null) localStorage.setItem(h.saveKey, snap);
      sessionStorage.removeItem(ACTIVE); sessionStorage.removeItem(SNAP);
    } catch {}
    this.sandbox = false;
    h.reloadToTitle();   // save stays suspended until the reload: nothing can leak back
  }

  // ─── panel ───
  open() { this._render(); this.panel.classList.remove("hidden"); }
  close() { this.panel.classList.add("hidden"); }

  _getFlag() { try { return localStorage.getItem(FLAG) === "1"; } catch { return false; } }
  _setFlag(on) { try { on ? localStorage.setItem(FLAG, "1") : localStorage.removeItem(FLAG); } catch {} }

  _build() {
    const b = this.badge = document.createElement("button");
    b.id = "dev-badge"; b.type = "button"; b.className = "dev-badge hidden"; b.textContent = "DEV";
    b.addEventListener("click", e => { e.stopPropagation(); this.panel.classList.contains("hidden") ? this.open() : this.close(); });
    const p = this.panel = document.createElement("div");
    p.id = "dev-panel"; p.className = "dev-panel hidden";
    p.addEventListener("click", e => this._onClick(e));
    p.addEventListener("change", e => this._onChange(e));
    for (const ev of ["pointerdown", "touchstart", "mousedown"]) p.addEventListener(ev, e => e.stopPropagation());
    const o = this.perfEl = document.createElement("div");
    o.id = "dev-perf"; o.className = "dev-perf hidden";
    document.body.append(b, p, o);
  }

  _sync() {
    this.badge.classList.toggle("hidden", !this.enabled);
    this.badge.classList.toggle("on", this.sandbox);
    this.badge.textContent = this.sandbox ? "DEV · sandbox" : "DEV";
    document.body.classList.toggle("dev-sandbox", this.sandbox);
  }

  _render() {
    const h = this.h, c = this.cfg, live = this.sandbox;
    const auto = h.biomeFor(c.galaxy);
    const opt = (v, t, sel) => `<option value="${v}"${sel ? " selected" : ""}>${t}</option>`;
    const step = (k, v) => `<div class="dev-step"><button data-a="dec" data-k="${k}">−</button><b>${v}</b><button data-a="inc" data-k="${k}">+</button></div>`;
    const tog = (k, on, label) => `<button class="dev-tog${on ? " on" : ""}" data-a="tog" data-k="${k}">${label}: ${on ? "on" : "off"}</button>`;
    this.panel.innerHTML = `
      <div class="dev-card">
        <div class="dev-head"><span>Play-test</span><button class="dev-x" data-a="close" aria-label="Close">✕</button></div>
        <div class="dev-note">${live ? "Sandbox run: nothing here is saved. Exit returns you to the title with your real journey intact." : "Start a sandbox run. Your real save is set aside and comes back untouched."}</div>
        <div class="dev-sec">
          <label>Galaxy</label>${step("galaxy", c.galaxy)}
          <label>Biome</label><select data-k="biome">${opt("", "Auto (" + auto + ")", !c.biome)}${h.biomes.map(n => opt(n, n, c.biome === n)).join("")}</select>
          <label>Scale</label><select data-k="tier">${h.tiers.map((n, i) => opt(i, i + " · " + n, +c.tier === i)).join("")}</select>
          <label>Run depth</label>${step("depth", c.depth)}
          <div class="dev-row">${tog("zen", c.zen, "Zen")}${tog("wisp", c.wisp, "Companion")}</div>
          <button class="dev-go" data-a="start">${live ? "Restart sandbox with these" : "Start sandbox run"}</button>
        </div>
        ${live ? `
        <div class="dev-sec">
          <label>Events</label>
          <div class="dev-grid">${h.events.map(e => `<button data-a="ev" data-id="${e.id}">${e.name}</button>`).join("")}</div>
          <label>Grow</label>
          <div class="dev-row"><button data-a="tier">Tier up (reveal + merge)</button><button data-a="collapse">Collapse prompt</button></div>
          <label>Live</label>
          <div class="dev-row">${tog("liveWisp", this.h.current().wisp, "Wisp")}${tog("freeze", this.frozen, "Freeze time")}</div>
        </div>` : ""}
        <div class="dev-sec">
          <div class="dev-row">${tog("perf", this.perfOn, "FPS overlay")}</div>
          ${live ? `<button class="dev-exit" data-a="exit">Exit sandbox (back to title)</button>` : ""}
          <button class="dev-off" data-a="off">Turn dev mode off</button>
        </div>
      </div>`;
  }

  _onClick(e) {
    const t = e.target.closest("button");
    if (e.target === this.panel) { this.close(); return; }
    if (!t) return;
    const a = t.dataset.a, k = t.dataset.k, c = this.cfg, h = this.h;
    if (a === "close") return this.close();
    if (a === "inc" || a === "dec") {
      const d = a === "inc" ? 1 : -1;
      if (k === "galaxy") c.galaxy = Math.max(1, Math.min(99, c.galaxy + d));
      if (k === "depth") c.depth = Math.max(0, Math.min(60, c.depth + d));
    } else if (a === "tog") {
      if (k === "zen" || k === "wisp") c[k] = !c[k];
      if (k === "liveWisp") h.setWisp(!h.current().wisp);
      if (k === "freeze") this.frozen = !this.frozen;
      if (k === "perf") this._perf(!this.perfOn);
    } else if (a === "start") return this.enter();
    else if (a === "ev") { h.fireEvent(t.dataset.id); return this.close(); }
    else if (a === "tier") { h.tierUp(); return this.close(); }
    else if (a === "collapse") { this.close(); return h.collapse(); }
    else if (a === "exit") return this.exit();
    else if (a === "off") {
      this._setFlag(false); this.enabled = false; this._perf(false); this.close();
      if (this.sandbox) return this.exit();
      return this._sync();
    }
    this._render();
  }

  _onChange(e) {
    const k = e.target.dataset.k;
    if (k === "biome") this.cfg.biome = e.target.value;
    if (k === "tier") this.cfg.tier = +e.target.value;
  }

  _perf(on) {
    this.perfOn = on;
    this.perfEl.classList.toggle("hidden", !on);
    clearInterval(this._perfTimer);
    if (!on) return;
    let last = performance.now(), frames = 0, fps = 0;
    const count = () => { frames++; if (this.perfOn) requestAnimationFrame(count); };
    requestAnimationFrame(count);
    this._perfTimer = setInterval(() => {
      const now = performance.now();
      fps = Math.round(frames * 1000 / (now - last)); frames = 0; last = now;
      const r = this.h.perf();
      this.perfEl.textContent = `${fps} fps · work ${r.avg}ms (p95 ${r.p95}) · ${r.quality} · ${r.entities} things`;
    }, 500);
  }
}
